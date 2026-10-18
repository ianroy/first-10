import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jsonBytes } from "./marketing-plan";
import {
  draftScopeSchema,
  createDraftSchema,
  saveDraftSchema,
  completeDraftSchema,
  draftFailureSchema,
  interviewDraftRecordSchema,
  draftSummarySchema,
  type DraftRecordResult,
  type DraftListResult,
  type CompleteDraftResult,
} from "./interview-drafts";
const unavailable = { ok: false, code: "UNAVAILABLE" } as const,
  invalid = { ok: false, code: "INVALID_INPUT" } as const;
const listInput = z.object({ projectId: z.string().uuid() }).strict();
const recordResult = z.union([
  draftFailureSchema,
  z.object({ ok: z.literal(true), draft: interviewDraftRecordSchema }).strict(),
]);
const listResult = z.union([
  draftFailureSchema,
  z.object({ ok: z.literal(true), drafts: z.array(draftSummarySchema).max(100) }).strict(),
]);
const completeResult = z.union([
  draftFailureSchema,
  z
    .object({
      ok: z.literal(true),
      interviewId: z.string().uuid(),
      replayed: z.boolean(),
      completedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
]);
function bounded<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (jsonBytes(value) > 98304) return null;
  const r = schema.safeParse(value);
  return r.success ? r.data : null;
}
async function rpc(
  context: { supabase: SupabaseClient; userId: string },
  name: string,
  args: Record<string, unknown>,
) {
  setResponseHeader("Cache-Control", "private, no-store");
  const req = getRequest();
  const n = req.headers.get("content-length");
  if (n !== null && (!/^\d+$/.test(n) || Number(n) > 98304)) return invalid;
  const token = /^Bearer ([^\s,]+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 16384) return { ok: false, code: "UNAUTHENTICATED" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const verified = await Promise.race([
    context.supabase.auth.getUser(token),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Auth verification timed out")), 15000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (verified.error || verified.data.user?.id !== context.userId)
    return { ok: false, code: "UNAUTHENTICATED" };
  const result = await context.supabase.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
  return result.error ? unavailable : result.data;
}
const listFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => bounded(listInput, v))
  .handler(async ({ data, context }): Promise<DraftListResult> => {
    if (!data) return invalid;
    const p = listResult.safeParse(
      await rpc(context as unknown as Parameters<typeof rpc>[0], "list_interview_drafts", {
        p_project_id: data.projectId,
      }),
    );
    return p.success ? p.data : unavailable;
  });
const loadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => bounded(draftScopeSchema, v))
  .handler(async ({ data, context }): Promise<DraftRecordResult> => {
    if (!data) return invalid;
    const p = recordResult.safeParse(
      await rpc(context as unknown as Parameters<typeof rpc>[0], "load_interview_draft", {
        p_project_id: data.projectId,
        p_draft_id: data.draftId,
      }),
    );
    return p.success ? p.data : unavailable;
  });
const createFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => bounded(createDraftSchema, v))
  .handler(async ({ data, context }): Promise<DraftRecordResult> => {
    if (!data) return invalid;
    const p = recordResult.safeParse(
      await rpc(context as unknown as Parameters<typeof rpc>[0], "create_interview_draft", {
        p_project_id: data.projectId,
        p_draft_id: data.draftId,
        p_contact_id: data.contactId,
        p_expected_questions: data.expectedQuestions,
        p_expected_origin_id: data.expectedOriginId,
        p_note_status: data.noteStatus,
      }),
    );
    return p.success ? p.data : unavailable;
  });
const saveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => bounded(saveDraftSchema, v))
  .handler(async ({ data, context }): Promise<DraftRecordResult> => {
    if (!data) return invalid;
    const p = recordResult.safeParse(
      await rpc(context as unknown as Parameters<typeof rpc>[0], "save_interview_draft", {
        p_project_id: data.projectId,
        p_draft_id: data.draftId,
        p_expected_revision: data.expectedRevision,
        p_mutation_id: data.mutationId,
        p_contact_id: data.contactId,
        p_document: data.document,
      }),
    );
    return p.success ? p.data : unavailable;
  });
const completeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => bounded(completeDraftSchema, v))
  .handler(async ({ data, context }): Promise<CompleteDraftResult> => {
    if (!data) return invalid;
    const p = completeResult.safeParse(
      await rpc(context as unknown as Parameters<typeof rpc>[0], "complete_interview_draft", {
        p_project_id: data.projectId,
        p_draft_id: data.draftId,
        p_expected_revision: data.expectedRevision,
      }),
    );
    return p.success ? p.data : unavailable;
  });
function failure(e: unknown) {
  return e instanceof Error && e.message.startsWith("Unauthorized:")
    ? ({ ok: false, code: "UNAUTHENTICATED" } as const)
    : unavailable;
}
export async function listInterviewDrafts(input: {
  data: z.infer<typeof listInput>;
}): Promise<DraftListResult> {
  try {
    return await listFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function loadInterviewDraft(input: {
  data: z.infer<typeof draftScopeSchema>;
}): Promise<DraftRecordResult> {
  try {
    return await loadFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function createInterviewDraft(input: {
  data: z.infer<typeof createDraftSchema>;
}): Promise<DraftRecordResult> {
  try {
    return await createFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function saveInterviewDraft(input: {
  data: z.infer<typeof saveDraftSchema>;
}): Promise<DraftRecordResult> {
  try {
    return await saveFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function completeInterviewDraft(input: {
  data: z.infer<typeof completeDraftSchema>;
}): Promise<CompleteDraftResult> {
  try {
    return await completeFn(input);
  } catch (e) {
    return failure(e);
  }
}
