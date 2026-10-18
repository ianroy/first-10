import { describe, it, expect } from "vitest";
import { parsePartnerCounts } from "@/lib/admin-partners";
const known = {
  interestRequests: 2,
  feedbackSubmissions: 1,
  distinctRespondents: 2,
  excludedFixtures: 1,
};
describe("private partner aggregate projection", () => {
  it("retains actual zero and valid independent request counts", () => {
    expect(parsePartnerCounts(known)).toEqual(known);
    expect(
      parsePartnerCounts({
        interestRequests: 0,
        feedbackSubmissions: 0,
        distinctRespondents: 0,
        excludedFixtures: 1,
      }),
    ).toMatchObject({ interestRequests: 0 });
  });
  it.each([
    null,
    {},
    { ...known, email: "private@example.test" },
    { ...known, interestRequests: null },
    { ...known, excludedFixtures: -1 },
    { ...known, feedbackSubmissions: 1.5 },
    { ...known, distinctRespondents: 4 },
  ])("fails closed for malformed or private data: %j", (value) => {
    expect(parsePartnerCounts(value)).toBeNull();
  });
});
