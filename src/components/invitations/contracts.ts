import { z } from "zod";
const uuid = z.string().uuid();
export const createInvitationSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("project"),
      targetId: uuid,
      recipientId: uuid,
      role: z.enum(["editor", "viewer"]),
      expiresInDays: z.number().int().min(1).max(30).default(7),
      requestId: uuid,
    })
    .strict(),
  z
    .object({
      targetType: z.literal("class"),
      targetId: uuid,
      recipientId: uuid,
      role: z.literal("student"),
      expiresInDays: z.number().int().min(1).max(30).default(7),
      requestId: uuid,
    })
    .strict(),
]);
export const listInvitationsSchema = z
  .object({ projectId: uuid, cursor: uuid.optional() })
  .strict();
export const revokeInvitationSchema = z
  .object({ projectId: uuid, invitationId: uuid, requestId: uuid })
  .strict();
const inviteToken = z.string().regex(/^[0-9a-f]{64}$/);
export const acceptInvitationSchema = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("project"), token: inviteToken }).strict(),
  z
    .object({
      targetType: z.literal("class"),
      token: inviteToken,
      displayLabel: z.string().trim().min(1).max(80),
    })
    .strict(),
]);
export const classInvitationListInputSchema = z
  .object({ classId: uuid, cursor: uuid.optional() })
  .strict();
export const classInvitationRevokeInputSchema = z
  .object({ classId: uuid, invitationId: uuid, requestId: uuid })
  .strict();
const instant = z.string().datetime({ offset: true });
export const invitationSchema = z
  .object({
    id: uuid,
    projectId: uuid,
    recipientId: uuid,
    role: z.enum(["editor", "viewer"]),
    expiresAt: instant,
    revokedAt: instant.nullable(),
    acceptedAt: instant.nullable(),
    createdAt: instant,
  })
  .strict();
export const classInvitationSchema = invitationSchema
  .omit({ projectId: true })
  .extend({ classId: uuid, role: z.literal("student") })
  .strict();
export type ClassInvitation = z.infer<typeof classInvitationSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationErrorSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "INVALID_INPUT",
      "NOT_FOUND",
      "FEATURE_DISABLED",
      "IDEMPOTENCY_CONFLICT",
      "REVISION_CONFLICT",
      "REVISION_EXHAUSTED",
      "UNAVAILABLE",
    ]),
  })
  .strict();
export type InvitationFailure = z.infer<typeof invitationErrorSchema>;
export const createdInvitationSchema = z
  .object({
    ok: z.literal(true),
    data: invitationSchema,
    token: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    replayed: z.boolean(),
  })
  .strict()
  .refine((result) => result.replayed === (result.token === null));
export const createdClassInvitationSchema = z
  .object({
    ok: z.literal(true),
    data: classInvitationSchema,
    token: inviteToken.nullable(),
    replayed: z.boolean(),
  })
  .strict()
  .refine((result) => result.replayed === (result.token === null));
export const classInvitationListSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({ items: z.array(classInvitationSchema).max(50), nextCursor: uuid.nullable() })
      .strict(),
  })
  .strict();
export const revokedClassInvitationSchema = z
  .object({ ok: z.literal(true), data: classInvitationSchema })
  .strict();
export const acceptedClassInvitationSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        invitationId: uuid,
        classId: uuid,
        role: z.literal("student"),
        membershipRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict();
export const invitationListSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({ items: z.array(invitationSchema).max(50), nextCursor: uuid.nullable() })
      .strict(),
  })
  .strict();
export const revokedInvitationSchema = z
  .object({ ok: z.literal(true), data: invitationSchema })
  .strict();
export const acceptedInvitationSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        invitationId: uuid,
        projectId: uuid,
        role: z.enum(["editor", "viewer"]),
        membershipRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict();
export function invitationMessage(code: InvitationFailure["code"]) {
  const messages = {
    AUTH_REQUIRED: "Sign in with the intended account before continuing.",
    INVALID_INPUT: "Check the account ID, role and invitation details.",
    NOT_FOUND: "This invitation is unavailable, expired, revoked or intended for another account.",
    FEATURE_DISABLED: "Project collaboration is not enabled. No access has been granted.",
    IDEMPOTENCY_CONFLICT: "This request was already used. Refresh before making another change.",
    REVISION_CONFLICT: "Access changed after this invitation. Ask the owner for a new invitation.",
    REVISION_EXHAUSTED:
      "This membership has reached its revision limit. The owner must review access before issuing another invitation.",
    UNAVAILABLE: "This request could not be confirmed. Refresh before trying again.",
  };
  return messages[code];
}
/** Only a fragment carries the raw secret. Never persist it or accept query tokens. */
export function takeInvitationFragment(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">,
): string | null {
  const fragment = location.hash;
  // Strip even malformed fragments and all query parameters before any auth/network operation.
  history.replaceState(null, "", location.pathname);
  const match = /^#invite=([0-9a-f]{64})$/.exec(fragment);
  return match?.[1] ?? null;
}

/** Shared /invite discriminator. The parent must call this before auth/network;
 * no query-token fallback or browser persistence is permitted. */
export function takeScopedInvitationFragment(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">,
): { targetType: "project" | "class"; token: string } | null {
  const fragment = location.hash;
  history.replaceState(null, "", location.pathname);
  const match = /^#(invite|class-invite)=([0-9a-f]{64})$/.exec(fragment);
  return match?.[2]
    ? { targetType: match[1] === "class-invite" ? "class" : "project", token: match[2] }
    : null;
}
