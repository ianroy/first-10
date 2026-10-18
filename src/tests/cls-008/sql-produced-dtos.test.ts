import { readFileSync } from "node:fs";
import { z } from "zod";
import { describe, it, expect } from "vitest";
import {
  guestActivityResult,
  guestActivityRecordSchema,
  guestActivityHeaderSchema,
  guestSaveReceiptSchema,
  guestSubmissionPreviewSchema,
  guestSubmissionViewSchema,
  guestSubmissionHeaderSchema,
  guestActivityFailureSchema,
} from "@/lib/guest-activities/contracts";
const path = process.env["FIRSTTEN_ACTUAL_GUEST_DTOS"];
// This test is meaningful only with fresh actual SQL output produced by the guarded clone harness.
(path ? describe : describe.skip)("actual PostgreSQL guest DTOs through production schemas", () => {
  const read = () => JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;
  it.each([
    ["save", guestActivityResult(guestSaveReceiptSchema)],
    ["replay", guestActivityResult(guestSaveReceiptSchema)],
    ["load", guestActivityResult(guestActivityRecordSchema)],
    ["list", guestActivityResult(z.array(guestActivityHeaderSchema).max(15))],
    ["preview", guestActivityResult(guestSubmissionPreviewSchema)],
    ["submitted", guestActivityResult(guestSubmissionViewSchema)],
    ["team", guestActivityResult(guestSubmissionViewSchema)],
    ["teacher", guestActivityResult(guestSubmissionViewSchema)],
    ["withdrawn", guestActivityResult(guestSubmissionHeaderSchema)],
    ["denied", guestActivityFailureSchema],
  ] as const)("accepts actual %s DTO, never an authored stand-in", (key, schema) => {
    const value = read()[key];
    expect((value as { ok: boolean }).ok).toBe(key !== "denied");
    const result = schema.safeParse(value);
    expect(
      result.success,
      result.success ? "valid actual SQL DTO" : JSON.stringify(result.error.issues),
    ).toBe(true);
  });
  it("contains no transport/session credentials, manifests, fake owners or private teacher joins", () => {
    const data = read(),
      text = JSON.stringify(data);
    expect(text).not.toMatch(
      /sessionToken|principalRecovery|teamReturn|teamInvite|p_session|SUPABASE|Bearer |permissionRefs|manifest|binding_hash/,
    );
    const teacher = data["teacher"] as { ok: boolean; data: { payload: unknown } };
    expect(teacher.ok).toBe(true);
    expect(JSON.stringify(teacher.data.payload)).not.toContain("Private alias NOT DISCLOSED");
    expect(JSON.stringify(teacher.data.payload)).not.toContain("foo@example.org");
  });
});
