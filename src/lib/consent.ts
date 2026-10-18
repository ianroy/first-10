import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
export const CONSENT_POLICY_VERSION = 1 as const;
export const consentStateSchema = z.enum(["unknown", "granted", "declined", "withdrawn"]);
export type ConsentState = z.infer<typeof consentStateSchema>;
export const consentScopeSchema = z
  .object({
    projectId: z.string().uuid(),
    targetKind: z.enum(["project", "contact", "interview", "learning"]),
    targetId: z.string().uuid(),
  })
  .strict();
export type ConsentScope = z.infer<typeof consentScopeSchema>;
export const consentChoicesSchema = z
  .object({
    noteStatus: consentStateSchema,
    aiStatus: consentStateSchema,
    sharingStatus: consentStateSchema,
  })
  .strict();
export type ConsentChoices = z.infer<typeof consentChoicesSchema>;
export const unknownConsent: ConsentChoices = {
  noteStatus: "unknown",
  aiStatus: "unknown",
  sharingStatus: "unknown",
};
export const consentRecordSchema = consentScopeSchema
  .extend({
    ...consentChoicesSchema.shape,
    policyVersion: z.literal(1),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    evidenceInvalidated: z.boolean(),
    reportedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export const setConsentSchema = consentScopeSchema
  .extend({
    ...consentChoicesSchema.shape,
    policyVersion: z.literal(1),
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
export const captureInterviewSchema = z
  .object({
    projectId: z.string().uuid(),
    contactId: z.string().uuid().nullable(),
    answers: z
      .array(
        z
          .object({
            q: z.string().max(2400),
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
    noteStatus: z.literal("granted"),
    aiStatus: consentStateSchema,
    sharingStatus: consentStateSchema,
    policyVersion: z.literal(1),
    requestId: z.string().uuid(),
  })
  .strict();
export const captureReceiptSchema = z
  .object({ interviewId: z.string().uuid(), replayed: z.boolean() })
  .strict();
const sourceText = z.string();
export const safeAIContextSchema = z
  .object({
    project: z
      .object({
        name: sourceText,
        description: sourceText,
        audience: sourceText,
        problem: sourceText,
      })
      .strict(),
    interviews: z.array(
      z
        .object({
          answers: z.array(
            z.object({ q: sourceText, note: sourceText, quote: sourceText }).strict(),
          ),
          tags: z.array(sourceText),
        })
        .strict(),
    ),
    learnings: z.array(
      z
        .object({ title: sourceText, body: sourceText, data: z.unknown(), kind: sourceText })
        .strict(),
    ),
    contacts: z.array(
      z
        .object({
          relation: sourceText,
          why: sourceText,
          source: sourceText,
          stage: z.number().int(),
        })
        .strict(),
    ),
    excluded: z
      .object({
        interviews: z.number().int().nonnegative(),
        contacts: z.number().int().nonnegative(),
        learnings: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
const messages: Record<string, string> = {
  PROCESSING_PERMISSION_REQUIRED:
    "AI processing is not enabled for this idea. Review the saved privacy choices in Interview; manual work remains available.",
  EVIDENCE_REVIEW_REQUIRED:
    "This learning may contain withdrawn evidence. Keep it private and work manually until a source-linked redaction review is available.",
  REVISION_CONFLICT: "These privacy choices changed elsewhere. Reload them before saving again.",
  NOT_FOUND: "This private record is unavailable.",
  CONTEXT_LIMIT:
    "There is too much source material for this draft. Continue manually while a narrower source workflow is prepared.",
  INVALID_INPUT: "Check the privacy choices and try again.",
  IDEMPOTENCY_CONFLICT:
    "This save request no longer matches the original interview. Your previous saved work is unchanged.",
};
export function consentError(code: unknown): Error {
  return new Error(
    typeof code === "string" && messages[code]
      ? messages[code]
      : "Privacy settings could not be verified. Your saved work is unchanged.",
  );
}
export async function consentRpc(
  client: Pick<SupabaseClient, "rpc">,
  name:
    | "get_processing_consent"
    | "set_processing_consent"
    | "get_ai_processing_context"
    | "save_interview_with_consent",
  args: Record<string, unknown>,
) {
  try {
    return await client.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  } catch {
    throw consentError(null);
  }
}
export function parseConsentResult<T>(value: unknown, schema: z.ZodType<T>): T {
  const envelope = z
    .object({ ok: z.boolean(), data: z.unknown().optional(), code: z.string().optional() })
    .strict()
    .safeParse(value);
  if (!envelope.success) throw consentError(null);
  if (!envelope.data.ok) throw consentError(envelope.data.code);
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) throw consentError(null);
  return parsed.data;
}
export async function loadAIProcessingContext(
  client: Pick<SupabaseClient, "rpc">,
  projectId: string,
  kind: "questions" | "synthesis" | "stage2" | "stage3",
) {
  const result = await consentRpc(client, "get_ai_processing_context", {
    p_project_id: projectId,
    p_kind: kind,
  });
  if (result.error) throw consentError(null);
  return parseConsentResult(result.data, safeAIContextSchema);
}
