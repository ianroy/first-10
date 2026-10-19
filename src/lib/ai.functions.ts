import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { aiRequestSchema } from "./ai/contracts";
import { requestStructuredDraft } from "./ai/gateway.server";
import { loadBoundedAIContext } from "./ai/context.server";
import { validateGroundedOutput } from "./prompts/grounding-v2";
import { prepareProvenanceWriter } from "./prompts/provenance.server";
import { budgetInputBinding, prepareAIBudget, trustedGatewayUsage } from "./ai/budget.server";
import {
  preflightEvaluationKey,
  verifyEvaluationIdentity,
  verifyEvaluationRoute,
} from "./ai/evaluation.server";
import { evaluationReceiptSchema } from "./ai/evaluation-contract";
import { runRuntimeEvaluation } from "./ai/runtime-evaluation.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const generateAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aiRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    if (data.kind === "runtime_evaluation") {
      if (!data.evaluationCaseId) throw new Error("A fixed evaluation case is required.");
      return runRuntimeEvaluation({
        supabase: sb,
        userId: context.userId,
        projectId: data.projectId,
        operationId: data.operationId,
        caseId: data.evaluationCaseId,
      });
    }
    if (data.withEvaluation) await verifyEvaluationIdentity(sb, context.userId);
    const { data: p, error: projectError } = await sb
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (projectError || !p || p.user_id !== context.userId || p.archived_at)
      throw new Error("Project not found or access unavailable.");
    // Preserve historical receipts and the permanent carveout without reopening
    // the retiring model when the general ledger's stop is later released.
    if (data.kind === "marketing_demo")
      throw new Error(
        "This older fictional practice is paused. Your saved draft remains available.",
      );
    const initial = await loadBoundedAIContext(
      sb as unknown as Pick<SupabaseClient, "rpc">,
      { type: "owner_project", projectId: p.id },
      data.kind,
    );
    const { contract, assembled, packed } = initial;
    const recordSuccess = await prepareProvenanceWriter({
      supabase: sb,
      userId: context.userId,
      projectId: p.id,
      projectOwnerId: p.user_id,
      contract,
    });
    const key = process.env["OPENROUTER_API_KEY"]?.trim();
    if (!key || key === "[SENSITIVE]")
      throw new Error(
        "AI is not configured. Continue manually; your saved work remains available.",
      );
    if (assembled.system.length + assembled.user.length > 40_000)
      throw new Error("There is too much context for this draft. Narrow it or continue manually.");
    const budget = await prepareAIBudget({
      supabase: sb,
      operationId: data.operationId,
      userId: context.userId,
      projectId: p.id,
      projectOwnerId: p.user_id,
      kind: data.kind,
      context: assembled,
      contextFence: packed.manifest(budgetInputBinding(assembled).contextSha256),
    });
    let claimStarted = false;
    try {
      if (budget.route.purpose === "eval_only" && !data.withEvaluation)
        throw new Error("Use the bounded synthetic evaluation receipt for this route.");
      const { data: fresh, error: freshError } = await sb
        .from("projects")
        .select("*")
        .eq("id", p.id)
        .eq("user_id", context.userId)
        .single();
      if (freshError || !fresh || fresh.user_id !== context.userId || fresh.archived_at)
        throw new Error("Project access changed. Continue manually.");
      const current = await loadBoundedAIContext(
        sb as unknown as Pick<SupabaseClient, "rpc">,
        { type: "owner_project", projectId: p.id },
        data.kind,
      );
      if (
        budgetInputBinding(current.assembled).contextSha256 !==
        budgetInputBinding(assembled).contextSha256
      )
        throw new Error(
          "AI processing choices or source material changed. Review the current material before requesting a new draft.",
        );
      if (data.withEvaluation) {
        await verifyEvaluationIdentity(sb, context.userId);
        verifyEvaluationRoute(
          budget.route,
          context.userId,
          p.id,
          budgetInputBinding(assembled).contextSha256,
        );
        await preflightEvaluationKey(key, budget.route);
      }
      claimStarted = true; // Set BEFORE awaiting: a lost acknowledgement must never permit cancellation/dispatch.
      const claim = await budget.claim();
      let result;
      try {
        result = await requestStructuredDraft({
          key,
          referer: process.env["APP_URL"],
          system: assembled.system,
          user: assembled.user,
          kind: data.kind,
          schema: contract.schema,
          route: budget.route,
          outputValidator: (value) =>
            validateGroundedOutput(
              data.kind as "questions" | "synthesis" | "stage2" | "stage3",
              value,
              packed.sources,
              packed.omissions,
            ),
        });
      } catch (error) {
        const metadata =
          error !== null && typeof error === "object" && "metadata" in error
            ? error.metadata
            : null;
        const usage = trustedGatewayUsage(metadata, false);
        // Invalid/refused/truncated output can still be billed. A failed ack remains held; never retry generation.
        if (usage) {
          try {
            await budget.settle(usage);
          } catch {
            /* result is intentionally withheld */
          }
        } else {
          try {
            await budget.markUnknown();
          } catch {
            /* no refund on ambiguous accounting */
          }
        }
        throw error;
      }
      const usage = trustedGatewayUsage(result, true);
      if (!usage) {
        try {
          await budget.markUnknown(result.generationId);
        } catch {
          /* full hold retained */
        }
        throw new Error(
          "The AI request cost could not be confirmed. Continue manually; your saved work is unchanged.",
        );
      }
      await budget.settle(usage);
      const grounded = result.data;
      const originId = await recordSuccess(result, {
        operationId: data.operationId,
        grounding: grounded.receipt,
      });
      if (data.withEvaluation)
        return {
          draft: grounded.draft,
          grounding: grounded.grounding,
          evaluation: evaluationReceiptSchema.parse({
            operationId: data.operationId,
            attemptId: claim.attemptId,
            contextSha256: budgetInputBinding(assembled).contextSha256,
            routeVersion: budget.route.version,
            originId,
            model: result.actualModel,
            provider: result.provider,
            generationId: result.generationId,
            attempts: result.attempts,
            finishReason: result.finishReason,
            latencyMs: result.latencyMs,
            usage: result.usage,
          }),
        };
      return data.withOrigin ? { data: grounded.draft, originId } : grounded.draft;
    } catch (error) {
      if (!claimStarted) {
        try {
          await budget.cancelBeforeDispatch();
        } catch {
          /* uncertain holds are never released automatically */
        }
      }
      throw error;
    }
  });
