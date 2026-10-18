import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  TEACHER_PLAN_LIMITS,
  teacherPlanBytes,
  loadTeacherPlanSchema,
  saveTeacherPlanSchema,
  teacherPlanRecordSchema,
  type LoadTeacherPlanResult,
  type SaveTeacherPlanResult,
  type SaveTeacherPlanInput,
  type TeacherPlanFailure,
} from "./teacher-plan";

const invalid = { ok: false, code: "INVALID_PLAN" } as const;
const unavailable = { ok: false, code: "UNAVAILABLE" } as const;
const failureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "INVALID_PLAN",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "ARCHIVED",
      "BUSY",
      "UNAVAILABLE",
    ]),
    currentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const saveResultSchema = z.union([
  teacherPlanRecordSchema.extend({ ok: z.literal(true) }),
  failureSchema,
]);
function bounded<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (teacherPlanBytes(value) > TEACHER_PLAN_LIMITS.requestBytes) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
function oversized(): boolean {
  const length = getRequest().headers.get("content-length");
  return (
    length !== null && (!/^\d+$/.test(length) || Number(length) > TEACHER_PLAN_LIMITS.requestBytes)
  );
}
function safeError(error: unknown): TeacherPlanFailure {
  return error instanceof Error && error.message.startsWith("Unauthorized:")
    ? { ok: false, code: "UNAUTHENTICATED" }
    : unavailable;
}
const loadPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => bounded(loadTeacherPlanSchema, value))
  .handler(async ({ data, context }): Promise<LoadTeacherPlanResult> => {
    if (!data || oversized()) return invalid;
    const sb = context.supabase;
    const project = await sb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (project.error) return unavailable;
    if (!project.data) return { ok: false, code: "NOT_FOUND" };
    const result = await sb
      .from("teacher_plans")
      .select("id,revision,updated_at,document")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (result.error) return unavailable;
    if (!result.data) return { ok: true, plan: null };
    const row = result.data;
    const parsed = teacherPlanRecordSchema.safeParse({
      id: row.id,
      revision: row.revision,
      savedAt: new Date(row.updated_at).toISOString(),
      document: row.document,
    });
    return parsed.success ? { ok: true, plan: parsed.data } : invalid;
  });
const savePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => bounded(saveTeacherPlanSchema, value))
  .handler(async ({ data, context }): Promise<SaveTeacherPlanResult> => {
    if (!data || oversized()) return invalid;
    const result = await context.supabase.rpc("save_teacher_plan", {
      p_project_id: data.projectId,
      p_expected_revision: data.expectedRevision,
      p_mutation_id: data.mutationId,
      p_document: data.document as Json,
    });
    if (result.error) return unavailable;
    const parsed = saveResultSchema.safeParse(result.data);
    if (!parsed.success) return unavailable;
    if (!parsed.data.ok)
      return parsed.data.currentRevision === undefined
        ? { ok: false, code: parsed.data.code }
        : { ok: false, code: parsed.data.code, currentRevision: parsed.data.currentRevision };
    return parsed.data;
  });
export async function loadTeacherPlan(input: {
  data: z.infer<typeof loadTeacherPlanSchema>;
}): Promise<LoadTeacherPlanResult> {
  try {
    return await loadPlan(input);
  } catch (error) {
    return safeError(error);
  }
}
export async function saveTeacherPlan(input: {
  data: SaveTeacherPlanInput;
}): Promise<SaveTeacherPlanResult> {
  try {
    return await savePlan(input);
  } catch (error) {
    return safeError(error);
  }
}
