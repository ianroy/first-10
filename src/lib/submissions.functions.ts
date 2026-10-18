import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  previewSubmissionSchema,
  confirmSubmissionSchema,
  ownSubmissionInputSchema,
  teacherSubmissionInputSchema,
  ownSubmissionListSchema,
  teacherSubmissionListSchema,
  withdrawSubmissionSchema,
  submissionPreviewSchema,
  submissionViewSchema,
  submissionPageSchema,
  submissionHeaderSchema,
  submissionFailureSchema,
  type SubmissionFailure,
} from "./submissions/contracts";
type Context = { userId: string; supabase: SupabaseClient<Database> };
const identity = (v: unknown) => v;
const privacy = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  return next();
});
async function execute<I, O>(
  value: unknown,
  context: Context,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: string,
  args: (v: I) => Record<string, unknown>,
) {
  try {
    const length = getRequest().headers.get("content-length");
    if (
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) ||
      JSON.stringify(value).length > 65536
    )
      return { ok: false as const, code: "INVALID_INPUT" as const };
    const d = input.safeParse(value);
    if (!d.success) return { ok: false as const, code: "INVALID_INPUT" as const };
    const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
    if (!token || token.length > 16384)
      return { ok: false as const, code: "AUTH_REQUIRED" as const };
    const fresh = await context.supabase.auth.getUser(token);
    if (fresh.error || fresh.data.user?.id !== context.userId)
      return { ok: false as const, code: "AUTH_REQUIRED" as const };
    const client = context.supabase as unknown as Pick<SupabaseClient, "rpc">;
    const response = await client.rpc(name, args(d.data)).abortSignal(AbortSignal.timeout(10000));
    if (response.error) return { ok: false as const, code: "UNAVAILABLE" as const };
    const denied = submissionFailureSchema.safeParse(response.data);
    if (denied.success) return denied.data;
    const result = z
      .object({ ok: z.literal(true), data: output })
      .strict()
      .safeParse(response.data);
    return result.success ? result.data : { ok: false as const, code: "UNAVAILABLE" as const };
  } catch {
    return { ok: false as const, code: "UNAVAILABLE" as const };
  }
}
const preview = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      previewSubmissionSchema,
      submissionPreviewSchema,
      "preview_class_submission",
      (v) => ({ p_document: v }),
    ),
  );
const confirm = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      confirmSubmissionSchema,
      submissionViewSchema,
      "confirm_class_submission",
      (v) => ({
        p_preview_id: v.previewId,
        p_preview_hash: v.previewHash,
        p_request_id: v.requestId,
      }),
    ),
  );
const ownRead = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      ownSubmissionInputSchema,
      submissionViewSchema,
      "get_own_class_submission",
      (v) => ({ p_snapshot_id: v.snapshotId }),
    ),
  );
const teacherRead = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      teacherSubmissionInputSchema,
      submissionViewSchema,
      "get_teacher_class_submission",
      (v) => ({ p_class_id: v.classId, p_snapshot_id: v.snapshotId }),
    ),
  );
const ownList = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      ownSubmissionListSchema,
      submissionPageSchema,
      "list_own_class_submissions",
      (v) => ({ p_class_id: v.classId ?? null, p_cursor: v.cursor ?? null }),
    ),
  );
const teacherList = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      teacherSubmissionListSchema,
      submissionPageSchema,
      "list_teacher_class_submissions",
      (v) => ({
        p_class_id: v.classId,
        p_assignment_id: v.assignmentId ?? null,
        p_cursor: v.cursor ?? null,
      }),
    ),
  );
const withdraw = createServerFn({ method: "POST" })
  .middleware([privacy, requireSupabaseAuth])
  .inputValidator(identity)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      withdrawSubmissionSchema,
      submissionHeaderSchema,
      "withdraw_class_submission",
      (v) => ({ p_snapshot_id: v.snapshotId, p_request_id: v.requestId }),
    ),
  );
async function safe<T>(run: () => Promise<T>): Promise<T | SubmissionFailure> {
  try {
    return await run();
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
export const previewSubmission = (input: { data: z.infer<typeof previewSubmissionSchema> }) =>
  safe(() => preview(input));
export const submitSnapshot = (input: { data: z.infer<typeof confirmSubmissionSchema> }) =>
  safe(() => confirm(input));
export const getOwnSubmission = (input: { data: z.infer<typeof ownSubmissionInputSchema> }) =>
  safe(() => ownRead(input));
export const getTeacherSubmission = (input: {
  data: z.infer<typeof teacherSubmissionInputSchema>;
}) => safe(() => teacherRead(input));
export const listMySubmissions = (input: { data: z.infer<typeof ownSubmissionListSchema> }) =>
  safe(() => ownList(input));
export const listTeacherSubmissions = (input: {
  data: z.infer<typeof teacherSubmissionListSchema>;
}) => safe(() => teacherList(input));
export const withdrawSubmission = (input: { data: z.infer<typeof withdrawSubmissionSchema> }) =>
  safe(() => withdraw(input));
