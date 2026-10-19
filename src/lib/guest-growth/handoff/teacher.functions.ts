import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { privacy } from "@/lib/guest-spaces/security.server";
import {
  guestActivityResult,
  growthSubmissionPageSchema,
  growthSubmissionViewSchema,
} from "./contracts";
const uuid = z.string().uuid();
const scope = z.object({ classId: uuid }).strict();
const read = scope.extend({ snapshotId: uuid }).strict();
const list = scope.extend({ assignmentId: uuid.optional(), cursor: uuid.optional() }).strict();
async function execute<I, O>(
  value: unknown,
  context: { userId: string; supabase: SupabaseClient },
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: string,
  args: (data: I) => Record<string, unknown>,
) {
  try {
    privacy();
    const parsed = input.safeParse(value);
    if (!parsed.success || new TextEncoder().encode(JSON.stringify(value)).length > 4096)
      return { ok: false as const, code: "INVALID_INPUT" as const };
    const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
    if (!token) return { ok: false as const, code: "NOT_FOUND" as const };
    const user = await context.supabase.auth.getUser(token);
    if (user.error || user.data.user?.id !== context.userId)
      return { ok: false as const, code: "NOT_FOUND" as const };
    const result = await context.supabase
      .rpc(name, args(parsed.data))
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error) return { ok: false as const, code: "UNAVAILABLE" as const };
    if (new TextEncoder().encode(JSON.stringify(result.data)).length > 98304)
      return { ok: false as const, code: "UNAVAILABLE" as const };
    const receipt = output.safeParse(result.data);
    return receipt.success ? receipt.data : { ok: false as const, code: "UNAVAILABLE" as const };
  } catch {
    return { ok: false as const, code: "UNAVAILABLE" as const };
  }
}
const get = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      read,
      guestActivityResult(growthSubmissionViewSchema),
      "get_teacher_guest_growth_submission",
      (d) => ({ p_class_id: d.classId, p_snapshot_id: d.snapshotId }),
    ),
  );
const listed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v)
  .handler(({ data, context }) =>
    execute(
      data,
      context,
      list,
      guestActivityResult(growthSubmissionPageSchema),
      "list_teacher_guest_growth_submissions",
      (d) => ({
        p_class_id: d.classId,
        p_assignment_id: d.assignmentId ?? null,
        p_cursor: d.cursor ?? null,
      }),
    ),
  );
export const getTeacherGrowthSubmission = (input: { data: z.infer<typeof read> }) => get(input);
export const listTeacherGrowthSubmissions = (input: { data: z.infer<typeof list> }) =>
  listed(input);
