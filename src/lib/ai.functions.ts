import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { aiRequestSchema } from "./ai/contracts";
import { generateFictionalMarketingPractice } from "./ai/demo-marketing.server";
import { requestStructuredDraft } from "./ai/gateway.server";
import { loadBoundedAIContext } from "./ai/context.server";
import { validateGroundedOutput } from "./prompts/grounding-v2";
import { prepareProvenanceWriter } from "./prompts/provenance.server";
import { budgetInputBinding, prepareAIBudget, trustedGatewayUsage } from "./ai/budget.server";
import type { SupabaseClient } from "@supabase/supabase-js";

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
