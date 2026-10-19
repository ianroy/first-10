import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  guestActivityResult,
  growthPreviewSchema,
  growthSubmissionViewSchema,
  growthSubmissionHeaderSchema,
  growthSubmissionPageSchema,
  sourceRosterSchema,
} from "@/lib/guest-growth/handoff/contracts";
const path = process.env["FIRSTTEN_ACTUAL_GUEST_GROWTH_HANDOFF_DTOS"];
(path ? describe : describe.skip)("actual PostgreSQL growth reviewed-copy DTOs", () => {
  const read = () => JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;
  it.each(["learning", "experiment", "pipeline_contact", "survey", "referral", "onboarding"])(
    "parses actual %s preview and confirmed copy",
    (kind) => {
      const p = guestActivityResult(growthPreviewSchema).parse(read()["preview_" + kind]);
      const c = guestActivityResult(growthSubmissionViewSchema).parse(read()["copy_" + kind]);
      expect(p.ok && c.ok).toBe(true);
      if (p.ok && c.ok) {
        expect(c.data.payload).toEqual(p.data.payload);
        expect(c.data.payload.sourceKind).toBe("guest_growth");
        expect(c.data.recipientEligible).toBe(true);
        expect(c.data.payload.excerpts.length).toBeGreaterThan(0);
      }
    },
  );
  it.each([
    ["roster", sourceRosterSchema],
    ["author", growthSubmissionViewSchema],
    ["teacher", growthSubmissionViewSchema],
    ["teacher_list", growthSubmissionPageSchema],
    ["withdrawn", growthSubmissionHeaderSchema],
  ] as const)("parses actual %s", (key, schema) => {
    expect(guestActivityResult(schema).safeParse(read()[key]).success).toBe(true);
  });
  it("keeps source/question IDs and private relational manifests out of every actual teacher payload", () => {
    for (const [k, v] of Object.entries(read())) {
      if (k === "roster" || k === "teacher_list" || k === "withdrawn") continue;
      const r = v as { data: { payload: unknown } };
      const text = JSON.stringify(r.data.payload);
      expect(text).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|sourceHashes|choiceRevision|referenceDigest|principalId|artifactId|questionId|project_id|sessionToken|p_session/,
      );
    }
  });
});
