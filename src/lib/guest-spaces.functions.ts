import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  createGuestEntrySchema,
  guestEntryCreatedSchema,
  guestEntrySchema,
  guestFailureSchema,
  guestScopeSchema,
  revokeGuestEntrySchema,
  guestTeamsSchema,
  listGuestTeamsSchema,
  revokeGuestScopeSchema,
  type GuestFailure,
  exchangeGuestSchema,
  manageGuestSchema,
} from "./guest-spaces/contracts";
const identity = (v: unknown) => v;
const publicBootstrap = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { bootstrapGuest } = await import("./guest-spaces/server");
    return bootstrapGuest(data);
  });
const publicExchange = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { exchangeGuest } = await import("./guest-spaces/server");
    return exchangeGuest(data);
  });
const publicManage = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { manageGuest } = await import("./guest-spaces/server");
    return manageGuest(data);
  });
const privateResponse = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  return next();
});
async function execute<I, O>(
  value: unknown,
  context: { userId: string; supabase: SupabaseClient<Database> },
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: string,
  args: (d: I) => Record<string, unknown>,
) {
  try {
    const parsed = input.safeParse(value);
    if (!parsed.success || JSON.stringify(value).length > 4096)
      return { ok: false as const, code: "INVALID_INPUT" as const };
    const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
    if (!token) return { ok: false as const, code: "AUTH_REQUIRED" as const };
    const fresh = await context.supabase.auth.getUser(token);
    if (fresh.error || fresh.data.user?.id !== context.userId)
      return { ok: false as const, code: "AUTH_REQUIRED" as const };
    const client = context.supabase as unknown as Pick<SupabaseClient, "rpc">;
    const response = await client
      .rpc(name, args(parsed.data))
      .abortSignal(AbortSignal.timeout(8000));
    if (response.error) return { ok: false as const, code: "UNAVAILABLE" as const };
    const denied = guestFailureSchema.safeParse(response.data);
    if (denied.success) return denied.data;
    const result = output.safeParse(response.data);
    return result.success ? result.data : { ok: false as const, code: "UNAVAILABLE" as const };
  } catch {
    return { ok: false as const, code: "UNAVAILABLE" as const };
  }
}
const created = createServerFn({ method: "POST" })
  .middleware([privateResponse, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      createGuestEntrySchema,
      guestEntryCreatedSchema,
      "create_guest_entry",
      (d) => ({
        p_class_id: d.classId,
        p_days: d.days,
        p_max_uses: d.maxUses,
        p_request_id: d.requestId,
      }),
    ),
  );
const listed = createServerFn({ method: "POST" })
  .middleware([privateResponse, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      guestScopeSchema,
      z.object({ ok: z.literal(true), data: z.array(guestEntrySchema).max(50) }).strict(),
      "list_guest_entries",
      (d) => ({ p_class_id: d.classId }),
    ),
  );
const revoked = createServerFn({ method: "POST" })
  .middleware([privateResponse, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      revokeGuestEntrySchema,
      z.object({ ok: z.literal(true) }).strict(),
      "revoke_guest_entry",
      (d) => ({ p_class_id: d.classId, p_entry_id: d.entryId }),
    ),
  );
const teams = createServerFn({ method: "POST" })
  .middleware([privateResponse, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      listGuestTeamsSchema,
      z.object({ ok: z.literal(true), data: guestTeamsSchema }).strict(),
      "list_guest_teams",
      (d) => ({ p_class_id: d.classId, p_cursor: d.cursor ?? null }),
    ),
  );
const scopeRevoked = createServerFn({ method: "POST" })
  .middleware([privateResponse, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      revokeGuestScopeSchema,
      z.object({ ok: z.literal(true) }).strict(),
      "revoke_guest_scope",
      (d) => ({
        p_class_id: d.classId,
        p_team_id: d.teamId,
        p_principal_id: d.principalId ?? null,
      }),
    ),
  );
async function safe<T>(run: () => Promise<T>): Promise<T | GuestFailure> {
  try {
    return await run();
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof Error && error.message.startsWith("Unauthorized:")
          ? "AUTH_REQUIRED"
          : "UNAVAILABLE",
    };
  }
}
export const bootstrapGuestSession = () => safe(() => publicBootstrap({ data: {} }));
export const enterGuestSpace = (input: { data: z.infer<typeof exchangeGuestSchema> }) =>
  safe(() => publicExchange(input));
export const manageGuestAccess = (input: { data: z.infer<typeof manageGuestSchema> }) =>
  safe(() => publicManage(input));
export const createGuestEntry = (input: { data: z.infer<typeof createGuestEntrySchema> }) =>
  safe(() => created(input));
export const listGuestEntries = (input: { data: z.infer<typeof guestScopeSchema> }) =>
  safe(() => listed(input));
export const revokeGuestEntry = (input: { data: z.infer<typeof revokeGuestEntrySchema> }) =>
  safe(() => revoked(input));
export const listGuestTeams = (input: { data: z.infer<typeof listGuestTeamsSchema> }) =>
  safe(() => teams(input));
export const revokeGuestScope = (input: { data: z.infer<typeof revokeGuestScopeSchema> }) =>
  safe(() => scopeRevoked(input));
