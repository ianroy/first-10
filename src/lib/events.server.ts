import type { SupabaseClient } from "@supabase/supabase-js";
import { measurementResultSchema, retentionHealthSchema } from "./analytics-contracts";
import { requirePlatformAdmin } from "./admin-auth.server";

export type MeasurementClient = Pick<SupabaseClient, "auth" | "rpc">;
/** Request-scoped caller client only. No generic authoritative event ingestion exists. */
export async function measurementRpc(
  client: MeasurementClient,
  authorization: string | null,
  expectedUserId: string,
  name: "get_product_measurement_preference" | "save_product_measurement_preference",
  args: Record<string, unknown>,
) {
  const token = /^Bearer ([^\s,]+)$/i.exec(authorization ?? "")?.[1];
  if (!token || token.length > 16384) return { ok: false, code: "UNAUTHENTICATED" } as const;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const verified = await Promise.race([
      client.auth.getUser(token),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Verification unavailable")), 8000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (verified.error || verified.data.user?.id !== expectedUserId)
      return { ok: false, code: "UNAUTHENTICATED" } as const;
    const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8000));
    if (result.error) return { ok: false, code: "UNAVAILABLE" } as const;
    const parsed = measurementResultSchema.safeParse(result.data);
    return parsed.success ? parsed.data : ({ ok: false, code: "UNAVAILABLE" } as const);
  } catch {
    return { ok: false, code: "UNAVAILABLE" } as const;
  }
}

/** The database RPC rechecks the grant and audits before returning health only. */
export async function measurementRetentionHealth(
  client: MeasurementClient,
  authorization: string | null,
  requestId: string,
) {
  await requirePlatformAdmin(client, authorization);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId))
    throw new Error("Measurement health unavailable.");
  try {
    const result = await client
      .rpc("get_product_measurement_retention_health", {
        p_request_id: requestId,
      })
      .abortSignal(AbortSignal.timeout(8000));
    const parsed = retentionHealthSchema.safeParse(result.data);
    if (result.error || !parsed.success) throw new Error("Measurement health unavailable.");
    return parsed.data;
  } catch {
    throw new Error("Measurement health unavailable.");
  }
}
