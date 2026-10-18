import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createInvitationSchema,
  listInvitationsSchema,
  revokeInvitationSchema,
  acceptInvitationSchema,
  invitationErrorSchema,
  createdInvitationSchema,
  invitationListSchema,
  revokedInvitationSchema,
  acceptedInvitationSchema,
  type InvitationFailure,
} from "@/components/invitations/contracts";
type Context = { userId: string; supabase: SupabaseClient<Database> };
type Operation =
  | "create_project_invitation"
  | "list_project_invitations"
  | "revoke_project_invitation"
  | "accept_project_invitation";
function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
const invitationPrivacy = createMiddleware({ type: "function" }).server(async ({ next }) => {
  privateResponse();
  return next();
});
async function execute<I, O>(
  value: unknown,
  context: Context,
  input: z.ZodType<I, z.ZodTypeDef, unknown>,
  output: z.ZodType<O>,
  name: Operation,
  args: (input: I) => Record<string, string | number | null>,
): Promise<O | InvitationFailure> {
  privateResponse();
  try {
    const length = getRequest().headers.get("content-length");
    if (
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192)) ||
      JSON.stringify(value)?.length > 8192
    )
      return { ok: false, code: "INVALID_INPUT" };
    const data = input.safeParse(value);
    if (!data.success) return { ok: false, code: "INVALID_INPUT" };
    const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
    if (!token || token.length > 16384) return { ok: false, code: "AUTH_REQUIRED" };
    const verified = await context.supabase.auth.getUser(token);
    if (verified.error || verified.data.user?.id !== context.userId)
      return { ok: false, code: "AUTH_REQUIRED" };
    // Session-bound client only. No generic service-role query or supplied actor.
    const rpc = context.supabase as unknown as Pick<SupabaseClient, "rpc">;
    const result = await rpc.rpc(name, args(data.data)).abortSignal(AbortSignal.timeout(8000));
    if (result.error) return { ok: false, code: "UNAVAILABLE" };
    const failure = invitationErrorSchema.safeParse(result.data);
    if (failure.success) return failure.data;
    const parsed = output.safeParse(result.data);
    return parsed.success ? parsed.data : { ok: false, code: "UNAVAILABLE" };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}
const identity = (value: unknown) => value;
const create = createServerFn({ method: "POST" })
  .middleware([invitationPrivacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      createInvitationSchema,
      createdInvitationSchema,
      "create_project_invitation",
      (d) => ({
        p_target_type: d.targetType,
        p_project_id: d.targetId,
        p_recipient_id: d.recipientId,
        p_role: d.role,
        p_days: d.expiresInDays,
        p_request_id: d.requestId,
      }),
    ),
  );
const list = createServerFn({ method: "POST" })
  .middleware([invitationPrivacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      listInvitationsSchema,
      invitationListSchema,
      "list_project_invitations",
      (d) => ({ p_project_id: d.projectId, p_cursor: d.cursor ?? null }),
    ),
  );
const revoke = createServerFn({ method: "POST" })
  .middleware([invitationPrivacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      revokeInvitationSchema,
      revokedInvitationSchema,
      "revoke_project_invitation",
      (d) => ({
        p_project_id: d.projectId,
        p_invitation_id: d.invitationId,
        p_request_id: d.requestId,
      }),
    ),
  );
const accept = createServerFn({ method: "POST" })
  .middleware([invitationPrivacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      acceptInvitationSchema,
      acceptedInvitationSchema,
      "accept_project_invitation",
      (d) => ({ p_target_type: d.targetType, p_token: d.token }),
    ),
  );
async function safe<T>(call: () => Promise<T>): Promise<T | InvitationFailure> {
  try {
    return await call();
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
export const createInvitation = (input: { data: z.input<typeof createInvitationSchema> }) =>
  safe(() => create(input));
export const listInvitations = (input: { data: z.infer<typeof listInvitationsSchema> }) =>
  safe(() => list(input));
export const revokeInvitation = (input: { data: z.infer<typeof revokeInvitationSchema> }) =>
  safe(() => revoke(input));
export const acceptInvitation = (input: { data: z.infer<typeof acceptInvitationSchema> }) =>
  safe(() => accept(input));
