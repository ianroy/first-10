import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonBytes } from "@/lib/marketing-plan";
import { privacy, sameOrigin, sessionToken, verifyCsrf } from "@/lib/guest-spaces/security.server";
import {
  GUEST_ACTIVITY_LIMITS,
  guestActivityFailureSchema,
  type GuestActivityFailure,
} from "./contracts";

const failure = (code: GuestActivityFailure["code"]): GuestActivityFailure => ({ ok: false, code });
/** Only fixed server-side call sites select RPC names; identity is always the HttpOnly session. */
export async function executeGuestActivity<I extends { csrf: string }, O>(
  value: unknown,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: string,
  args: (data: I) => Record<string, unknown>,
): Promise<O | GuestActivityFailure> {
  try {
    privacy();
    const request = getRequest();
    if (!sameOrigin(request)) return failure("FORBIDDEN");
    const length = request.headers.get("content-length");
    if (
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) > GUEST_ACTIVITY_LIMITS.requestBytes)) ||
      jsonBytes(value) > GUEST_ACTIVITY_LIMITS.requestBytes
    )
      return failure("INVALID_INPUT");
    const parsed = input.safeParse(value);
    if (!parsed.success) return failure("INVALID_INPUT");
    if (!verifyCsrf(parsed.data.csrf)) return failure("FORBIDDEN");
    const session = sessionToken();
    if (!session) return failure("NOT_FOUND");
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || !process.env["SUPABASE_URL"]?.trim())
      return failure("UNAVAILABLE");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
    const result = await client
      .rpc(name, { p_session: session, ...args(parsed.data) })
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error) return failure("UNAVAILABLE");
    const denied = guestActivityFailureSchema.safeParse(result.data);
    if (denied.success) return denied.data;
    const receipt = output.safeParse(result.data);
    return receipt.success ? receipt.data : failure("UNAVAILABLE");
  } catch {
    return failure("UNAVAILABLE");
  }
}
