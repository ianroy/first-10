import { z } from "zod";
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const storedRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const classDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    mode: z.enum(["class", "hackathon"]),
    instructions: z.string().max(4000),
    accessExpiresAt: instant,
    retentionDays: z.number().int().min(1).max(730),
  })
  .strict();
export const assignmentDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().max(8000),
    dueAt: instant.nullable(),
    state: z.enum(["draft", "published", "archived"]),
  })
  .strict();
export const classScopeSchema = z.object({ classId: uuid }).strict();
export const classPageInputSchema = z.object({ cursor: uuid.optional() }).strict();
export const scopedClassPageInputSchema = classScopeSchema
  .extend({ cursor: uuid.optional() })
  .strict();
export const classMutationSchema = classScopeSchema
  .extend({ requestId: uuid, expectedRevision: revision })
  .strict();
export const createClassSchema = classScopeSchema
  .extend({ requestId: uuid, document: classDocumentSchema })
  .strict();
export const updateClassSchema = classMutationSchema
  .extend({ document: classDocumentSchema })
  .strict();
export const archiveClassSchema = classMutationSchema.extend({ archived: z.boolean() }).strict();
export const grantClassTeacherSchema = classMutationSchema
  .extend({ targetUserId: uuid, displayLabel: z.string().trim().min(1).max(80) })
  .strict();
export const classMemberMutationSchema = classMutationSchema
  .extend({ membershipId: uuid })
  .strict();
export const saveAssignmentSchema = classMutationSchema
  .extend({ assignmentId: uuid, document: assignmentDocumentSchema })
  .strict();
export const associateClassProjectSchema = classMutationSchema.extend({ projectId: uuid }).strict();
export const classSummarySchema = classDocumentSchema
  .extend({
    id: uuid,
    aiEnabled: z.literal(false),
    archivedAt: instant.nullable(),
    revision: storedRevision,
    role: z.enum(["owner", "teacher", "student"]),
    updatedAt: instant,
  })
  .strict();
export const classMemberSchema = z
  .object({
    id: uuid,
    classId: uuid,
    displayLabel: z.string().min(1).max(80),
    role: z.enum(["student", "teacher"]),
    state: z.enum(["active", "left", "removed"]),
    revision: storedRevision,
  })
  .strict();
export const classProjectLinkSchema = z
  .object({ id: uuid, projectId: uuid, active: z.boolean(), revision: storedRevision })
  .strict();
export const classDetailSchema = classSummarySchema
  .extend({
    enrollment: classMemberSchema.nullable(),
    projectAssociation: classProjectLinkSchema.nullable(),
  })
  .strict()
  .refine((value) =>
    value.role === "owner"
      ? value.enrollment === null && value.projectAssociation === null
      : value.enrollment?.role === value.role &&
        value.enrollment.state === "active" &&
        (value.role === "student" || value.projectAssociation === null),
  );
export const classAssignmentSchema = assignmentDocumentSchema
  .extend({ id: uuid, classId: uuid, revision: storedRevision, updatedAt: instant })
  .strict();
export const classFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "INVALID_INPUT",
      "NOT_FOUND",
      "IDEMPOTENCY_CONFLICT",
      "REVISION_CONFLICT",
      "REVISION_EXHAUSTED",
      "UNAVAILABLE",
    ]),
    currentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
export type ClassFailure = z.infer<typeof classFailureSchema>;
export type ClassSummary = z.infer<typeof classSummarySchema>;
export type ClassDetail = z.infer<typeof classDetailSchema>;
export type ClassMember = z.infer<typeof classMemberSchema>;
export type ClassAssignment = z.infer<typeof classAssignmentSchema>;
export const classPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item).max(50), nextCursor: uuid.nullable() }).strict();
export function classMessage(code: ClassFailure["code"]): string {
  const messages = {
    AUTH_REQUIRED: "Sign in again to open your classes.",
    INVALID_INPUT: "Check the class details and try again.",
    NOT_FOUND: "This class or resource is unavailable, expired or no longer shared with you.",
    IDEMPOTENCY_CONFLICT:
      "This request was already used for a different change. Refresh before continuing.",
    REVISION_CONFLICT:
      "This work changed in another session. Keep your edits and review the latest saved version.",
    REVISION_EXHAUSTED:
      "This record has reached its revision limit. Active access can still be revoked; contact the operator for further edits.",
    UNAVAILABLE: "The class request could not be confirmed. Your local text has not been replaced.",
  };
  return messages[code];
}
