import { z } from "zod";
import { classAssignmentSchema } from "@/lib/classes";
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
export const secretSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const guestKindSchema = z.enum([
  "entry",
  "team_invite",
  "team_return",
  "principal_recovery",
]);
export const guestViewSchema = z
  .object({
    classId: uuid,
    className: z.string().min(1).max(120),
    mode: z.enum(["class", "hackathon"]),
    instructions: z.string().max(4000),
    accessExpiresAt: instant,
    retentionDays: z.number().int().min(1).max(730),
    aiEnabled: z.literal(false),
    teamId: uuid,
    teamAlias: z.string().min(1).max(80),
    principalId: uuid,
    principalAlias: z.string().min(1).max(80),
    assignments: z.array(classAssignmentSchema).max(50),
  })
  .strict();
export type GuestView = z.infer<typeof guestViewSchema>;
export const guestFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "INVALID_INPUT",
      "NOT_FOUND",
      "RATE_LIMITED",
      "CAPACITY",
      "RECOVERY_UNAVAILABLE",
      "FORBIDDEN",
      "IDEMPOTENCY_CONFLICT",
      "UNAVAILABLE",
    ]),
  })
  .strict();
export type GuestFailure = z.infer<typeof guestFailureSchema>;
export const exchangeGuestSchema = z
  .object({
    kind: guestKindSchema,
    token: secretSchema,
    teamAlias: z.string().trim().max(80),
    principalAlias: z.string().trim().max(80),
    csrf: secretSchema,
  })
  .strict();
export const guestSecretsSchema = z
  .object({
    principalRecovery: secretSchema,
    teamReturn: secretSchema.nullable(),
    teamInvite: secretSchema.nullable(),
  })
  .strict();
export const guestExchangeDatabaseSchema = z
  .object({
    ok: z.literal(true),
    data: guestViewSchema,
    sessionToken: secretSchema,
    sessionExpiresAt: instant,
    secrets: guestSecretsSchema,
  })
  .strict();
export const guestSessionDatabaseSchema = z
  .object({ ok: z.literal(true), data: guestViewSchema })
  .strict();
export const guestEntrySchema = z
  .object({
    id: uuid,
    classId: uuid,
    expiresAt: instant,
    revokedAt: instant.nullable(),
    maxUses: z.number().int().min(1).max(200),
    uses: z.number().int().min(0).max(200),
    createdAt: instant,
  })
  .strict()
  .refine((value) => value.uses <= value.maxUses);
export type GuestEntry = z.infer<typeof guestEntrySchema>;
export const createGuestEntrySchema = z
  .object({
    classId: uuid,
    days: z.number().int().min(1).max(30),
    maxUses: z.number().int().min(1).max(200),
    requestId: uuid,
  })
  .strict();
export const guestEntryCreatedSchema = z
  .object({
    ok: z.literal(true),
    data: guestEntrySchema,
    token: secretSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict()
  .refine((value) => value.replayed === (value.token === null));
export const guestScopeSchema = z.object({ classId: uuid }).strict();
export const revokeGuestEntrySchema = guestScopeSchema.extend({ entryId: uuid }).strict();
export const guestTeamSchema = z
  .object({
    id: uuid,
    alias: z.string().min(1).max(80),
    archivedAt: instant.nullable(),
    members: z
      .array(
        z
          .object({ id: uuid, alias: z.string().min(1).max(80), revokedAt: instant.nullable() })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const guestTeamsSchema = z
  .object({ items: z.array(guestTeamSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export const listGuestTeamsSchema = guestScopeSchema.extend({ cursor: uuid.optional() }).strict();
export const revokeGuestScopeSchema = guestScopeSchema
  .extend({ teamId: uuid, principalId: uuid.optional() })
  .strict();
export const manageGuestSchema = z
  .object({
    csrf: secretSchema,
    operation: z.enum(["logout", "team_invite", "rotate_team_return", "rotate_principal_recovery"]),
  })
  .strict();
export function guestMessage(code: GuestFailure["code"]) {
  return {
    AUTH_REQUIRED: "Sign in again to manage your class.",
    INVALID_INPUT: "Check the code and details before trying again.",
    NOT_FOUND: "This access is unavailable, expired, revoked or the space has closed.",
    RATE_LIMITED: "Too many recent attempts. Wait a minute before trying again.",
    CAPACITY: "This entry or team is full. Ask the teacher for another space.",
    RECOVERY_UNAVAILABLE:
      "This team reached its safe recovery limit. Existing credentials have not been changed. Contact your teacher; do not discard your current session or keys.",
    FORBIDDEN: "Reopen this page directly and try again.",
    IDEMPOTENCY_CONFLICT: "This request changed. Refresh the current class before continuing.",
    UNAVAILABLE:
      "The request could not be confirmed. Reload before trying again; no activity work is saved here yet.",
  }[code];
}
export function takeGuestFragment(
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState">,
) {
  const fragment = location.hash;
  history.replaceState(null, "", location.pathname);
  const match = /^#(entry|team_invite|team_return|principal_recovery)=([0-9a-f]{64})$/.exec(
    fragment,
  );
  return match ? { kind: guestKindSchema.parse(match[1]), token: match[2]! } : null;
}
export function guestLink(kind: z.infer<typeof guestKindSchema>, token: string, origin: string) {
  return new URL(`/join#${kind}=${secretSchema.parse(token)}`, origin).toString();
}
