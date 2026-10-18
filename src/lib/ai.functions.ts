import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { aiRequestSchema } from "./ai/contracts";
import { generateFictionalMarketingPractice } from "./ai/demo-marketing.server";
import { requestStructuredDraft } from "./ai/gateway.server";
import { getPrivateContract } from "./prompts/private-v1";
import { prepareProvenanceWriter } from "./prompts/provenance.server";

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
    const [interviewResult, learningResult, contactResult] = await Promise.all([
      sb.from("interviews").select("answers,tags").eq("project_id", p.id).eq("completed", true),
      sb
        .from("learnings")
        .select("title,body,data,kind")
        .eq("project_id", p.id)
        .eq("accepted", true),
      sb.from("contacts").select("relation,why,source,stage").eq("project_id", p.id),
    ]);
    if (interviewResult.error || learningResult.error || contactResult.error)
      throw new Error("Could not load the project evidence. Your saved work is unchanged.");
    const interviews = interviewResult.data;
    const learnings = learningResult.data;
    const contacts = contactResult.data;
    const ctx = [
      `APP: ${p.name}\nWhat it does: ${p.description}\nWho it's for: ${p.audience}\nProblem: ${p.problem}`,
      data.kind !== "questions" && interviews?.length
        ? `INTERVIEWS:\n${JSON.stringify(interviews).slice(0, 14000)}`
        : "",
      data.kind !== "questions" && data.kind !== "synthesis" && learnings?.length
        ? `ACCEPTED LEARNINGS:\n${JSON.stringify(learnings).slice(0, 6000)}`
        : "",
      data.kind === "stage2"
        ? `CONTACT SOURCES:\n${JSON.stringify(contacts ?? []).slice(0, 3000)}`
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
    await recordSuccess(result);
    // Keep all four strict legacy response objects unchanged.
    return result.data;
  });
