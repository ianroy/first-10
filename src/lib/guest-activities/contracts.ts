import { z } from "zod";
import {
  createEmptyDiscovery,
  discoverySchema,
  hasLikelySecret,
  preservedVersionsError,
  type DiscoveryDocument,
} from "@/lib/discovery";
import { secretSchema } from "@/lib/guest-spaces/contracts";
import { jsonBytes } from "@/lib/marketing-plan";

export const GUEST_ACTIVITY_LIMITS = {
  documentBytes: 262144,
  requestBytes: 307200,
  privateWorkspaces: 5,
  teamWorkspaces: 10,
  interviews: 20,
} as const;
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const choice = z.enum(["unknown", "granted", "withdrawn"]);
export const guestChoicesSchema = z
  .object({
    note: choice,
    ai: choice,
    sharing: choice,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const guestInterviewSchema = z
  .object({
    id: uuid,
    alias: z.string().trim().max(120),
    scriptId: uuid,
    capturedAt: instant,
    completed: z.boolean(),
    answers: z
      .array(
        z
          .object({
            q: z.string().max(1000),
            note: z.string().max(4000),
            quote: z.string().max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    choices: guestChoicesSchema,
  })
  .strict();
export const guestLearningDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    discovery: discoverySchema,
    interviews: z.array(guestInterviewSchema).max(GUEST_ACTIVITY_LIMITS.interviews),
    permissions: z
      .object({
        ai: choice,
        sharing: choice,
        revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (jsonBytes(doc) > GUEST_ACTIVITY_LIMITS.documentBytes)
      fail("This activity is too large. Export or shorten it before saving.");
    if (doc.discovery.people.some((p) => p.contactId !== null))
      fail("Account contacts cannot be linked to a guest activity.");
    const ids = [
      ...doc.discovery.hypotheses,
      ...doc.discovery.people,
      ...doc.discovery.scripts,
      ...doc.discovery.contexts,
      ...doc.discovery.results,
      ...doc.interviews,
    ].map((x) => x.id);
    if (new Set(ids).size !== ids.length) fail("Activity identifiers must be unique.");
    for (const interview of doc.interviews) {
      const script = doc.discovery.scripts.find((s) => s.id === interview.scriptId);
      if (
        !script ||
        JSON.stringify(script.questions) !== JSON.stringify(interview.answers.map((a) => a.q))
      )
        fail("Interview questions must match an exact preserved guest script.");
      if (
        (interview.completed || interview.answers.some((a) => a.note || a.quote)) &&
        interview.choices.note !== "granted"
      )
        fail("Reported permission to take notes is required before storing interview answers.");
    }
    for (const result of doc.discovery.results) {
      if (result.interviewId !== null) {
        const interview = doc.interviews.find((i) => i.id === result.interviewId);
        if (
          !interview ||
          !interview.completed ||
          interview.choices.note !== "granted" ||
          result.scriptId !== interview.scriptId
        )
          fail("Link results only to completed, permitted interviews in this guest activity.");
      }
    }
    if (hasLikelySecret(JSON.stringify(doc)))
      fail("Remove credentials or likely secrets before saving.");
  });
export type GuestLearningDocument = z.infer<typeof guestLearningDocumentSchema>;
export type GuestInterview = z.infer<typeof guestInterviewSchema>;
export function createEmptyGuestLearning(): GuestLearningDocument {
  return {
    schemaVersion: 1,
    discovery: createEmptyDiscovery(),
    interviews: [],
    permissions: { ai: "unknown", sharing: "unknown", revision: 1 },
  };
}
export function guestPreservedError(
  before: GuestLearningDocument,
  after: GuestLearningDocument,
): string | null {
  const error = preservedVersionsError(before.discovery, after.discovery);
  if (error) return error;
  const perms = (x: GuestLearningDocument["permissions"] | GuestInterview["choices"]) => {
    const { revision: _revision, ...rest } = x;
    return JSON.stringify(rest);
  };
  if (
    after.permissions.revision !==
    before.permissions.revision + Number(perms(before.permissions) !== perms(after.permissions))
  )
    return "A permission change must advance its revision once.";
  for (const old of before.interviews) {
    const next = after.interviews.find((i) => i.id === old.id);
    if (
      !next ||
      old.scriptId !== next.scriptId ||
      old.capturedAt !== next.capturedAt ||
      JSON.stringify(old.answers.map((a) => a.q)) !== JSON.stringify(next.answers.map((a) => a.q))
    )
      return "Preserved interview identity and exact questions cannot be replaced.";
    if (
      next.choices.revision !==
      old.choices.revision + Number(perms(old.choices) !== perms(next.choices))
    )
      return "An interview permission change must advance its revision once.";
    if (
      old.completed &&
      JSON.stringify({ alias: old.alias, answers: old.answers, completed: old.completed }) !==
        JSON.stringify({ alias: next.alias, answers: next.answers, completed: next.completed }) &&
      !(
        next.choices.note === "withdrawn" &&
        !next.completed &&
        next.answers.every((a) => !a.note && !a.quote)
      )
    )
      return "Completed interview answers remain fixed; withdrawal may clear them.";
  }
  return null;
}
export const guestAudienceSchema = z.enum(["principal_private", "team_shared"]);
export const guestActivityRecordSchema = z
  .object({
    id: uuid,
    classId: uuid,
    teamId: uuid,
    authorPrincipalId: uuid,
    audience: guestAudienceSchema,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    savedAt: instant,
    document: guestLearningDocumentSchema,
    aiEnabled: z.literal(false),
  })
  .strict();
export type GuestActivityRecord = z.infer<typeof guestActivityRecordSchema>;
/** The current record may be newer than the replayed operation; never replace later local edits blindly. */
export const guestSaveReceiptSchema = z
  .object({
    record: guestActivityRecordSchema,
    savedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    replayed: z.boolean(),
  })
  .strict();
export const guestActivityHeaderSchema = guestActivityRecordSchema.omit({ document: true });
export const guestActivityFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "NOT_FOUND",
      "FORBIDDEN",
      "INVALID_INPUT",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "PRESERVED_VERSION",
      "RATE_LIMITED",
      "CAPACITY",
      "SHARING_REQUIRED",
      "CHANGED",
      "EXPIRED",
      "UNAVAILABLE",
    ]),
    currentRevision: z.number().int().min(0).optional(),
  })
  .strict();
export type GuestActivityFailure = z.infer<typeof guestActivityFailureSchema>;
export const guestActivityResult = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([guestActivityFailureSchema, z.object({ ok: z.literal(true), data: schema }).strict()]);
export const listGuestActivitySchema = z.object({ csrf: secretSchema }).strict();
export const loadGuestActivitySchema = listGuestActivitySchema
  .extend({ activityId: uuid })
  .strict();
export const saveGuestActivitySchema = loadGuestActivitySchema
  .extend({
    audience: guestAudienceSchema,
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    mutationId: uuid,
    sharedAudienceConfirmed: z.boolean(),
    document: guestLearningDocumentSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.audience === "team_shared" &&
      (v.document.interviews.length ||
        v.document.discovery.results.some((r) => r.interviewId !== null))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Raw interviews remain principal-private. Share only a separately reviewed snapshot.",
      });
    if (v.audience === "team_shared" && v.expectedRevision === 0 && !v.sharedAudienceConfirmed)
      ctx.addIssue({
        code: "custom",
        message: "Confirm the team audience before creating shared work.",
      });
  });
