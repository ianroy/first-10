import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { measurementResultSchema, retentionHealthSchema } from "@/lib/analytics-contracts";
const path = process.env["FIRSTTEN_ACTUAL_AN002_DTOS"];
(path ? describe : describe.skip)("actual PostgreSQL measurement DTOs", () => {
  const read = () => JSON.parse(readFileSync(path!, "utf8"));
  it("validates fresh owner choice and audited health through production schemas", () => {
    expect(measurementResultSchema.safeParse(read().preference).success).toBe(true);
    expect(retentionHealthSchema.safeParse(read().health).success).toBe(true);
  });
  it("contains neither source evidence nor identifiers nor accounting", () => {
    expect(JSON.stringify(read())).not.toMatch(
      /PRIVATE_|user_id|subject_ref|project_ref|artifact_ref|charge_micro|sessionToken|Bearer /,
    );
  });
});
