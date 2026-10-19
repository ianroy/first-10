import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guestActivityResult, guestActivityFailureSchema } from "@/lib/guest-activities/contracts";
import {
  guestGrowthRecordSchema,
  guestGrowthPageSchema,
  guestGrowthHistorySchema,
  guestGrowthSaveReceiptSchema,
} from "@/lib/guest-growth/contracts";
import {
  guestGrowthAuthorityReceiptSchema,
  guestGrowthExportReceiptSchema,
  authorizeGuestGrowthExportSchema,
  growthRecordHash,
} from "@/lib/guest-growth/transport";
const path = process.env["FIRSTTEN_ACTUAL_GUEST_GROWTH_DTOS"];
(path ? describe : describe.skip)("fresh actual PostgreSQL guest growth DTOs", () => {
  const read = () => JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;
  it.each(["learning", "experiment", "pipeline_contact", "survey", "referral", "onboarding"])(
    "parses actual %s save and complete kind-specific fields",
    (kind) => {
      const r = guestActivityResult(guestGrowthSaveReceiptSchema).parse(read()[kind + "_save"]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.record.kind).toBe(kind);
        expect(r.data.savedRevision).toBe(1);
        expect(r.data.record.document.kind).toBe(kind);
      }
    },
  );
  it.each([
    ["replay", guestActivityResult(guestGrowthSaveReceiptSchema)],
    ["authority", guestGrowthAuthorityReceiptSchema],
    ["load", guestActivityResult(guestGrowthRecordSchema)],
    ["history", guestActivityResult(guestGrowthHistorySchema)],
    ["list", guestActivityResult(guestGrowthPageSchema)],
    ["denied", guestActivityFailureSchema],
    ["bulk_before", guestGrowthExportReceiptSchema],
    ["bulk_delivery", guestGrowthExportReceiptSchema],
  ] as const)("parses actual %s", (key, schema) => {
    expect(schema.safeParse(read()[key]).success).toBe(true);
  });
  it("validates all50 actual SQL-generated hash descriptors and canonical record-hash parity", async () => {
    const data = read(),
      spec = data["export_spec"] as Record<string, unknown>;
    const proof = authorizeGuestGrowthExportSchema.parse({ csrf: "b".repeat(64), ...spec });
    expect(proof.sources).toHaveLength(50);
    const r = guestActivityResult(guestGrowthRecordSchema).parse(data["hash_record"]);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(proof.sources[0]).toMatchObject({ recordHash: await growthRecordHash(r.data) });
  });
  it("matches canonical SQL hashes for every structured kind including Unicode and long content", async () => {
    const data = read(),
      hashes = data["record_hashes"] as Record<string, string>;
    for (const kind of [
      "learning",
      "experiment",
      "pipeline_contact",
      "survey",
      "referral",
      "onboarding",
    ]) {
      const r = guestActivityResult(guestGrowthSaveReceiptSchema).parse(data[kind + "_save"]);
      if (!r.ok) throw Error("Actual SQL save required");
      expect(hashes[kind + "_save"]).toBe(await growthRecordHash(r.data.record));
    }
  });
  it("never leaks session secrets, raw account identities or private relational manifests", () => {
    expect(JSON.stringify(read())).not.toMatch(
      /sessionToken|principalRecovery|teamReturn|teamInvite|p_session|SUPABASE|Bearer |user_id|project_id|reference_digest/,
    );
  });
});
