import { z } from "zod";
import { consentChoicesSchema, unknownConsent } from "./consent";
import { jsonBytes } from "./marketing-plan";
const id = z.string().uuid();
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const draftQuestionsSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(2400)
      .refine((v) => !!v.trim(), "Questions cannot be blank."),
  )
  .min(1)
  .max(30)
  .refine((v) => jsonBytes(v) <= 44000, "This script is too large. Shorten it before starting.");
export const interviewDraftDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.literal(1),
    answers: z
      .array(
        z
          .object({
            q: z.string().min(1).max(2400),
            note: z.string().max(6000),
            quote: z.string().max(2400),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    tags: z
      .array(
        z.enum(["has problem", "current workaround", "would use", "would pay", "gave referral"]),
      )
      .max(10),
    choices: consentChoicesSchema,
    currentQuestion: z.number().int().min(0).max(30),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.currentQuestion > d.answers.length)
      ctx.addIssue({ code: "custom", message: "Current question is outside this saved script." });
    if (
      d.choices.noteStatus !== "granted" &&
      d.answers.some((a) => a.note !== "" || a.quote !== "")
    )
      ctx.addIssue({
        code: "custom",
        message: "Clear notes and quotes before saving a choice that does not allow keeping notes.",
      });
    if (jsonBytes(d.answers) > 58000 || jsonBytes(d) > 65000)
      ctx.addIssue({
        code: "custom",
        message: "This draft is too large. Export it and shorten the notes before saving.",
      });
  });
export type InterviewDraftDocument = z.infer<typeof interviewDraftDocumentSchema>;
export function emptyInterviewDraft(
  questions: string[],
  noteStatus: "unknown" | "granted" = "unknown",
): InterviewDraftDocument {
  return {
    schemaVersion: 1,
    policyVersion: 1,
    answers: questions.map((q) => ({ q, note: "", quote: "" })),
    tags: [],
    choices: { ...unknownConsent, noteStatus },
    currentQuestion: 0,
  };
}
export const draftScopeSchema = z.object({ projectId: id, draftId: id }).strict();
export const createDraftSchema = draftScopeSchema
  .extend({
    contactId: id.nullable(),
    expectedQuestions: draftQuestionsSchema,
    expectedOriginId: id.nullable(),
    noteStatus: z.enum(["unknown", "granted"]),
  })
  .strict();
export const saveDraftSchema = draftScopeSchema
  .extend({
    expectedRevision: revision,
    mutationId: id,
    contactId: id.nullable(),
    document: interviewDraftDocumentSchema,
  })
  .strict();
export const completeDraftSchema = draftScopeSchema.extend({ expectedRevision: revision }).strict();
const stamp = z.string().datetime({ offset: true });
export const interviewDraftRecordSchema = z
  .object({
    id,
    projectId: id,
    contactId: id.nullable(),
    revision,
    status: z.enum(["active", "completed"]),
    questions: draftQuestionsSchema,
    originId: id.nullable(),
    createdAt: stamp,
    savedAt: stamp,
    completedAt: stamp.nullable(),
    interviewId: id.nullable(),
    document: interviewDraftDocumentSchema.nullable(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (
      (d.status === "active") !== (d.document !== null) ||
      (d.status === "completed") !== (d.interviewId !== null && d.completedAt !== null)
    )
      ctx.addIssue({ code: "custom", message: "Invalid draft lifecycle." });
    if (
      d.document &&
      JSON.stringify(d.questions) !== JSON.stringify(d.document.answers.map((a) => a.q))
    )
      ctx.addIssue({ code: "custom", message: "Saved questions do not match the draft snapshot." });
  });
export type InterviewDraftRecord = z.infer<typeof interviewDraftRecordSchema>;
export const draftSummarySchema = z
  .object({
    id,
    contactId: id.nullable(),
    revision,
    savedAt: stamp,
    questionCount: z.number().int().min(1).max(30),
    answeredCount: z.number().int().min(0).max(30),
  })
  .strict();
export type InterviewDraftSummary = z.infer<typeof draftSummarySchema>;
export const draftFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "ARCHIVED",
      "INVALID_INPUT",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "SOURCE_CHANGED",
      "SOURCE_UNAVAILABLE",
      "IMMUTABLE_BINDING",
      "ALREADY_COMPLETED",
      "LIMIT_REACHED",
      "UNAVAILABLE",
    ]),
    currentRevision: revision.optional(),
  })
  .strict();
export type DraftFailure = z.infer<typeof draftFailureSchema>;
export type DraftRecordResult = { ok: true; draft: InterviewDraftRecord } | DraftFailure;
export type DraftListResult = { ok: true; drafts: InterviewDraftSummary[] } | DraftFailure;
export type CompleteDraftResult =
  { ok: true; interviewId: string; replayed: boolean; completedRevision: number } | DraftFailure;
export const draftErrorText: Record<DraftFailure["code"], string> = {
  UNAUTHENTICATED: "Sign in again. Your local notes remain here.",
  NOT_FOUND: "This private draft is unavailable for the selected project.",
  ARCHIVED: "Restore this idea in Account before saving or completing a draft.",
  INVALID_INPUT: "Review the field limits and permission choices. Your local notes remain here.",
  CONFLICT:
    "A newer saved revision exists. Keep or export your local work, then explicitly reload the saved draft.",
  IDEMPOTENCY_CONFLICT: "This retry changed. Keep your local work and reload before another save.",
  SOURCE_CHANGED:
    "Saved preparation questions changed. Review the current script before starting a new draft.",
  SOURCE_UNAVAILABLE:
    "The linked person is unavailable. Unlink the reference while keeping your notes, then save.",
  IMMUTABLE_BINDING:
    "A draft cannot be reassigned to another person or question list. Start a separate draft.",
  ALREADY_COMPLETED:
    "This draft has already been completed. Reload its receipt instead of creating another interview.",
  LIMIT_REACHED:
    "This idea has 100 active drafts. Resume an existing draft before starting another.",
  UNAVAILABLE:
    "The result could not be confirmed. Your local notes remain here; retry the identical request.",
};
