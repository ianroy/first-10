import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleAIContextV2 } from "../prompts/context-v2";
import type { ExistingKind } from "../prompts/private-v1";
export type AIContextScope =
  | { type: "owner_project"; projectId: string }
  | { type: "class_submission" | "teaching_resource" | "platform_aggregate"; id: string };
/** Future teacher/submission/admin contexts require their own authorized adapters; never reuse private ownership. */
export async function loadBoundedAIContext(
  client: Pick<SupabaseClient, "rpc">,
  scope: AIContextScope,
  kind: ExistingKind,
) {
  if (scope.type !== "owner_project") throw new Error("This AI context scope is not available.");
  let response;
  try {
    response = await client
      .rpc("get_ai_processing_context_v2", { p_project_id: scope.projectId, p_kind: kind })
      .abortSignal(AbortSignal.timeout(10000));
  } catch {
    throw new Error("The AI processing choices could not be verified. Continue manually.");
  }
  const result = response.data as { ok?: boolean; data?: unknown; code?: string } | null;
  if (response.error || !result || result.ok !== true) {
    const limit = result?.code === "SOURCE_COUNT_LIMIT" || result?.code === "PROJECT_CONTEXT_LIMIT";
    throw new Error(
      limit
        ? "This project exceeds the AI context limit. Continue manually; all original records remain saved."
        : "AI processing is not enabled for this idea or its sources. Review the saved privacy choices; manual work remains available.",
    );
  }
  return assembleAIContextV2(result.data, scope.projectId, kind);
}
