import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  createGuestMarketing,
  guestMarketingDocumentSchema,
  guestMarketingSqlShape,
  preservedMarketingError,
  saveGuestMarketingSchema,
} from "@/lib/guest-marketing/contracts";
import { marketingFixture, fixtureId as id } from "./fixture";
it("uses the same closed field shape as SQL without account or AI fields", () => {
  const sql = readFileSync("supabase/migrations/20261018023000_guest_marketing_plans.sql", "utf8");
  expect(sql).toContain(JSON.stringify(guestMarketingSqlShape()));
  expect(guestMarketingDocumentSchema.parse(marketingFixture())).toEqual(marketingFixture());
  expect(
    guestMarketingDocumentSchema.safeParse({ ...marketingFixture(), projectId: id(1) }).success,
  ).toBe(false);
});
it("keeps unknown counts distinct from zero and fixes cash budget at zero", () => {
  const d = createGuestMarketing();
  expect(d.test.baseline).toBeNull();
  d.test.target = 0;
  expect(guestMarketingDocumentSchema.parse(d).test.target).toBe(0);
  expect(
    guestMarketingDocumentSchema.safeParse({
      ...d,
      resources: { ...d.resources, cashBudgetCents: 1 },
    }).success,
  ).toBe(false);
});
it("checks channel/content/measurement references and duplicate identifiers", () => {
  const d = marketingFixture();
  d.content[0]!.channelId = id(999);
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
  const e = marketingFixture();
  e.outreach[0]!.id = e.content[0]!.id;
  expect(guestMarketingDocumentSchema.safeParse(e).success).toBe(false);
  const f = marketingFixture();
  f.reflection.evidenceIds = [id(999)];
  expect(guestMarketingDocumentSchema.safeParse(f).success).toBe(false);
});
it("rejects invalid calendar days, reversed windows and unsupported counts", () => {
  for (const day of ["2026-02-30", "0000-01-01", "2026-13-01"]) {
    const d = marketingFixture();
    d.measurements[0]!.from = day;
    expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
  }
  const d = marketingFixture();
  d.measurements[0]!.to = "2026-10-17";
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
  d.measurements[0]!.to = "2026-10-18";
  d.measurements[0]!.count = 1.5;
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
});
it("retains completed initial thinking while allowing a later audience revision", () => {
  const before = marketingFixture(),
    next = structuredClone(before);
  next.thinking.observations = "Rewrite";
  expect(preservedMarketingError(before, next)).toContain("preserved");
  next.thinking = before.thinking;
  next.audience.beachhead = "Different relevant situation";
  expect(preservedMarketingError(before, next)).toBeNull();
});
it("uses Unicode code point bounds and rejects likely credentials", () => {
  const d = marketingFixture();
  d.channels[0]!.name = "😀".repeat(120);
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(true);
  d.channels[0]!.name += "😀";
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
  d.channels[0]!.name = "A";
  d.title = "Bearer " + "fictional1234567890";
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
});
it("requires explicit shared creation and never accepts caller identity", () => {
  const input = {
    csrf: "a".repeat(64),
    planId: id(1),
    audience: "team_shared",
    expectedRevision: 0,
    mutationId: id(2),
    sharedAudienceConfirmed: false,
    document: createGuestMarketing(),
  };
  expect(saveGuestMarketingSchema.safeParse(input).success).toBe(false);
  expect(
    saveGuestMarketingSchema.safeParse({ ...input, sharedAudienceConfirmed: true }).success,
  ).toBe(true);
  expect(
    saveGuestMarketingSchema.safeParse({ ...input, sharedAudienceConfirmed: true, userId: id(3) })
      .success,
  ).toBe(false);
});
it("bounds each collection and the aggregate request document", () => {
  const d = marketingFixture();
  d.channels = Array.from({ length: 13 }, (_, i) => ({ ...d.channels[0]!, id: id(300 + i) }));
  expect(guestMarketingDocumentSchema.safeParse(d).success).toBe(false);
});
