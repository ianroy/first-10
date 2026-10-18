import { z } from "zod";
export const projectRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type ProjectRole = z.infer<typeof projectRoleSchema>;
const uuid = z.string().uuid();
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const projectScopeSchema = z.object({ projectId: uuid }).strict();
export const memberListSchema = projectScopeSchema.extend({ cursor: uuid.optional() }).strict();
export const memberMutationSchema = projectScopeSchema
  .extend({ targetUserId: uuid, expectedRevision: revision, requestId: uuid })
  .strict();
export const setMemberSchema = memberMutationSchema
  .extend({ role: z.enum(["editor", "viewer"]) })
  .strict();
export const memberSchema = z
  .object({
    id: uuid,
    projectId: uuid,
    userId: uuid,
    role: z.enum(["editor", "viewer"]),
    state: z.enum(["active", "revoked"]),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const projectSummarySchema = z
  .object({
    id: uuid,
    name: z.string(),
    role: projectRoleSchema,
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    membershipRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const memberPageSchema = z
  .object({ items: z.array(memberSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export const membershipErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN",
  "FEATURE_DISABLED",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "UNAVAILABLE",
]);
export type MembershipErrorCode = z.infer<typeof membershipErrorCodeSchema>;
export type Membership = z.infer<typeof memberSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type MembershipPage = z.infer<typeof memberPageSchema>;
export type MembershipResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code: MembershipErrorCode;
        message: string;
        retryable: boolean;
        currentRevision?: number;
      };
      requestId: string;
    };
export function membershipFailure<T>(
  code: MembershipErrorCode,
  requestId: string,
  currentRevision?: number,
): MembershipResult<T> {
  const messages: Record<MembershipErrorCode, string> = {
    AUTH_REQUIRED: "Sign in again to check access.",
    INVALID_INPUT: "Check the membership request.",
    NOT_FOUND: "This project or membership is unavailable.",
    FORBIDDEN: "This action is not permitted.",
    FEATURE_DISABLED: "Project collaboration is not enabled.",
    REVISION_CONFLICT: "Membership changed. Refresh before trying again.",
    IDEMPOTENCY_CONFLICT: "This request identifier was already used for a different change.",
    UNAVAILABLE: "Membership access cannot be checked right now.",
  };
  return {
    ok: false,
    error: {
      code,
      message: messages[code],
      retryable: code === "UNAVAILABLE",
      ...(currentRevision === undefined ? {} : { currentRevision }),
    },
    requestId,
  };
}
