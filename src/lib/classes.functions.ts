import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createClassSchema,
  updateClassSchema,
  archiveClassSchema,
  grantClassTeacherSchema,
  classMemberMutationSchema,
  saveAssignmentSchema,
  associateClassProjectSchema,
  classMutationSchema,
  classScopeSchema,
  classPageInputSchema,
  scopedClassPageInputSchema,
  classSummarySchema,
  classDetailSchema,
  classMemberSchema,
  classAssignmentSchema,
  classProjectLinkSchema,
  classFailureSchema,
  classPageSchema,
  type ClassFailure,
} from "./classes";
type Context = { userId: string; supabase: SupabaseClient<Database> };
type Operation =
  | "create_class"
  | "update_class"
  | "set_class_archived"
  | "set_class_teacher"
  | "revoke_class_teacher"
  | "remove_class_student"
  | "leave_class"
  | "save_class_assignment"
  | "associate_class_project"
  | "get_class"
  | "list_my_classes"
  | "list_class_assignments"
  | "list_class_members";
const privacy = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  return next();
});
async function execute<I, O>(
  value: unknown,
  context: Context,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: Operation,
  args: (data: I) => Record<string, unknown>,
): Promise<{ ok: true; data: O } | ClassFailure> {
  try {
    const length = getRequest().headers.get("content-length");
    if (
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) ||
      JSON.stringify(value)?.length > 65536
    )
      return { ok: false, code: "INVALID_INPUT" };
    const parsed = input.safeParse(value);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
    if (!token || token.length > 16384) return { ok: false, code: "AUTH_REQUIRED" };
    const verified = await context.supabase.auth.getUser(token);
    if (verified.error || verified.data.user?.id !== context.userId)
      return { ok: false, code: "AUTH_REQUIRED" };
    const client = context.supabase as unknown as Pick<SupabaseClient, "rpc">;
    const response = await client
      .rpc(name, args(parsed.data))
      .abortSignal(AbortSignal.timeout(8000));
    if (response.error) return { ok: false, code: "UNAVAILABLE" };
    const failure = classFailureSchema.safeParse(response.data);
    if (failure.success) return failure.data;
    const result = z
      .object({ ok: z.literal(true), data: z.unknown() })
      .strict()
      .safeParse(response.data);
    if (!result.success) return { ok: false, code: "UNAVAILABLE" };
    const payload = output.safeParse(result.data.data);
    return payload.success ? { ok: true, data: payload.data } : { ok: false, code: "UNAVAILABLE" };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}
async function safe<T>(call: () => Promise<T>): Promise<T | ClassFailure> {
  try {
    return await call();
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof Error && error.message.startsWith("Unauthorized:")
          ? "AUTH_REQUIRED"
          : "UNAVAILABLE",
    };
  }
}
const identity = (value: unknown) => value;
const mutationArgs = (d: z.infer<typeof classMutationSchema>) => ({
  p_class_id: d.classId,
  p_expected_revision: d.expectedRevision,
  p_request_id: d.requestId,
});
const createClassFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, createClassSchema, classSummarySchema, "create_class", (d) => ({
      p_class_id: d.classId,
      p_request_id: d.requestId,
      p_document: d.document,
    })),
  );
export const createClass = (input: { data: z.infer<typeof createClassSchema> }) =>
  safe(() => createClassFn(input));
const updateClassFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, updateClassSchema, classSummarySchema, "update_class", (d) => ({
      ...mutationArgs(d),
      p_document: d.document,
    })),
  );
export const updateClass = (input: { data: z.infer<typeof updateClassSchema> }) =>
  safe(() => updateClassFn(input));
const setClassArchivedFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, archiveClassSchema, classSummarySchema, "set_class_archived", (d) => ({
      ...mutationArgs(d),
      p_archived: d.archived,
    })),
  );
export const setClassArchived = (input: { data: z.infer<typeof archiveClassSchema> }) =>
  safe(() => setClassArchivedFn(input));
const grantClassTeacherFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      grantClassTeacherSchema,
      classMemberSchema,
      "set_class_teacher",
      (d) => ({
        ...mutationArgs(d),
        p_target_user_id: d.targetUserId,
        p_active: true,
        p_display_label: d.displayLabel,
      }),
    ),
  );
export const grantClassTeacher = (input: { data: z.infer<typeof grantClassTeacherSchema> }) =>
  safe(() => grantClassTeacherFn(input));
const revokeClassTeacherFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      classMemberMutationSchema,
      classMemberSchema,
      "revoke_class_teacher",
      (d) => ({ ...mutationArgs(d), p_membership_id: d.membershipId }),
    ),
  );
export const revokeClassTeacher = (input: { data: z.infer<typeof classMemberMutationSchema> }) =>
  safe(() => revokeClassTeacherFn(input));
const removeStudentFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      classMemberMutationSchema,
      classMemberSchema,
      "remove_class_student",
      (d) => ({ ...mutationArgs(d), p_membership_id: d.membershipId }),
    ),
  );
export const removeStudent = (input: { data: z.infer<typeof classMemberMutationSchema> }) =>
  safe(() => removeStudentFn(input));
const leaveClassFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, classMutationSchema, classMemberSchema, "leave_class", mutationArgs),
  );
export const leaveClass = (input: { data: z.infer<typeof classMutationSchema> }) =>
  safe(() => leaveClassFn(input));
const saveAssignmentFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      saveAssignmentSchema,
      classAssignmentSchema,
      "save_class_assignment",
      (d) => ({ ...mutationArgs(d), p_assignment_id: d.assignmentId, p_document: d.document }),
    ),
  );
export const saveAssignment = (input: { data: z.infer<typeof saveAssignmentSchema> }) =>
  safe(() => saveAssignmentFn(input));
const associateClassProjectFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      associateClassProjectSchema,
      classProjectLinkSchema,
      "associate_class_project",
      (d) => ({ ...mutationArgs(d), p_project_id: d.projectId }),
    ),
  );
export const associateClassProject = (input: {
  data: z.infer<typeof associateClassProjectSchema>;
}) => safe(() => associateClassProjectFn(input));
const getClassFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(data, context, classScopeSchema, classDetailSchema, "get_class", (d) => ({
      p_class_id: d.classId,
    })),
  );
export const getClass = (input: { data: z.infer<typeof classScopeSchema> }) =>
  safe(() => getClassFn(input));
const listMyClassesFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      classPageInputSchema,
      classPageSchema(classSummarySchema),
      "list_my_classes",
      (d) => ({ p_cursor: d.cursor ?? null }),
    ),
  );
export const listMyClasses = (input: { data: z.infer<typeof classPageInputSchema> }) =>
  safe(() => listMyClassesFn(input));
const listAssignmentsFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      scopedClassPageInputSchema,
      classPageSchema(classAssignmentSchema),
      "list_class_assignments",
      (d) => ({ p_class_id: d.classId, p_cursor: d.cursor ?? null }),
    ),
  );
export const listAssignments = (input: { data: z.infer<typeof scopedClassPageInputSchema> }) =>
  safe(() => listAssignmentsFn(input));
const listClassMembersFn = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      scopedClassPageInputSchema,
      classPageSchema(classMemberSchema),
      "list_class_members",
      (d) => ({ p_class_id: d.classId, p_cursor: d.cursor ?? null }),
    ),
  );
export const listClassMembers = (input: { data: z.infer<typeof scopedClassPageInputSchema> }) =>
  safe(() => listClassMembersFn(input));
