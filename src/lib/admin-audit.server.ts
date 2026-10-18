import type { PlatformAdminClient } from "./admin-auth.server";

export type PlatformAdminOperation =
  "operational_snapshot" | "ai_usage_snapshot" | "funnel_snapshot";
export type PlatformAdminOutcome = "ready" | "partial" | "unavailable";
const operations = new Set<PlatformAdminOperation>([
  "operational_snapshot",
  "ai_usage_snapshot",
  "funnel_snapshot",
]);
const outcomes = new Set<PlatformAdminOutcome>(["ready", "partial", "unavailable"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Call before returning privileged aggregates. Audit failure withholds the response.
 * The RPC rechecks the current database role, including after a concurrent revocation.
 * This function cannot grant a role, read private text or attach arbitrary audit payloads.
 */
export async function auditPlatformAdminAction(
  client: PlatformAdminClient,
  action: { operation: PlatformAdminOperation; outcome: PlatformAdminOutcome; requestId: string },
): Promise<string> {
  try {
    if (
      !operations.has(action.operation) ||
      !outcomes.has(action.outcome) ||
      !uuid.test(action.requestId)
    )
      throw new Error("invalid");
    const result = await client
      .rpc("record_platform_admin_action", {
        p_operation: action.operation,
        p_outcome: action.outcome,
        p_request_id: action.requestId,
      })
      .abortSignal(AbortSignal.timeout(8000));
    if (result.error || typeof result.data !== "string" || !uuid.test(result.data))
      throw new Error("unavailable");
    return result.data;
  } catch {
    throw new Error("Admin action could not be recorded. No aggregate response is available.");
  }
}
