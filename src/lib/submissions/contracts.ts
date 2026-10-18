import { z } from "zod";
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
export const submissionSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account_project"), projectId: uuid }).strict(),
  z.object({ type: z.literal("guest_team"), teamId: uuid }).strict(),
]);
export const selectorSchema = z
  .object({
    kind: z.enum(["project", "discovery", "interview", "learning", "experiment"]),
    recordId: uuid,
    field: z.enum([
      "name",
      "description",
      "audience",
      "problem",
      "solution",
      "hypothesis",
      "script",
      "reflection",
      "next_test",
      "answers",
      "title",
      "body",
      "change",
      "result",
    ]),
    excerpt: z.string().min(1).max(6000).optional(),
  })
  .strict();
export type SubmissionSelector = z.infer<typeof selectorSchema>;
export const reflectionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    interpretation: z.string().max(3000),
    uncertainty: z.string().max(2000),
    decision: z.string().max(2000),
    nextAction: z.string().max(2000),
  })
  .strict();
export const previewSubmissionSchema = z
  .object({
    source: submissionSourceSchema,
    classId: uuid,
    assignmentId: uuid,
    threadId: uuid,
    requestId: uuid,
    audience: z.enum(["teacher", "team"]),
    selections: z.array(selectorSchema).min(1).max(12),
    redactions: z.array(z.string().trim().min(1).max(200)).max(30),
    reflection: reflectionSchema,
  })
  .strict();
export const submissionPayloadSchema = reflectionSchema
  .extend({
    schemaVersion: z.literal(1),
    excerpts: z
      .array(
        z
          .object({
            key: z.string().regex(/^excerpt\.[1-9][0-9]?$/),
            label: z.string().min(1).max(120),
            text: z.string().min(1).max(6000),
            sourceKind: selectorSchema.shape.kind,
            evidenceLabel: z.literal("Owner-reported; selected and reviewed"),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 40000);
export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;
export const submissionFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "INVALID_INPUT",
      "NOT_FOUND",
      "FEATURE_DISABLED",
      "SHARING_REQUIRED",
      "CHANGED",
      "IDEMPOTENCY_CONFLICT",
      "CAPACITY",
      "EXPIRED",
      "UNAVAILABLE",
    ]),
  })
  .strict();
export type SubmissionFailure = z.infer<typeof submissionFailureSchema>;
export const submissionPreviewSchema = z
  .object({
    id: uuid,
    hash,
    threadId: uuid,
    expiresAt: instant,
    audience: z.literal("teacher"),
    teacherVisibleFields: z.array(z.string()).max(10),
    payload: submissionPayloadSchema,
  })
  .strict();
export const confirmSubmissionSchema = z
  .object({ previewId: uuid, previewHash: hash, requestId: uuid })
  .strict();
export const submissionHeaderSchema = z
  .object({
    id: uuid,
    threadId: uuid,
    classId: uuid,
    assignmentId: uuid,
    version: z.number().int().min(1).max(20),
    sourceType: z.enum(["account_project", "guest_team"]),
    audience: z.enum(["teacher", "team"]),
    authorLabel: z.string().min(1).max(80),
    submittedAt: instant,
    grantState: z.enum(["active", "withdrawn"]),
    grantRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    title: z.string().max(120),
  })
  .strict();
export const submissionViewSchema = submissionHeaderSchema
  .extend({ payload: submissionPayloadSchema })
  .strict();
export type SubmissionView = z.infer<typeof submissionViewSchema>;
export const ownSubmissionInputSchema = z.object({ snapshotId: uuid }).strict();
export const teacherSubmissionInputSchema = ownSubmissionInputSchema
  .extend({ classId: uuid })
  .strict();
export const ownSubmissionListSchema = z
  .object({ classId: uuid.optional(), cursor: uuid.optional() })
  .strict();
export const teacherSubmissionListSchema = z
  .object({ classId: uuid, assignmentId: uuid.optional(), cursor: uuid.optional() })
  .strict();
export const withdrawSubmissionSchema = z.object({ snapshotId: uuid, requestId: uuid }).strict();
export const submissionPageSchema = z
  .object({ items: z.array(submissionHeaderSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export const submissionResult = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([submissionFailureSchema, z.object({ ok: z.literal(true), data: schema }).strict()]);
export function submissionMessage(code: SubmissionFailure["code"]) {
  return {
    AUTH_REQUIRED: "Sign in again to review your submissions.",
    INVALID_INPUT: "Check the selected fields and review details.",
    NOT_FOUND: "This class, assignment or submission is unavailable to your account.",
    FEATURE_DISABLED:
      "This source or audience is not available yet. Guest activity sources require their own authorized adapter.",
    SHARING_REQUIRED:
      "A selected source lacks its separate sharing permission. Review its recorded choices before sharing.",
    CHANGED: "The source, permission or class changed. Keep your edits and create a fresh preview.",
    IDEMPOTENCY_CONFLICT:
      "This request was used for different work. Review the current submission before continuing.",
    CAPACITY:
      "This submission reached its preview or version capacity. Keep a private export and ask the teacher for another assignment.",
    EXPIRED: "This preview expired. Create a new preview before submitting.",
    UNAVAILABLE:
      "The request could not be confirmed. Reload the submission list before retrying; your source work is unchanged.",
  }[code];
}
