import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
export const foundingPartnerInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase()),
    school: z.string().trim().min(1).max(200),
    kind: z.enum(["interest", "feedback"]),
    note: z.string().trim().max(2000),
    website: z.literal(""),
  })
  .strict()
  .refine((value) => value.kind !== "feedback" || value.note.length > 0);
export type FoundingPartnerInput = z.input<typeof foundingPartnerInputSchema>;
export type FoundingPartnerResult =
  { ok: true } | { ok: false; code: "INVALID" | "UNAVAILABLE" | "RATE_LIMITED" };
const resultSchema = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({ ok: z.literal(false), code: z.enum(["INVALID", "UNAVAILABLE", "RATE_LIMITED"]) })
    .strict(),
]);
export const submitFoundingPartner = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FoundingPartnerInput)
  .handler(async ({ data }): Promise<FoundingPartnerResult> => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store");
    const input = foundingPartnerInputSchema.safeParse(data);
    if (!input.success) return { ok: false, code: "INVALID" };
    const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
    if (!secret || !process.env["SUPABASE_URL"]?.trim()) return { ok: false, code: "UNAVAILABLE" };
    try {
      let ipHash: string | null = null;
      // Vercel overwrites this platform header. Do not trust arbitrary forwarded-for headers.
      const platformIp =
        process.env["VERCEL"] === "1"
          ? getRequest().headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
          : null;
      if (platformIp && platformIp.length <= 256) {
        const { createHmac } = await import("node:crypto");
        ipHash = createHmac("sha256", secret)
          .update(`first-ten-founding-partners:${platformIp}`)
          .digest("hex");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // This narrow new RPC is runtime-checked while the coordinator regenerates public types.
      const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
      const response = await client
        .rpc("record_founding_partner", {
          p_email: input.data.email,
          p_school: input.data.school,
          p_kind: input.data.kind,
          p_note: input.data.note,
          p_ip_hash: ipHash,
        })
        .abortSignal(AbortSignal.timeout(8000));
      if (response.error) return { ok: false, code: "UNAVAILABLE" };
      const result = resultSchema.safeParse(response.data);
      return result.success ? result.data : { ok: false, code: "UNAVAILABLE" };
    } catch {
      return { ok: false, code: "UNAVAILABLE" };
    }
  });
