import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";
import { requireAIReadinessViewer } from "./readiness-access.server";
import { getRuntimeEvaluationCase } from "./runtime-evaluation-plan.ts";
import {
  runtimeCaseOperationId,
  runtimeEvaluationReceiptSchema,
  RUNTIME_EVALUATION_VERSION,
  type RuntimeCaseId,
} from "./runtime-evaluation-contract.ts";
import { prepareAIBudget, trustedGatewayUsage } from "./budget.server";
import type { BudgetRoute } from "./budget-contract";
import { requestStructuredDraft } from "./gateway.server";
import { validateGroundedOutput } from "../prompts/grounding-v2.ts";
import { LIVE_AI_CANDIDATE } from "./model-policy";
import { inspectRuntimeAIKey } from "./readiness.server";

export const runtimeEvaluationPolicy: { expectedWorkspaceId: string | null } = {
  // Set only after matching the serving key to the reviewed account/workspace.
  expectedWorkspaceId: null,
};
const failure = () =>
  new Error(
    "The fixed model check is unavailable. No replacement request will be started automatically.",
  );
export function verifyRuntimeEvaluationRoute(route: BudgetRoute, kind: string) {
  const p = LIVE_AI_CANDIDATE;
  if (
    route.kind !== kind ||
    route.purpose !== "eval_only" ||
    route.model !== p.model ||
    route.provider_slug !== p.providerSlug ||
    route.response_providers.length !== 1 ||
    route.response_providers[0] !== p.responseProvider ||
    route.input_token_ceiling !== p.inputTokenCeiling ||
    route.output_token_ceiling !== p.billableOutputTokenCeiling ||
    route.prompt_micro_per_million !== p.promptMicroPerMillion ||
    route.completion_micro_per_million !== p.completionMicroPerMillion
  )
    throw failure();
}

/** Fixed authored fixtures only. Never reads editable project content or student notes. */
export async function runRuntimeEvaluation(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
  operationId: string;
  caseId: RuntimeCaseId;
}) {
  if (input.operationId !== runtimeCaseOperationId(input.caseId)) throw failure();
  const authorization = getRequest().headers.get("authorization");
  const viewer = await requireAIReadinessViewer(input.supabase, authorization, input.projectId);
  if (viewer.kind !== "fictional_presenter" || viewer.userId !== input.userId) throw failure();
  const fixed = getRuntimeEvaluationCase(input.caseId);
  const key = process.env["OPENROUTER_API_KEY"]?.trim();
  // Source-only bootstrap stays closed until actual account policy is reviewed.
  if (!runtimeEvaluationPolicy.expectedWorkspaceId || !key) throw failure();
  const readiness = await inspectRuntimeAIKey(key);
  if (
    readiness.status !== "verified" ||
    readiness.workspaceId !== runtimeEvaluationPolicy.expectedWorkspaceId ||
    readiness.managementKey ||
    readiness.remainingUsd === null ||
    readiness.remainingUsd < 0.360448
  )
    throw failure();
  const budget = await prepareAIBudget({
    supabase: input.supabase,
    userId: input.userId,
    projectOwnerId: input.userId,
    projectId: input.projectId,
    operationId: input.operationId,
    kind: fixed.kind,
    context: fixed.assembled,
  });
  let claimStarted = false;
  try {
    verifyRuntimeEvaluationRoute(budget.route, fixed.kind);
    const fresh = await requireAIReadinessViewer(input.supabase, authorization, input.projectId);
    if (fresh.kind !== "fictional_presenter" || fresh.userId !== input.userId) throw failure();
    claimStarted = true;
    await budget.claim();
    let result;
    try {
      result = await requestStructuredDraft({
        key,
        kind: fixed.kind,
        system: fixed.assembled.system,
        user: fixed.assembled.user,
        schema: fixed.contract.schema,
        route: budget.route,
        outputValidator: (v) =>
          validateGroundedOutput(fixed.kind, v, fixed.packed.sources, fixed.packed.omissions),
      });
    } catch (error) {
      const metadata =
        error !== null && typeof error === "object" && "metadata" in error ? error.metadata : null;
      const usage = trustedGatewayUsage(metadata, false);
      if (usage) await budget.settle(usage).catch(() => undefined);
      else await budget.markUnknown().catch(() => undefined);
      throw failure();
    }
    const usage = trustedGatewayUsage(result, true);
    if (!usage) {
      await budget.markUnknown(result.generationId).catch(() => undefined);
      throw failure();
    }
    await budget.settle(usage);
    const recipient = await requireAIReadinessViewer(
      input.supabase,
      authorization,
      input.projectId,
    );
    if (recipient.kind !== "fictional_presenter" || recipient.userId !== input.userId)
      throw failure();
    const receipt = runtimeEvaluationReceiptSchema.parse({
      version: RUNTIME_EVALUATION_VERSION,
      caseId: fixed.id,
      kind: fixed.kind,
      operationId: input.operationId,
      contextSha256: fixed.binding.contextSha256,
      routeVersion: budget.route.version,
      model: result.actualModel,
      provider: result.provider,
      generationId: result.generationId,
      costUsd: usage.costUsd,
      latencyMs: result.latencyMs,
      draft: result.data.draft,
      grounding: result.data.grounding,
      fictional: true,
    });
    return { ...receipt, draft: result.data.draft, grounding: result.data.grounding };
  } catch {
    if (!claimStarted) await budget.cancelBeforeDispatch().catch(() => undefined);
    throw failure();
  }
}
