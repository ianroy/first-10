import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  consentScopeSchema,
  setConsentSchema,
  captureInterviewSchema,
  consentRecordSchema,
  captureReceiptSchema,
  consentRpc,
  parseConsentResult,
  consentError,
} from "./consent";
async function fresh(client: Pick<SupabaseClient, "auth" | "rpc">, userId: string) {
  setResponseHeader("Cache-Control", "private, no-store");
  const token = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 16384) throw consentError(null);
  let verified;
  try {
    verified = await client.auth.getUser(token);
  } catch {
    throw consentError(null);
  }
  if (verified.error || verified.data.user?.id !== userId) throw consentError(null);
}
export const getProcessingConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => consentScopeSchema.parse(data))
  .handler(async ({ data, context }) => {
    await fresh(context.supabase, context.userId);
    const result = await consentRpc(
      context.supabase as unknown as Pick<SupabaseClient, "rpc">,
      "get_processing_consent",
      { p_project_id: data.projectId, p_target_kind: data.targetKind, p_target_id: data.targetId },
    );
    if (result.error) throw consentError(null);
    return parseConsentResult(result.data, consentRecordSchema);
  });
export const setProcessingConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => setConsentSchema.parse(data))
  .handler(async ({ data, context }) => {
    await fresh(context.supabase, context.userId);
    const result = await consentRpc(
      context.supabase as unknown as Pick<SupabaseClient, "rpc">,
      "set_processing_consent",
      {
        p_project_id: data.projectId,
        p_target_kind: data.targetKind,
        p_target_id: data.targetId,
        p_note_status: data.noteStatus,
        p_ai_status: data.aiStatus,
        p_sharing_status: data.sharingStatus,
        p_policy_version: data.policyVersion,
        p_expected_revision: data.expectedRevision,
      },
    );
    if (result.error) throw consentError(null);
    return parseConsentResult(result.data, consentRecordSchema);
  });
export const saveInterviewWithConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => captureInterviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    await fresh(context.supabase, context.userId);
    const result = await consentRpc(
      context.supabase as unknown as Pick<SupabaseClient, "rpc">,
      "save_interview_with_consent",
      {
        p_project_id: data.projectId,
        p_contact_id: data.contactId,
        p_answers: data.answers,
        p_tags: data.tags,
        p_note_status: data.noteStatus,
        p_ai_status: data.aiStatus,
        p_sharing_status: data.sharingStatus,
        p_policy_version: data.policyVersion,
        p_request_id: data.requestId,
      },
    );
    if (result.error) throw consentError(null);
    return parseConsentResult(result.data, captureReceiptSchema);
  });