export type SaveGuestActivityInput = z.infer<typeof saveGuestActivitySchema>;
export const guestSelectorSchema = z
  .object({
    kind: z.enum(["discovery", "interview"]),
    recordId: uuid,
    field: z.enum([
      "problem",
      "solution",
      "hypothesis",
      "script",
      "reflection",
      "next_test",
      "answers",
    ]),
    excerpt: z.string().min(1).max(6000).optional(),
  })
  .strict();
export const guestReflectionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    interpretation: z.string().max(3000),
    uncertainty: z.string().max(2000),
    decision: z.string().max(2000),
    nextAction: z.string().max(2000),
  })
  .strict();
export const previewGuestSubmissionSchema = loadGuestActivitySchema
  .extend({
    assignmentId: uuid,
    threadId: uuid,
    requestId: uuid,
    audience: z.enum(["teacher", "team"]),
    selections: z.array(guestSelectorSchema).min(1).max(12),
    redactions: z.array(z.string().trim().min(1).max(200)).max(30),
    reflection: guestReflectionSchema,
  })
  .strict();
const payload = guestReflectionSchema
  .extend({
    schemaVersion: z.literal(1),
    excerpts: z
      .array(
        z
          .object({
            key: z.string().regex(/^excerpt\.[1-9][0-9]?$/),
            label: z.string().min(1).max(120),
            text: z.string().min(1).max(6000),
            sourceKind: z.enum(["discovery", "interview"]),
            evidenceLabel: z.literal("Owner-reported; selected and reviewed"),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export const guestSubmissionPreviewSchema = z
  .object({
    id: uuid,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    threadId: uuid,
    expiresAt: instant,
    audience: z.enum(["teacher", "team"]),
    payload,
  })
  .strict();
export const guestSubmissionHeaderSchema = z
  .object({
    id: uuid,
    threadId: uuid,
    classId: uuid,
    assignmentId: uuid,
    sourceType: z.literal("guest_team"),
    version: z.number().int().min(1).max(20),
    audience: z.enum(["teacher", "team"]),
    authorLabel: z.string().min(1).max(80),
    submittedAt: instant,
    grantState: z.enum(["active", "withdrawn"]),
    grantRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    title: z.string().max(120),
  })
  .strict();
export const guestSubmissionViewSchema = guestSubmissionHeaderSchema.extend({ payload }).strict();
export type GuestSubmissionView = z.infer<typeof guestSubmissionViewSchema>;
export const confirmGuestSubmissionSchema = listGuestActivitySchema
  .extend({ previewId: uuid, previewHash: z.string().regex(/^[a-f0-9]{64}$/), requestId: uuid })
  .strict();
export const readGuestSubmissionSchema = listGuestActivitySchema
  .extend({ snapshotId: uuid, mode: z.enum(["author", "team"]) })
  .strict();
export const listGuestSubmissionSchema = listGuestActivitySchema
  .extend({ mode: z.enum(["author", "team"]), cursor: uuid.optional() })
  .strict();
export const withdrawGuestSubmissionSchema = listGuestActivitySchema
  .extend({ snapshotId: uuid, requestId: uuid })
  .strict();
export const guestSubmissionPageSchema = z
  .object({ items: z.array(guestSubmissionHeaderSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export function guestActivityMessage(code: GuestActivityFailure["code"]) {
  return {
    NOT_FOUND:
      "This guest access or activity is unavailable, expired or revoked. Use your personal recovery key while the class is open.",
    FORBIDDEN: "Reopen this page directly before trying again.",
    INVALID_INPUT: "Check the activity, permissions and exact script before saving.",
    CONFLICT: "A newer save exists. Keep your edits and review the current saved version.",
    IDEMPOTENCY_CONFLICT:
      "This request was already used for different work. Review the saved state before starting a new save.",
    PRESERVED_VERSION:
      "Preserved hypotheses, scripts and completed answers cannot be overwritten. Make a new version or explicitly clear withdrawn notes.",
    RATE_LIMITED: "Too many requests. Wait a minute; keep your current work open.",
    CAPACITY:
      "This space reached its safe storage limit. Export your work before class access ends.",
    SHARING_REQUIRED:
      "A selected source lacks its separate sharing permission. Review those choices first.",
    CHANGED: "The source, permission or class changed. Review a fresh preview before sharing.",
    EXPIRED: "This preview expired. Create a fresh preview.",
    UNAVAILABLE:
      "The operation could not be confirmed. Keep your edits and reload the saved state before retrying.",
  }[code];
}
export type GuestDiscoveryDocument = DiscoveryDocument;
