import { z } from "zod";

export const TEACHER_PLAN_LIMITS = {
  documentBytes: 61_440,
  storedBytes: 65_536,
  requestBytes: 98_304,
} as const;
const id = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
const text = (maximum: number) =>
  z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= maximum, `Use at most ${maximum} characters.`);
export function teacherPlanBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? Infinity : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Infinity;
  }
}
function realDay(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const teacherPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    className: text(120),
    audience: text(1000),
    learningObjectives: z.array(text(500)).max(8),
    assignment: text(4000),
    sessionMinutes: z.number().int().min(1).max(480),
    plannedLearners: z.number().int().min(0).max(10_000).nullable(),
    scheduledOn: z.string().trim().refine(realDay, "Choose a real calendar date.").nullable(),
    assessment: text(2000),
    facilitatorNotes: text(4000),
  })
  .strict();
export type TeacherPlanV1 = z.infer<typeof teacherPlanSchema>;
export function createEmptyTeacherPlan(): TeacherPlanV1 {
  return {
    schemaVersion: 1,
    className: "",
    audience: "",
    learningObjectives: [],
    assignment: "",
    sessionMinutes: 60,
    plannedLearners: null,
    scheduledOn: null,
    assessment: "",
    facilitatorNotes: "",
  };
}
export const loadTeacherPlanSchema = z.object({ projectId: id }).strict();
export const saveTeacherPlanSchema = z
  .object({
    projectId: id,
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    mutationId: id,
    document: teacherPlanSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      teacherPlanBytes(value) > TEACHER_PLAN_LIMITS.requestBytes ||
      teacherPlanBytes(value.document) > TEACHER_PLAN_LIMITS.documentBytes
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This lesson plan is too large to save. Saved work is unchanged.",
      });
  });
export type SaveTeacherPlanInput = z.infer<typeof saveTeacherPlanSchema>;
export type TeacherPlanRecord = {
  id: string;
  revision: number;
  savedAt: string;
  document: TeacherPlanV1;
};
export type TeacherPlanFailure = {
  ok: false;
  code:
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "INVALID_PLAN"
    | "CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "UNAVAILABLE";
  currentRevision?: number;
};
export type LoadTeacherPlanResult =
  TeacherPlanFailure | { ok: true; plan: TeacherPlanRecord | null };
export type SaveTeacherPlanResult = TeacherPlanFailure | ({ ok: true } & TeacherPlanRecord);
export const teacherPlanRecordSchema = z
  .object({
    id,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    savedAt: z.string().datetime(),
    document: teacherPlanSchema,
  })
  .strict();
