import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  marketingSelectionSchema,
  previewMarketingSchema,
  confirmMarketingSchema,
  marketingPayloadSchema,
  marketingChoiceSchema,
  marketingSelectionOptions,
  HANDOFF_LIMITS,
} from "@/lib/guest-marketing/handoff/contracts";
import { csrf, id, payload, record } from "./fixture";
it("keeps author-reported eligibility distinct from an explicit exact-copy teacher grant", () => {
  expect(
    marketingChoiceSchema.parse({ planId: id(4), choice: "unknown", revision: 0 }).choice,
  ).toBe("unknown");
  expect(
    marketingChoiceSchema.safeParse({ planId: id(4), choice: null, revision: 0 }).success,
  ).toBe(false);
  expect(
    confirmMarketingSchema.safeParse({
      csrf,
      previewId: id(7),
      previewHash: "a".repeat(64),
      requestId: id(8),
      selectedCopyConfirmed: false,
    }).success,
  ).toBe(false);
  expect(
    confirmMarketingSchema.safeParse({
      csrf,
      previewId: id(7),
      previewHash: "a".repeat(64),
      requestId: id(8),
      selectedCopyConfirmed: true,
      audience: "team",
    }).success,
  ).toBe(false);
});
it("rejects account/learning source kinds, duplicate selections and invented authority", () => {
  expect(marketingSelectionSchema.safeParse({ kind: "interview", recordId: id(1) }).success).toBe(
    false,
  );
  const selection = { kind: "audience" as const, recordId: id(4) },
    base = {
      csrf,
      planId: id(4),
      expectedPlanRevision: 2,
      assignmentId: id(6),
      threadId: id(8),
      requestId: id(10),
      selections: [selection],
      redactions: [],
      reflection: {
        title: "Test",
        interpretation: "",
        uncertainty: "",
        decision: "",
        nextAction: "",
      },
    };
  expect(previewMarketingSchema.safeParse(base).success).toBe(true);
  expect(
    previewMarketingSchema.safeParse({ ...base, selections: [selection, selection] }).success,
  ).toBe(false);
  expect(previewMarketingSchema.safeParse({ ...base, userId: id(3) }).success).toBe(false);
  expect(marketingSelectionOptions(record).map((o) => o.selection.kind)).toEqual([
    "thinking",
    "audience",
    "resources",
    "test",
    "reflection",
    "channel",
    "content",
    "outreach",
    "task",
    "measurement",
  ]);
});
it("keeps Unicode code-point bounds and explicit evidence labels", () => {
  expect(
    marketingPayloadSchema.safeParse({
      ...payload,
      excerpts: [{ ...payload.excerpts[0], text: "😀".repeat(6000) }],
    }).success,
  ).toBe(true);
  expect(
    marketingPayloadSchema.safeParse({
      ...payload,
      excerpts: [{ ...payload.excerpts[0], text: "😀".repeat(6001) }],
    }).success,
  ).toBe(false);
  expect(
    marketingPayloadSchema.safeParse({
      ...payload,
      excerpts: [{ ...payload.excerpts[0], evidenceLabel: "Verified customer demand" }],
    }).success,
  ).toBe(false);
});
it("pins conservative stored byte limits, real plan FKs and teacher metadata-only eligibility", () => {
  const s = readFileSync("supabase/migrations/20261018024000_guest_marketing_handoffs.sql", "utf8");
  expect(s).toContain(`<=${HANDOFF_LIMITS.publisherBytes}`);
  expect(s).toContain(`<=${HANDOFF_LIMITS.classBytes}`);
  expect(s).toContain("REFERENCES firstten_private.guest_marketing_plans(id,class_id,team_id)");
  const eligibility = s
    .split("CREATE FUNCTION firstten_private.marketing_publication_allowed")[1]!
    .split("CREATE FUNCTION firstten_private.marketing_submission_view")[0]!;
  expect(eligibility).not.toContain("document");
  expect(eligibility).not.toContain("planRevision");
  expect(s).not.toContain("ALTER TABLE firstten_private.class_submission");
});
