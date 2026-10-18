import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { GroundingReceipt } from "./grounding-v2";

type Contract = {
  kind: "questions" | "synthesis" | "stage2" | "stage3";
  promptId: string;
  promptVersion: number;
  schemaId: string;
  schemaVersion: number;
};
type Metadata = {
  requestedModel: string;
  actualModel: string | null;
  generationId: string | null;
  provider: string | null;
  usage: unknown;
  attempts: number;
};
const label = (v: unknown) =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= 200 &&
  !Array.from(v).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ? v
    : null;
const number = (v: unknown, integer = false) =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= (integer ? 2147483647 : 1000000) &&
  (!integer || Number.isInteger(v))
    ? v
    : null;

/** Explicit allowlist: never store provider response envelopes, prompts or generated text. */
export function generationRecord(
  scope: { requestId: string; userId: string; projectId: string; contract: Contract },
  result: Metadata,
) {
  const usage =
    result.usage !== null && typeof result.usage === "object"
      ? (result.usage as Record<string, unknown>)
      : {};
  return {
    request_id: scope.requestId,
    user_id: scope.userId,
    project_id: scope.projectId,
    kind: scope.contract.kind,
    prompt_id: scope.contract.promptId,
    prompt_version: scope.contract.promptVersion,
    schema_id: scope.contract.schemaId,
    schema_version: scope.contract.schemaVersion,
    requested_model: label(result.requestedModel),
    actual_model: label(result.actualModel),
    requested_provider: null,
    actual_provider: label(result.provider),
    provider_generation_id: label(result.generationId),
    prompt_tokens: number(usage["prompt_tokens"], true),
    completion_tokens: number(usage["completion_tokens"], true),
    total_tokens: number(usage["total_tokens"], true),
    cost_usd: number(usage["cost"]),
    attempts: result.attempts,
  };
}
type GenerationRecord = ReturnType<typeof generationRecord>;
// Narrow RPC boundary until the generated database definitions include this migration.
type ProvenanceClient = {
  rpc(
    name: "record_ai_generation" | "record_ai_generation_v2",
    args: { p_record: GenerationRecord; p_operation_id?: string; p_grounding?: GroundingReceipt },
  ): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
};

export async function prepareProvenanceWriter(scope: {
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
  projectOwnerId: string;
  contract: Contract;
}) {
  const authorization = getRequest().headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || scope.projectOwnerId !== scope.userId)
    throw new Error("Project access could not be verified.");
  const { data, error } = await scope.supabase.auth.getUser(token);
  if (error || data.user?.id !== scope.userId)
    throw new Error("Project access could not be verified. Sign in again.");
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"])
    throw new Error("AI recording is not configured. Your saved work is still available.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as ProvenanceClient;
  const requestId = crypto.randomUUID();
  return async (
    result: Metadata,
    context?: { operationId: string; grounding: GroundingReceipt },
  ) => {
    if (scope.contract.promptVersion === 2 && !context)
      throw new Error("A source receipt is required for this AI draft.");
    // The service-only RPC rechecks current project ownership in the same transaction as the insert.
    try {
      const saved = await client
        .rpc(
          scope.contract.promptVersion === 2 ? "record_ai_generation_v2" : "record_ai_generation",
          {
            ...(context
              ? { p_operation_id: context.operationId, p_grounding: context.grounding }
              : {}),
            p_record: generationRecord({ ...scope, requestId }, result),
          },
        )
        .abortSignal(AbortSignal.timeout(10_000));
      if (saved.error || saved.data !== requestId) throw new Error("record unavailable");
      return requestId;
    } catch {
      // Never retry a paid generation because its audit write failed; never expose database/provider payloads.
      throw new Error(
        "The AI draft could not be recorded. Your saved work is unchanged; requesting again makes a new AI request.",
      );
    }
  };
}
