import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  exchangeGuestSchema,
  guestExchangeDatabaseSchema,
  guestFailureSchema,
  guestSessionDatabaseSchema,
  manageGuestSchema,
  secretSchema,
  type GuestFailure,
} from "./contracts";
import {
  admissionClientHash,
  clearGuestSession,
  issueCsrf,
  privacy,
  sameOrigin,
  sessionToken,
  setGuestSession,
  verifyCsrf,
} from "./security.server";
const failure = (code: GuestFailure["code"]): GuestFailure => ({ ok: false, code });
async function rpc(
  name: "exchange_guest_entry" | "get_guest_session" | "manage_guest_session",
  args: Record<string, unknown>,
) {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || !process.env["SUPABASE_URL"]?.trim())
    throw new Error("Unavailable");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
  const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8000));
  if (result.error) throw new Error("Unavailable");
  return result.data;
}
function guard(value: unknown) {
  privacy();
  return sameOrigin(getRequest()) && JSON.stringify(value).length <= 4096;
}
export async function bootstrapGuest(value: unknown) {
  try {
    if (!guard(value) || !z.object({}).strict().safeParse(value).success)
      return failure("FORBIDDEN");
    const csrf = issueCsrf();
    const session = sessionToken();
    if (!session) return { ok: true as const, data: null, csrf };
    const result = guestSessionDatabaseSchema.safeParse(
      await rpc("get_guest_session", { p_session: session }),
    );
    if (!result.success) return { ok: true as const, data: null, csrf: clearGuestSession() };
    return { ...result.data, csrf };
  } catch {
    return failure("UNAVAILABLE");
  }
}
export async function exchangeGuest(value: unknown) {
  try {
    if (!guard(value)) return failure("FORBIDDEN");
    const parsed = exchangeGuestSchema.safeParse(value);
    if (!parsed.success) return failure("INVALID_INPUT");
    if (!verifyCsrf(parsed.data.csrf)) return failure("FORBIDDEN");
    const d = parsed.data;
    const raw = await rpc("exchange_guest_entry", {
      p_kind: d.kind,
      p_token: d.token,
      p_team_alias: d.teamAlias,
      p_principal_alias: d.principalAlias,
      p_client_hash: admissionClientHash(getRequest()),
    });
    const denied = guestFailureSchema.safeParse(raw);
    if (denied.success) return denied.data;
    const saved = guestExchangeDatabaseSchema.safeParse(raw);
    if (!saved.success) return failure("UNAVAILABLE");
    const { sessionToken: token, sessionExpiresAt, ...receipt } = saved.data;
    return { ...receipt, csrf: setGuestSession(token, sessionExpiresAt) };
  } catch {
    return failure("UNAVAILABLE");
  }
}
export async function manageGuest(value: unknown) {
  try {
    if (!guard(value)) return failure("FORBIDDEN");
    const parsed = manageGuestSchema.safeParse(value);
    if (!parsed.success) return failure("INVALID_INPUT");
    if (!verifyCsrf(parsed.data.csrf)) return failure("FORBIDDEN");
    const session = sessionToken();
    if (!session) return failure("NOT_FOUND");
    const raw = await rpc("manage_guest_session", {
      p_session: session,
      p_operation: parsed.data.operation,
    });
    const denied = guestFailureSchema.safeParse(raw);
    if (denied.success) return denied.data;
    if (parsed.data.operation === "logout") {
      if (
        !z
          .object({ ok: z.literal(true) })
          .strict()
          .safeParse(raw).success
      )
        return failure("UNAVAILABLE");
      return { ok: true as const, csrf: clearGuestSession(), token: null };
    }
    const output = z
      .object({ ok: z.literal(true), token: secretSchema })
      .strict()
      .safeParse(raw);
    return output.success ? { ...output.data, csrf: issueCsrf() } : failure("UNAVAILABLE");
  } catch {
    return failure("UNAVAILABLE");
  }
}
