import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveMeasurementPreferenceSchema, type MeasurementResult } from "./analytics-contracts";
import type { MeasurementClient } from "./events.server";
const unavailable = { ok: false, code: "UNAVAILABLE" } as const;
function smallInput<T>(schema: z.ZodType<T>, value: unknown): T | null {
  try {
    if (JSON.stringify(value).length > 2048) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function headers() {
  setResponseHeader("Cache-Control", "private, no-store");
  const request = getRequest();
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) return null;
  return request.headers;
}
const read = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => smallInput(z.object({}).strict(), v))
  .handler(async ({ data, context }): Promise<MeasurementResult> => {
    const h = headers();
    if (!data || !h) return { ok: false, code: "INVALID_INPUT" };
    const { measurementRpc } = await import("./events.server");
    const c = context as unknown as { supabase: MeasurementClient; userId: string };
    return measurementRpc(
      c.supabase,
      h.get("authorization"),
      c.userId,
      "get_product_measurement_preference",
      {},
    );
  });
const save = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => smallInput(saveMeasurementPreferenceSchema, v))
  .handler(async ({ data, context }): Promise<MeasurementResult> => {
    const h = headers();
    if (!data || !h) return { ok: false, code: "INVALID_INPUT" };
    const { measurementRpc } = await import("./events.server");
    const c = context as unknown as { supabase: MeasurementClient; userId: string };
    return measurementRpc(
      c.supabase,
      h.get("authorization"),
      c.userId,
      "save_product_measurement_preference",
      {
        p_choice: data.choice,
        p_expected_revision: data.expectedRevision,
        p_request_id: data.requestId,
      },
    );
  });
export async function getMeasurementPreference(): Promise<MeasurementResult> {
  try {
    return await read({ data: {} });
  } catch {
    return unavailable;
  }
}
export async function saveMeasurementPreference(input: {
  data: z.infer<typeof saveMeasurementPreferenceSchema>;
}): Promise<MeasurementResult> {
  try {
    return await save(input);
  } catch {
    return unavailable;
  }
}
