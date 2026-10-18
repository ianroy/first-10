import { describe, expect, it } from "vitest";
import { deriveMarketingRate, formatMarketingPercent, parseManualCount } from "./marketing-metrics";
import type { MarketingMeasurement, MarketingRate } from "./marketing-plan";
const denominator: MarketingMeasurement = {
  id: "reach",
  channelId: "channel",
  assetId: null,
  metric: "relevant_reach",
  cohort: "external",
  from: "2026-10-01",
  to: "2026-10-07",
  unit: "unique_people",
  count: 10,
  source: "Dated manual tally",
  sourceUrl: null,
  recordedOn: "2026-10-08",
  limitations: "Self-reported; small sample",
};
const numerator: MarketingMeasurement = {
  ...denominator,
  id: "visits",
  metric: "visits",
  count: 3,
};
const rate: MarketingRate = {
  id: "rate",
  numeratorId: "visits",
  denominatorId: "reach",
  label: "Visits / reach",
  subsetConfirmed: true,
};
describe("conservative manual measurement arithmetic", () => {
  it("distinguishes an observed zero from unknown and a missing denominator", () => {
    expect(deriveMarketingRate(rate, [denominator, { ...numerator, count: 0 }])).toEqual({
      ok: true,
      percent: 0,
      numerator: 0,
      denominator: 10,
    });
    expect(deriveMarketingRate(rate, [denominator, { ...numerator, count: null }])).toMatchObject({
      ok: false,
      reason: expect.stringContaining("unknown"),
    });
    expect(
      deriveMarketingRate(rate, [
        { ...denominator, count: 0 },
        { ...numerator, count: 0 },
      ]),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("zero") });
    expect(deriveMarketingRate(rate, [denominator])).toMatchObject({ ok: false });
  });
  it.each(["channelId", "assetId", "cohort", "from", "to"] as const)(
    "rejects mismatched %s even when the arithmetic looks plausible",
    (key) => {
      const value =
        key === "cohort"
          ? "classmate"
          : key === "from"
            ? "2026-10-02"
            : key === "to"
              ? "2026-10-08"
              : "other";
      expect(
        deriveMarketingRate(rate, [denominator, { ...numerator, [key]: value }]),
      ).toMatchObject({ ok: false, reason: expect.stringContaining("Different populations") });
    },
  );
  it.each(["sessions", "events"] as const)(
    "does not infer unique-person conversion from %s",
    (unit) => {
      expect(
        deriveMarketingRate(rate, [
          { ...denominator, unit },
          { ...numerator, unit },
        ]),
      ).toMatchObject({ ok: false });
    },
  );
  it.each(["mixed_unknown", "automated"] as const)(
    "does not convert %s to human adoption",
    (cohort) => {
      expect(
        deriveMarketingRate(rate, [
          { ...denominator, cohort },
          { ...numerator, cohort },
        ]),
      ).toMatchObject({ ok: false });
    },
  );
  it("requires explicit population confirmation and a source for both counts", () => {
    expect(
      deriveMarketingRate({ ...rate, subsetConfirmed: false }, [denominator, numerator]),
    ).toMatchObject({ ok: false });
    expect(deriveMarketingRate(rate, [{ ...denominator, source: " " }, numerator])).toMatchObject({
      ok: false,
    });
    expect(deriveMarketingRate(rate, [denominator, { ...numerator, source: "" }])).toMatchObject({
      ok: false,
    });
  });
  it.each([-1, 1.5, NaN, Infinity, 1000000001, 11])(
    "rejects invalid or impossible numerator %s",
    (count) => {
      expect(deriveMarketingRate(rate, [denominator, { ...numerator, count }])).toMatchObject({
        ok: false,
      });
    },
  );
  it("rejects malformed dates, reversed windows, unsupported metric pairs and self-comparison", () => {
    for (const date of ["2026-02-30", "bad-date"])
      expect(
        deriveMarketingRate(rate, [
          { ...denominator, from: date },
          { ...numerator, from: date },
        ]),
      ).toMatchObject({ ok: false });
    expect(
      deriveMarketingRate(rate, [
        { ...denominator, from: "2026-10-09" },
        { ...numerator, from: "2026-10-09" },
      ]),
    ).toMatchObject({ ok: false });
    expect(
      deriveMarketingRate(rate, [denominator, { ...numerator, metric: "return" }]),
    ).toMatchObject({ ok: false });
    expect(
      deriveMarketingRate({ ...rate, numeratorId: denominator.id }, [denominator, numerator]),
    ).toMatchObject({ ok: false });
  });
  it.each([
    ["visits", "relevant_reach"],
    ["useful_action", "visits"],
    ["return", "useful_action"],
    ["referral", "useful_action"],
  ] as const)("allows only the documented %s / %s pair", (n, d) => {
    expect(
      deriveMarketingRate(rate, [
        { ...denominator, metric: d },
        { ...numerator, metric: n },
      ]),
    ).toEqual({ ok: true, percent: 30, numerator: 3, denominator: 10 });
  });
  it("parses blank as unknown while refusing fractional, negative and excessive counts", () => {
    expect(parseManualCount("")).toBeNull();
    expect(parseManualCount("0")).toBe(0);
    expect(parseManualCount("1000000000")).toBe(1000000000);
    for (const value of ["-1", "2.5", "Infinity", "1e9", "1000000001"])
      expect(parseManualCount(value)).toBeUndefined();
  });
});

it("does not round tiny observations to zero or near-complete rates to certainty", () => {
  expect(formatMarketingPercent(0.000001)).toBe("<0.1%");
  expect(formatMarketingPercent(99.999999)).toBe(">99.9%");
  expect(formatMarketingPercent(0)).toBe("0.0%");
  expect(formatMarketingPercent(100)).toBe("100.0%");
});
