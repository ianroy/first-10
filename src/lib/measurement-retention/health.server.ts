import type { PlatformAdminClient } from "../admin-auth.server";
import { requirePlatformAdmin } from "../admin-auth.server";
import { scheduledRetentionHealthSchema } from "./contracts";

/** Caller-bound admin access only; DB rechecks the grant and audits every delivered aggregate. */
export async function scheduledMeasurementRetentionHealth(
  client: PlatformAdminClient,
  authorization: string | null,
  requestId: string,
) {
  try {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new Error();
    await requirePlatformAdmin(client, authorization);
    const result = await client
      .rpc("get_product_measurement_retention_health_v2", { p_request_id: requestId })
      .abortSignal(AbortSignal.timeout(8000));
    const parsed = scheduledRetentionHealthSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new Error();
    return parsed.data;
  } catch {
    throw new Error("Scheduled measurement health unavailable.");
  }
}
