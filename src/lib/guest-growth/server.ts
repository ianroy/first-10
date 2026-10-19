import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { privacy, sameOrigin, sessionToken, verifyCsrf } from "@/lib/guest-spaces/security.server";
import { guestSessionDatabaseSchema, type GuestView } from "@/lib/guest-spaces/contracts";
import {
  guestActivityFailureSchema,
  type GuestActivityFailure,
} from "@/lib/guest-activities/contracts";
import { jsonBytes } from "@/lib/marketing-plan";
import {
  GUEST_GROWTH_LIMITS,
  listGuestGrowthSchema,
  loadGuestGrowthSchema,
  saveGuestGrowthSchema,
  guestGrowthHeaderSchema,
  guestGrowthRecordSchema,
  guestGrowthPageSchema,
  guestGrowthHistorySchema,
  guestGrowthSaveReceiptSchema,
} from "./contracts";
import {
  authorizeGuestGrowthExportSchema,
  historyGuestGrowthSchema,
  growthRecordHash,
  growthContextHash,
  canonicalGrowthJson,
} from "./transport";

type Code = GuestActivityFailure["code"];
class Denied extends Error {
  constructor(readonly code: Code) {
    super("Guest growth unavailable");
  }
}
const fail = (code: Code): GuestActivityFailure => ({ ok: false, code });
const schemas = {
  list: listGuestGrowthSchema,
  load: loadGuestGrowthSchema,
  history: historyGuestGrowthSchema,
  save: saveGuestGrowthSchema,
  authorize: authorizeGuestGrowthExportSchema,
};
type Operation = keyof typeof schemas;
const RPC = {
  list: "list_guest_growth_artifacts",
  load: "load_guest_growth_artifact",
  history: "get_guest_growth_history",
  save: "save_guest_growth_artifact",
} as const;
type Rpc = (typeof RPC)[keyof typeof RPC] | "get_guest_session";
type Context = { session: string; signal: AbortSignal };
async function rpc(name: Rpc, context: Context, args: Record<string, unknown> = {}) {
  context.signal.throwIfAborted();
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || !process.env["SUPABASE_URL"]?.trim())
    throw new Denied("UNAVAILABLE");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
  const result = await client
    .rpc(name, { p_session: context.session, ...args })
    .abortSignal(AbortSignal.any([context.signal, AbortSignal.timeout(10000)]));
  context.signal.throwIfAborted();
  if (result.error || jsonBytes(result.data) > (name === "get_guest_session" ? 262144 : 98304))
    throw new Denied("UNAVAILABLE");
  return result.data as unknown;
}
async function fresh(context: Context) {
  const result = guestSessionDatabaseSchema.safeParse(await rpc("get_guest_session", context));
  if (!result.success || Date.now() >= Date.parse(result.data.data.accessExpiresAt))
    throw new Denied("NOT_FOUND");
  return result.data.data;
}
function sameScope(
  a: GuestView,
  b: { classId: string; teamId: string; principalId: string; accessExpiresAt: string },
) {
  return (
    a.classId === b.classId &&
    a.teamId === b.teamId &&
    a.principalId === b.principalId &&
    a.accessExpiresAt === b.accessExpiresAt
  );
}
function allowed(view: GuestView, h: z.infer<typeof guestGrowthHeaderSchema>) {
  return (
    h.classId === view.classId &&
    h.teamId === view.teamId &&
    (h.audience === "team_shared" || h.authorPrincipalId === view.principalId)
  );
}
function receipt<T>(schema: z.ZodType<T>, raw: unknown): T {
  const denied = guestActivityFailureSchema.safeParse(raw);
  if (denied.success) {
    if (
      denied.data.currentRevision !== undefined &&
      denied.data.currentRevision > GUEST_GROWTH_LIMITS.revisions
    )
      throw new Denied("UNAVAILABLE");
    throw new Denied(denied.data.code);
  }
  const r = z
    .object({ ok: z.literal(true), data: schema })
    .strict()
    .safeParse(raw);
  if (!r.success) throw new Denied("UNAVAILABLE");
  return r.data.data as T;
}
type GrowthData =
  | z.infer<typeof guestGrowthPageSchema>
  | z.infer<typeof guestGrowthRecordSchema>
  | z.infer<typeof guestGrowthHistorySchema>
  | z.infer<typeof guestGrowthSaveReceiptSchema>;
