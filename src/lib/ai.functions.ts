import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { aiRequestSchema } from "./ai/contracts";
import { generateFictionalMarketingPractice } from "./ai/demo-marketing.server";
import { requestStructuredDraft } from "./ai/gateway.server";
import { getPrivateContract } from "./prompts/private-v1";
import { prepareProvenanceWriter } from "./prompts/provenance.server";
import { loadAIProcessingContext } from "./consent";
import { budgetInputBinding, prepareAIBudget, trustedGatewayUsage } from "./ai/budget.server";
import type { SupabaseClient } from "@supabase/supabase-js";

function assembledContext(
  permitted: Awaited<ReturnType<typeof loadAIProcessingContext>>,
  contract: ReturnType<typeof getPrivateContract>,
  kind: ReturnType<typeof getPrivateContract>["kind"],
) {
  const { interviews, learnings, contacts, excluded } = permitted;
  const safeProject = permitted.project;
  const ctx = [
    `APP: ${safeProject.name}\nWhat it does: ${safeProject.description}\nWho it's for: ${safeProject.audience}\nProblem: ${safeProject.problem}`,
    kind !== "questions" && interviews?.length
      ? `INTERVIEWS:\n${JSON.stringify(interviews).slice(0, 14000)}`
      : "",
    kind !== "questions" && kind !== "synthesis" && learnings?.length
      ? `ACCEPTED LEARNINGS:\n${JSON.stringify(learnings).slice(0, 6000)}`
      : "",
    kind === "stage2" ? `CONTACT SOURCES:\n${JSON.stringify(contacts ?? []).slice(0, 3000)}` : "",
    excluded.interviews + excluded.contacts + excluded.learnings > 0
      ? `PRIVACY LIMITS: ${excluded.interviews} interview records, ${excluded.contacts} contact records and ${excluded.learnings} learning records are withheld. Do not infer their content or treat the available material as complete evidence.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    system: contract.system,
    user: `${contract.task}\n\n${ctx}`,
    schema: contract.schema,
    promptId: contract.promptId,
    promptVersion: contract.promptVersion,
    schemaId: contract.schemaId,
    schemaVersion: contract.schemaVersion,
  };
}

export const generateAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aiRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: p, error: projectError } = await sb
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (projectError || !p || p.user_id !== context.userId || p.archived_at)
      throw new Error("Project not found or access unavailable.");
    if (data.kind === "marketing_demo")
      return generateFictionalMarketingPractice({
        supabase: sb,
        userId: context.userId,
        project: p,
        operationId: data.operationId,
      });
    const contract = getPrivateContract(data.kind);
    const recordSuccess = await prepareProvenanceWriter({
      supabase: sb,
      userId: context.userId,
      projectId: p.id,
      projectOwnerId: p.user_id,
      contract,
    });
    // Fresh user verification above, then an owner-scoped permission snapshot immediately
    // before the provider request. No raw child-table fallback when choices are unavailable.
    const permitted = await loadAIProcessingContext(
      sb as unknown as Pick<SupabaseClient, "rpc">,
      p.id,
      data.kind,
    );
    const assembled = assembledContext(permitted, contract, data.kind);
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
    });
    let claimStarted = false;
    try {
      const { data: fresh, error: freshError } = await sb
        .from("projects")
        .select("*")
        .eq("id", p.id)
        .eq("user_id", context.userId)
        .single();
      if (freshError || !fresh || fresh.user_id !== context.userId || fresh.archived_at)
        throw new Error("Project access changed. Continue manually.");
      const current = await loadAIProcessingContext(
        sb as unknown as Pick<SupabaseClient, "rpc">,
        p.id,
        data.kind,
      );
      if (
        budgetInputBinding(assembledContext(current, contract, data.kind)).contextSha256 !==
        budgetInputBinding(assembled).contextSha256
      )
        throw new Error(
          "AI processing choices or source material changed. Review the current material before requesting a new draft.",
        );
      claimStarted = true; // Set BEFORE awaiting: a lost acknowledgement must never permit cancellation/dispatch.
      await budget.claim();
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
      const originId = await recordSuccess(result);
      return data.withOrigin ? { data: result.data, originId } : result.data;
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
