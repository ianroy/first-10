import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  guestActivityResult,
  guestActivityFailureSchema,
  guestMarketingRecordSchema,
  guestMarketingHeaderSchema,
  guestMarketingReceiptSchema,
} from "@/lib/guest-marketing/contracts";
const path = process.env["FIRSTTEN_ACTUAL_GUEST_MARKETING_DTOS"];
(path ? describe : describe.skip)("actual PostgreSQL guest Marketing Lab DTOs", () => {
  const read = () => JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;
  it.each([
    ["save", guestActivityResult(guestMarketingReceiptSchema)],
    ["replay", guestActivityResult(guestMarketingReceiptSchema)],
    ["load", guestActivityResult(guestMarketingRecordSchema)],
    ["list", guestActivityResult(z.array(guestMarketingHeaderSchema).max(8))],
    ["denied", guestActivityFailureSchema],
  ] as const)("accepts actual %s response", (key, schema) => {
    const value = read()[key];
    expect((value as { ok: boolean }).ok).toBe(key !== "denied");
    const r = schema.safeParse(value);
    expect(r.success, r.success ? "valid" : JSON.stringify(r.error.issues)).toBe(true);
  });
  it("never returns cookie credentials or fake account scope", () => {
    expect(JSON.stringify(read())).not.toMatch(
      /sessionToken|principalRecovery|teamReturn|teamInvite|p_session|SUPABASE|Bearer |user_id|project_id/,
    );
  });
});
