import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { privacy, sameOrigin, sessionToken, verifyCsrf } from "@/lib/guest-spaces/security.server";
import {
  guestActivityFailureSchema,
  type GuestActivityFailure,
} from "@/lib/guest-activities/contracts";
import { jsonBytes } from "@/lib/marketing-plan";
import { guestGrowthAuthorityReceiptSchema, canonicalGrowthJson } from "../transport";
import { HANDOFF_LIMITS } from "./contracts";
type Rpc =
  | "get_guest_growth_sharing_choice"
  | "save_guest_growth_sharing_choice"
  | "get_guest_growth_handoff_sources"
  | "preview_guest_growth_submission"
  | "confirm_guest_growth_submission"
  | "get_guest_growth_submission"
  | "list_guest_growth_submissions"
  | "withdraw_guest_growth_submission";
const failure = (code: GuestActivityFailure["code"]): GuestActivityFailure => ({ ok: false, code });
/** Fixed server call sites only. HttpOnly cookie is the sole guest actor. */
export async function executeHandoff<I extends { csrf: string }, O>(
  value: unknown,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  name: Rpc,
  args: (data: I) => Record<string, unknown>,
): Promise<O | GuestActivityFailure> {
  try {
    privacy();
    const request = getRequest();
    if (!sameOrigin(request)) return failure("FORBIDDEN");
    const length = request.headers.get("content-length");
    if (
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) > HANDOFF_LIMITS.requestBytes)) ||
      jsonBytes(value) > HANDOFF_LIMITS.requestBytes
    )
      return failure("INVALID_INPUT");
    const parsed = input.safeParse(value);
    if (!parsed.success) return failure("INVALID_INPUT");
    if (!verifyCsrf(parsed.data.csrf)) return failure("FORBIDDEN");
    const session = sessionToken();
    if (!session) return failure("NOT_FOUND");
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || !process.env["SUPABASE_URL"]?.trim())
      return failure("UNAVAILABLE");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
    const signal = AbortSignal.timeout(20000);
    async function call(rpc: string, parameters: Record<string, unknown>, cap: number) {
      signal.throwIfAborted();
      const r = await client
        .rpc(rpc, { p_session: session, ...parameters })
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(10000)]));
      signal.throwIfAborted();
      if (r.error || jsonBytes(r.data) > cap) throw Error("Unavailable closed response");
      return r.data as unknown;
    }
    const beforeRaw = await call("get_guest_growth_authority", {}, 4096);
    const before = guestGrowthAuthorityReceiptSchema.safeParse(beforeRaw);
    if (!before.success) {
      const f = guestActivityFailureSchema.safeParse(beforeRaw);
      return f.success ? f.data : failure("UNAVAILABLE");
    }
    if (Date.now() >= Date.parse(before.data.data.accessExpiresAt)) return failure("NOT_FOUND");
    const raw = await call(name, args(parsed.data), 98304),
      denied = guestActivityFailureSchema.safeParse(raw);
    if (denied.success) return denied.data;
    const receipt = output.safeParse(raw);
    if (!receipt.success) return failure("UNAVAILABLE");
    // DTO identity checks supplement, never replace, the locked DB authorization.
    const returned = (receipt.data as { data?: Record<string, unknown> }).data;
    const requestData = parsed.data as I & { artifactId?: string; snapshotId?: string };
    if (returned) {
      if (returned["classId"] !== undefined && returned["classId"] !== before.data.data.classId)
        return failure("UNAVAILABLE");
      if (
        returned["publisher"] !== undefined &&
        returned["publisher"] !== before.data.data.principalId
      )
        return failure("UNAVAILABLE");
      if (
        requestData.artifactId &&
        returned["artifactId"] !== undefined &&
        returned["artifactId"] !== requestData.artifactId
      )
        return failure("UNAVAILABLE");
      if (
        requestData.snapshotId &&
        returned["id"] !== undefined &&
        returned["id"] !== requestData.snapshotId
      )
        return failure("UNAVAILABLE");
      if (
        Array.isArray(returned["items"]) &&
        returned["items"].some((h: { classId?: string }) => h.classId !== before.data.data.classId)
      )
        return failure("UNAVAILABLE");
    }
    const after = guestGrowthAuthorityReceiptSchema.safeParse(
      await call("get_guest_growth_authority", {}, 4096),
    );
    if (
      !after.success ||
      Date.now() >= Date.parse(after.data.data.accessExpiresAt) ||
      canonicalGrowthJson(after.data.data) !== canonicalGrowthJson(before.data.data)
    )
      return failure("NOT_FOUND");
    return receipt.data;
  } catch {
    return failure("UNAVAILABLE");
  }
}
