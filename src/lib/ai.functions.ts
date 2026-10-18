import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { aiRequestSchema } from "./ai/contracts";
import { generateFictionalMarketingPractice } from "./ai/demo-marketing.server";
import { requestStructuredDraft } from "./ai/gateway.server";
import { getPrivateContract } from "./prompts/private-v1";
import { prepareProvenanceWriter } from "./prompts/provenance.server";
import { loadAIProcessingContext } from "./consent";
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
    if (projectError || !p) throw new Error("Project not found or access unavailable.");
    if (data.kind === "marketing_demo")
      return generateFictionalMarketingPractice({
        supabase: sb,
        userId: context.userId,
        project: p,
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
    const { interviews, learnings, contacts, excluded } = permitted;
    const safeProject = permitted.project;
    const ctx = [
      `APP: ${safeProject.name}\nWhat it does: ${safeProject.description}\nWho it's for: ${safeProject.audience}\nProblem: ${safeProject.problem}`,
      data.kind !== "questions" && interviews?.length
        ? `INTERVIEWS:\n${JSON.stringify(interviews).slice(0, 14000)}`
        : "",
      data.kind !== "questions" && data.kind !== "synthesis" && learnings?.length
        ? `ACCEPTED LEARNINGS:\n${JSON.stringify(learnings).slice(0, 6000)}`
        : "",
      data.kind === "stage2"
        ? `CONTACT SOURCES:\n${JSON.stringify(contacts ?? []).slice(0, 3000)}`
        : "",
      excluded.interviews + excluded.contacts + excluded.learnings > 0
        ? `PRIVACY LIMITS: ${excluded.interviews} interview records, ${excluded.contacts} contact records and ${excluded.learnings} learning records are withheld. Do not infer their content or treat the available material as complete evidence.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await requestStructuredDraft({
      key: process.env["OPENROUTER_API_KEY"] ?? "",
      model: process.env["OPENROUTER_MODEL"],
      referer: process.env["APP_URL"],
      system: contract.system,
      user: `${contract.task}\n\n${ctx}`,
      kind: data.kind,
      schema: contract.schema,
    });
    const originId = await recordSuccess(result);
    // Opt-in receipt stays outside all four strict provider response objects.
    return data.withOrigin ? { data: result.data, originId } : result.data;
  });
