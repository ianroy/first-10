import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reservedMicro, type BudgetRoute } from "./budget-contract";
import { EVALUATION_KEY_CAP_USD } from "./evaluation-contract";

const denied = () =>
  new Error("The bounded synthetic evaluation is unavailable. No evaluation draft is returned.");
/** Fresh server-verified app metadata; browser claims/user metadata are never authority. */
export async function verifyEvaluationIdentity(client: SupabaseClient, userId: string) {
  const token = getRequest()
    .headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw denied();
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || data.user?.id !== userId || data.user.app_metadata?.["synthetic"] !== true)
      throw denied();
  } catch {
    throw denied();
  }
}
export function verifyEvaluationRoute(
  route: BudgetRoute,
  userId: string,
  projectId: string,
  contextHash: string,
) {
  if (
    route.purpose !== "eval_only" ||
    route.eval_user_id !== userId ||
    route.eval_project_id !== projectId ||
    !route.eval_context_sha256?.includes(contextHash)
  )
    throw denied();
}
/** Validates only bounded public billing metadata, never returns the API key or envelope. */
export function verifyEvaluationKeyMetadata(value: unknown, reservationUsd: number) {
  const d = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (
    !Number.isFinite(reservationUsd) ||
    reservationUsd <= 0 ||
    reservationUsd > EVALUATION_KEY_CAP_USD ||
    typeof d["limit"] !== "number" ||
    !Number.isFinite(d["limit"]) ||
    d["limit"] <= 0 ||
    d["limit"] > EVALUATION_KEY_CAP_USD ||
    d["limit_reset"] !== null ||
    d["include_byok_in_limit"] !== true ||
    d["is_management_key"] !== false ||
    typeof d["limit_remaining"] !== "number" ||
    !Number.isFinite(d["limit_remaining"]) ||
    d["limit_remaining"] < reservationUsd ||
    d["limit_remaining"] > d["limit"]
  )
    throw denied();
}
/** Same actual server key as generation. Fixed endpoint, no redirects, bounded body/deadline, no logs. */
export async function preflightEvaluationKey(key: string, route: BudgetRoute) {
  const signal = AbortSignal.timeout(5000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok || !response.body) throw denied();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16384) throw denied();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    verifyEvaluationKeyMetadata(envelope?.data, reservedMicro(route) / 1_000_000);
  } catch {
    throw denied();
  }
}
