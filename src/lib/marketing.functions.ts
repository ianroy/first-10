import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  MARKETING_LIMITS,
  jsonBytes,
  loadMarketingPlanSchema,
  marketingIdSchema,
  marketingPlanSchema,
  saveMarketingPlanSchema,
  type LoadMarketingPlanResult,
  type MarketingFailure,
  type MarketingSourceStatus,
  type SaveMarketingPlanInput,
  type SaveMarketingPlanResult,
} from "./marketing-plan";

const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const savedAt = z.string().datetime({ precision: null });
const snapshot = z.object({ revision, savedAt, document: marketingPlanSchema }).strict();
const success = z
  .object({
    ok: z.literal(true),
    id: marketingIdSchema,
    revision,
    savedAt,
    document: marketingPlanSchema,
  })
  .strict();
const failure = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "STAGE_LOCKED",
      "INVALID_PLAN",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "UNAVAILABLE",
    ]),
    currentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const invalid = { ok: false, code: "INVALID_PLAN" } as const;
const unavailable = { ok: false, code: "UNAVAILABLE" } as const;

function boundedInput<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (jsonBytes(value) > MARKETING_LIMITS.requestBytes) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function requestTooLarge(): boolean {
  const length = getRequest().headers.get("content-length");
  return (
    length !== null && (!/^\d+$/.test(length) || Number(length) > MARKETING_LIMITS.requestBytes)
  );
}
function safeError(error: unknown): MarketingFailure {
  return error instanceof Error && error.message.startsWith("Unauthorized:")
    ? { ok: false, code: "UNAUTHENTICATED" }
    : unavailable;
}

const loadPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => boundedInput(loadMarketingPlanSchema, value))
  .handler(async ({ data, context }): Promise<LoadMarketingPlanResult> => {
    if (!data || requestTooLarge()) return invalid;
    const sb = context.supabase;
    const project = await sb
      .from("projects")
      .select("id,stage")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (project.error) return unavailable;
    if (!project.data) return { ok: false, code: "NOT_FOUND" };
    const result = await sb
      .from("marketing_plans")
      .select("id,revision,updated_at,document,history")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (result.error) return unavailable;
    const stage = project.data.stage;
    if (!result.data)
      return { ok: true, plan: null, stage, canWrite: stage >= 2, sourceStatus: [] };
    const row = result.data;
    const parsed = z
      .object({
        id: marketingIdSchema,
        revision,
        savedAt,
        document: marketingPlanSchema,
        history: z.array(snapshot).max(3),
      })
      .strict()
      .safeParse({
        id: row.id,
        revision: row.revision,
        savedAt: new Date(row.updated_at).toISOString(),
        document: row.document,
        history: row.history,
      });
    // Never substitute an empty plan when stored content is incompatible.
    if (!parsed.success) return invalid;
    const sources = parsed.data.document.sources;
    const interviewIds = sources
      .filter((source) => source.kind === "interview")
      .map((source) => source.recordId!);
    const learningIds = sources
      .filter((source) => source.kind === "accepted_learning")
      .map((source) => source.recordId!);
    const [interviews, learnings] = await Promise.all([
      interviewIds.length
        ? sb
            .from("interviews")
            .select("id")
            .eq("project_id", data.projectId)
            .eq("user_id", context.userId)
            .in("id", interviewIds)
        : Promise.resolve({ data: [], error: null }),
      learningIds.length
        ? sb
            .from("learnings")
            .select("id,accepted")
            .eq("project_id", data.projectId)
            .eq("user_id", context.userId)
            .in("id", learningIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (interviews.error || learnings.error) return unavailable;
    const interviewSet = new Set(interviews.data?.map((item) => item.id));
    const learningMap = new Map(learnings.data?.map((item) => [item.id, item.accepted]));
    const sourceStatus: MarketingSourceStatus[] = sources.map((source) => ({
      sourceId: source.id,
      status:
        source.kind === "interview"
          ? interviewSet.has(source.recordId!)
            ? "available"
            : "missing"
          : source.kind === "accepted_learning"
            ? !learningMap.has(source.recordId!)
              ? "missing"
              : learningMap.get(source.recordId!)
                ? "available"
                : "not_accepted"
            : "available",
    }));
    return { ok: true, plan: parsed.data, stage, canWrite: stage >= 2, sourceStatus };
  });

const savePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => boundedInput(saveMarketingPlanSchema, value))
  .handler(async ({ data, context }): Promise<SaveMarketingPlanResult> => {
    if (!data || requestTooLarge()) return invalid;
    const result = await context.supabase.rpc("save_marketing_plan", {
      p_project_id: data.projectId,
      p_expected_revision: data.expectedRevision,
      p_mutation_id: data.mutationId,
      p_complete_student_first: data.completeStudentFirst,
      p_document: data.document as Json,
    });
    if (result.error) return unavailable;
    const parsed = z.union([success, failure]).safeParse(result.data);
    if (!parsed.success) return unavailable;
    // Keep optional currentRevision absent rather than assigning undefined.
    if (!parsed.data.ok)
      return parsed.data.currentRevision === undefined
        ? { ok: false, code: parsed.data.code }
        : { ok: false, code: parsed.data.code, currentRevision: parsed.data.currentRevision };
    return parsed.data;
  });

// Both wrappers keep an auth/network failure in the same non-destructive result
// contract. Server functions still authenticate each request with the user's JWT.
export async function loadMarketingPlan(input: {
  data: z.infer<typeof loadMarketingPlanSchema>;
}): Promise<LoadMarketingPlanResult> {
  try {
    return await loadPlan(input);
  } catch (error) {
    return safeError(error);
  }
}
export async function saveMarketingPlan(input: {
  data: SaveMarketingPlanInput;
}): Promise<SaveMarketingPlanResult> {
  try {
    return await savePlan(input);
  } catch (error) {
    return safeError(error);
  }
}
