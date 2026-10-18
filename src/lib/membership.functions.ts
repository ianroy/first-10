import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { membershipRpc } from "./permissions/project-membership.server";
import {
  memberListSchema,
  memberMutationSchema,
  setMemberSchema,
  projectScopeSchema,
  memberSchema,
  memberPageSchema,
  projectSummarySchema,
  membershipErrorCodeSchema,
  membershipFailure,
  type Membership,
  type MembershipPage,
  type ProjectSummary,
  type MembershipResult,
} from "./permissions/project-membership";

type Context = { supabase: SupabaseClient<Database>; userId: string };
const failureSchema = z
  .object({
    ok: z.literal(false),
    code: membershipErrorCodeSchema,
    currentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
function requestId(data: unknown): string {
  const id = z.object({ requestId: z.string().uuid() }).safeParse(data);
  return id.success ? id.data.requestId : crypto.randomUUID();
}
async function execute<T, I>(
  value: unknown,
  context: Context,
  schema: z.ZodType<I>,
  output: z.ZodType<T>,
  operation: Parameters<typeof membershipRpc>[1],
  args: (data: I) => Record<string, string | number | null>,
): Promise<MembershipResult<T>> {
  const id = requestId(value);
  setResponseHeader("Cache-Control", "private, no-store");
  try {
    const length = getRequest().headers.get("content-length");
    if (
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192)) ||
      JSON.stringify(value)?.length > 8192
    )
      return membershipFailure("INVALID_INPUT", id);
    const parsed = schema.safeParse(value);
    if (!parsed.success) return membershipFailure("INVALID_INPUT", id);
    const bearer = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "");
    if (!bearer?.[1] || bearer[1].length > 16384) return membershipFailure("AUTH_REQUIRED", id);
    // getClaims middleware establishes request identity; fresh user lookup rejects deleted/invalid accounts.
    const verified = await context.supabase.auth.getUser(bearer[1]);
    if (verified.error || verified.data.user?.id !== context.userId)
      return membershipFailure("AUTH_REQUIRED", id);
    const result = await membershipRpc(context.supabase, operation, args(parsed.data));
    if (result.error) return membershipFailure("UNAVAILABLE", id);
    const failure = failureSchema.safeParse(result.data);
    if (failure.success)
      return membershipFailure(failure.data.code, id, failure.data.currentRevision);
    const envelope = z
      .object({ ok: z.literal(true), data: z.unknown() })
      .strict()
      .safeParse(result.data);
    if (!envelope.success) return membershipFailure("UNAVAILABLE", id);
    const payload = output.safeParse(envelope.data.data);
    return payload.success
      ? { ok: true, data: payload.data, requestId: id }
      : membershipFailure("UNAVAILABLE", id);
  } catch {
    return membershipFailure("UNAVAILABLE", id);
  }
}
const identity = (value: unknown) => value;
const list = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, memberListSchema, memberPageSchema, "list_project_members", (d) => ({
      p_project_id: d.projectId,
      p_cursor: d.cursor ?? null,
    })),
  );
const summary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      projectScopeSchema,
      projectSummarySchema,
      "get_member_project_summary",
      (d) => ({ p_project_id: d.projectId }),
    ),
  );
const set = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, setMemberSchema, memberSchema, "set_project_member", (d) => ({
      p_project_id: d.projectId,
      p_target_user_id: d.targetUserId,
      p_role: d.role,
      p_expected_revision: d.expectedRevision,
      p_request_id: d.requestId,
    })),
  );
const revoke = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, memberMutationSchema, memberSchema, "revoke_project_member", (d) => ({
      p_project_id: d.projectId,
      p_target_user_id: d.targetUserId,
      p_expected_revision: d.expectedRevision,
      p_request_id: d.requestId,
    })),
  );
async function safeCall<T>(
  call: () => Promise<MembershipResult<T>>,
  data: unknown,
): Promise<MembershipResult<T>> {
  try {
    return await call();
  } catch (error) {
    return membershipFailure(
      error instanceof Error && error.message.startsWith("Unauthorized:")
        ? "AUTH_REQUIRED"
        : "UNAVAILABLE",
      requestId(data),
    );
  }
}
export function listProjectMembers(input: {
  data: z.infer<typeof memberListSchema>;
}): Promise<MembershipResult<MembershipPage>> {
  return safeCall(() => list(input), input.data);
}
export function getMemberProjectSummary(input: {
  data: z.infer<typeof projectScopeSchema>;
}): Promise<MembershipResult<ProjectSummary>> {
  return safeCall(() => summary(input), input.data);
}
export function setProjectMember(input: {
  data: z.infer<typeof setMemberSchema>;
}): Promise<MembershipResult<Membership>> {
  return safeCall(() => set(input), input.data);
}
export function revokeProjectMember(input: {
  data: z.infer<typeof memberMutationSchema>;
}): Promise<MembershipResult<Membership>> {
  return safeCall(() => revoke(input), input.data);
}