type GrowthResult = GuestActivityFailure | { ok: true; data: GrowthData } | { ok: true };
/** Fixed server call sites only. No caller RPC name, actor, auth user or project is accepted. */
export async function runGuestGrowth(operation: Operation, value: unknown): Promise<GrowthResult> {
  try {
    privacy();
    const request = getRequest();
    if (!sameOrigin(request)) return fail("FORBIDDEN");
    const length = request.headers.get("content-length");
    if (
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) > GUEST_GROWTH_LIMITS.requestBytes)) ||
      jsonBytes(value) > GUEST_GROWTH_LIMITS.requestBytes
    )
      return fail("INVALID_INPUT");
    const input = schemas[operation].safeParse(value);
    if (!input.success) return fail("INVALID_INPUT");
    if (!verifyCsrf(input.data.csrf)) return fail("FORBIDDEN");
    const session = sessionToken();
    if (!session) return fail("NOT_FOUND");
    const context = { session, signal: AbortSignal.timeout(20000) };
    const view = await fresh(context);
    let data: GrowthData;
    switch (operation) {
      case "list": {
        const d = listGuestGrowthSchema.parse(input.data);
        const page = receipt(
          guestGrowthPageSchema,
          await rpc(RPC.list, context, { p_kind: d.kind ?? null, p_cursor: d.cursor ?? null }),
        );
        if (
          page.items.some((h) => !allowed(view, h) || (d.kind && h.kind !== d.kind)) ||
          new Set(page.items.map((h) => h.id)).size !== page.items.length
        )
          throw new Denied("UNAVAILABLE");
        data = page;
        break;
      }
      case "load": {
        const d = loadGuestGrowthSchema.parse(input.data);
        const record = receipt(
          guestGrowthRecordSchema,
          await rpc(RPC.load, context, {
            p_artifact_id: d.artifactId,
            p_revision: d.revision ?? null,
          }),
        );
        if (
          !allowed(view, record) ||
          record.id !== d.artifactId ||
          (d.revision !== undefined && record.revision !== d.revision)
        )
          throw new Denied("UNAVAILABLE");
        data = record;
        break;
      }
      case "history": {
        const d = historyGuestGrowthSchema.parse(input.data);
        const history = receipt(
          guestGrowthHistorySchema,
          await rpc(RPC.history, context, { p_artifact_id: d.artifactId }),
        );
        if (history.artifactId !== d.artifactId || history.versions.some((h) => !allowed(view, h)))
          throw new Denied("UNAVAILABLE");
        data = history;
        break;
      }
      case "save": {
        const d = saveGuestGrowthSchema.parse(input.data);
        const saved = receipt(
          guestGrowthSaveReceiptSchema,
          await rpc(RPC.save, context, {
            p_artifact_id: d.artifactId,
            p_audience: d.audience,
            p_expected_revision: d.expectedRevision,
            p_mutation_id: d.mutationId,
            p_shared_confirmed: d.sharedAudienceConfirmed,
            p_document: d.document,
          }),
        );
        if (
          !allowed(view, saved.record) ||
          saved.record.id !== d.artifactId ||
          saved.record.kind !== d.document.kind ||
          saved.record.audience !== d.audience ||
          saved.savedRevision !== d.expectedRevision + 1 ||
          (d.expectedRevision === 0 && saved.record.authorPrincipalId !== view.principalId) ||
          (saved.record.revision === saved.savedRevision &&
            canonicalGrowthJson(saved.record.document) !== canonicalGrowthJson(d.document))
        )
          throw new Denied("UNAVAILABLE");
        data = saved;
        break;
      }
      case "authorize": {
        const d = authorizeGuestGrowthExportSchema.parse(input.data);
        if (!sameScope(view, d.scope) || d.scope.contextHash !== (await growthContextHash(view)))
          throw new Denied("CHANGED");
        // At most50 sequential exact reads; no body-reference traversal or unsaved-text transmission.
        for (const s of d.sources) {
          if (s.state === "draft") continue;
          const r = receipt(
            guestGrowthRecordSchema,
            await rpc(RPC.load, context, { p_artifact_id: s.artifactId, p_revision: s.revision }),
          );
          if (
            !allowed(view, r) ||
            r.id !== s.artifactId ||
            r.revision !== s.revision ||
            r.kind !== s.kind ||
            r.audience !== s.audience ||
            r.authorPrincipalId !== s.authorPrincipalId ||
            (await growthRecordHash(r)) !== s.recordHash
          )
            throw new Denied("CHANGED");
        }
        const after = await fresh(context);
        if (!sameScope(after, view) || d.scope.contextHash !== (await growthContextHash(after)))
          throw new Denied("CHANGED");
        return { ok: true };
      }
    }
    const after = await fresh(context);
    if (!sameScope(after, view)) return fail("CHANGED");
    return { ok: true, data };
  } catch (error) {
    // Never reflect RPC messages, exception text, raw notes, cookie tokens or validation payloads.
    return fail(error instanceof Denied ? error.code : "UNAVAILABLE");
  }
}
