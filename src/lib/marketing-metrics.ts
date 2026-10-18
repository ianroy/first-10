import type { MarketingMeasurement, MarketingRate } from "./marketing-plan";

export const measurementLabels: Record<MarketingMeasurement["metric"], string> = {
  relevant_reach: "Relevant people reached",
  visits: "Visits",
  useful_action: "Useful action",
  return: "Return",
  referral: "Referral",
};
export const cohortLabels: Record<MarketingMeasurement["cohort"], string> = {
  peer_test: "Peer / test practice",
  classmate: "Classmates",
  external: "Outside participants",
  automated: "Automated traffic",
  mixed_unknown: "Mixed / unknown audience",
};
const pairs: Record<string, string> = {
  visits: "relevant_reach",
  useful_action: "visits",
  return: "useful_action",
  referral: "useful_action",
};
export type DerivedMarketingRate =
  | { ok: true; percent: number; numerator: number; denominator: number }
  | { ok: false; reason: string };
/** Conservative descriptive arithmetic, never an inferred funnel or verified outcome. */
export function deriveMarketingRate(
  rate: MarketingRate,
  rows: readonly MarketingMeasurement[],
): DerivedMarketingRate {
  const n = rows.find((row) => row.id === rate.numeratorId);
  const d = rows.find((row) => row.id === rate.denominatorId);
  const no = (reason: string): DerivedMarketingRate => ({ ok: false, reason });
  if (!n || !d) return no("A measurement is missing.");
  if (n.id === d.id || pairs[n.metric] !== d.metric) return no("Not a supported funnel pair.");
  if (
    n.channelId !== d.channelId ||
    n.assetId !== d.assetId ||
    n.cohort !== d.cohort ||
    n.from !== d.from ||
    n.to !== d.to
  )
    return no("Different populations, asset scopes or date windows.");
  const validDay = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day;
  if (![n.from, n.to, n.recordedOn, d.recordedOn].every(validDay) || n.from > n.to)
    return no("A valid date window and recorded dates are required.");
  if (n.unit !== "unique_people" || d.unit !== "unique_people")
    return no("Not comparable: use unique people, not sessions or events.");
  if (n.cohort === "mixed_unknown" || n.cohort === "automated")
    return no("Not comparable: identify a human participant cohort first.");
  if (!n.source.trim() || !d.source.trim()) return no("Record the source of both counts first.");
  if (n.count === null || d.count === null)
    return no("Not measured: one or both counts are unknown.");
  if (![n.count, d.count].every((v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000_000))
    return no("Counts must be bounded, nonnegative whole numbers.");
  if (d.count === 0) return no("No denominator: the recorded denominator is zero.");
  if (n.count > d.count) return no("Not comparable: the numerator exceeds the denominator.");
  if (!rate.subsetConfirmed)
    return no("Confirm that the numerator people belong to the denominator population.");
  return { ok: true, percent: (n.count / d.count) * 100, numerator: n.count, denominator: d.count };
}
/** Empty input means unknown, not an observed zero. Invalid input is not adopted. */
export function parseManualCount(value: string): number | null | undefined {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) && count <= 1_000_000_000 ? count : undefined;
}

/** Keep tiny positive rates and almost-complete rates distinct from exact zero/100. */
export function formatMarketingPercent(percent: number): string {
  if (percent > 0 && percent < 0.1) return "<0.1%";
  if (percent < 100 && percent > 99.9) return ">99.9%";
  return `${percent.toFixed(1)}%`;
}
