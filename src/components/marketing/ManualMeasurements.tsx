import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MarketingMeasurement, MarketingPlanV1 } from "@/lib/marketing-plan";
import {
  cohortLabels,
  deriveMarketingRate,
  formatMarketingPercent,
  measurementLabels,
  parseManualCount,
} from "@/lib/marketing-metrics";
const selectClass = "min-h-11 w-full rounded-lg border bg-background px-3 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
export function ManualMeasurements({
  plan,
  update,
  fictional = false,
}: {
  plan: MarketingPlanV1;
  update: (mutator: (next: MarketingPlanV1) => void) => void;
  fictional?: boolean;
}) {
  function change(id: string, patch: Partial<MarketingMeasurement>) {
    update((next) => {
      const row = next.measurements.find((item) => item.id === id);
      if (!row) return;
      Object.assign(row, patch);
      for (const rate of next.rates)
        if (rate.numeratorId === id || rate.denominatorId === id) rate.subsetConfirmed = false;
    });
  }
  const summary = (row: MarketingMeasurement, index: number) =>
    `${index + 1}: ${measurementLabels[row.metric]} · ${cohortLabels[row.cohort]} · ${row.count ?? "unknown"}`;
  return (
    <section aria-label="Manual measurements" className="my-6 space-y-5 border-y py-6">
      <h4 className="text-xl font-bold">Record observations manually</h4>
      <p className="text-sm text-muted-foreground">
        Nothing is tracked automatically. Leave an unmeasured count blank; enter 0 only when you
        observed zero. Keep peer practice, classmates and outside participants separate. Save draft
        to preserve your entries.
      </p>
      {fictional && (
        <p role="note" className="rounded-xl bg-draft p-3 text-sm font-semibold">
          Fictional demo project: these entries are practice data, never evidence of real adoption.
        </p>
      )}
      {!plan.channels.length && (
        <p className="text-sm">Add a channel in Map channels before recording a measurement.</p>
      )}
      {plan.measurements.map((row, index) => (
        <fieldset key={row.id} className="space-y-4 rounded-xl border p-4">
          <legend className="px-2 font-bold">Measurement {index + 1}</legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={`Measurement ${index + 1}: Channel`}>
              <select
                className={selectClass}
                value={row.channelId}
                onChange={(e) => change(row.id, { channelId: e.target.value, assetId: null })}
              >
                {plan.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name || "Unnamed channel"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Measurement ${index + 1}: Asset scope`}>
              <select
                className={selectClass}
                value={row.assetId ?? ""}
                onChange={(e) => change(row.id, { assetId: e.target.value || null })}
              >
                <option value="">Whole channel</option>
                {plan.assets
                  .filter((asset) => asset.channelId === row.channelId)
                  .map((asset, i) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.ownHook || `Asset ${i + 1}`}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={`Measurement ${index + 1}: Metric`}>
              <select
                className={selectClass}
                disabled={plan.test.baselineMeasurementId === row.id}
                value={row.metric}
                onChange={(e) =>
                  change(row.id, { metric: e.target.value as MarketingMeasurement["metric"] })
                }
              >
                {Object.entries(measurementLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Measurement ${index + 1}: Audience cohort`}>
              <select
                className={selectClass}
                value={row.cohort}
                onChange={(e) =>
                  change(row.id, { cohort: e.target.value as MarketingMeasurement["cohort"] })
                }
              >
                {Object.entries(cohortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Measurement ${index + 1}: Unit`}>
              <select
                className={selectClass}
                value={row.unit}
                onChange={(e) =>
                  change(row.id, { unit: e.target.value as MarketingMeasurement["unit"] })
                }
              >
                <option value="unique_people">Unique people</option>
                <option value="sessions">Sessions</option>
                <option value="events">Events</option>
              </select>
            </Field>
            <Field label={`Measurement ${index + 1}: Count (blank means unknown)`}>
              <Input
                type="number"
                min={0}
                max={1000000000}
                step={1}
                value={row.count ?? ""}
                onChange={(e) => {
                  const count = parseManualCount(e.target.value);
                  if (count !== undefined) change(row.id, { count });
                }}
              />
            </Field>
            {(
              [
                ["from", "From (inclusive)"],
                ["to", "To (inclusive)"],
                ["recordedOn", "Recorded on"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={`Measurement ${index + 1}: ${label}`}>
                <Input
                  type="date"
                  value={row[key]}
                  onChange={(e) => change(row.id, { [key]: e.target.value })}
                />
              </Field>
            ))}
            <Field label={`Measurement ${index + 1}: Source of count`}>
              <Input
                maxLength={1000}
                placeholder="For example, my dated tally; no private participant names"
                value={row.source}
                onChange={(e) => change(row.id, { source: e.target.value })}
              />
            </Field>
            <Field label={`Measurement ${index + 1}: Public source URL (optional)`}>
              <Input
                type="url"
                maxLength={2048}
                value={row.sourceUrl ?? ""}
                onChange={(e) => change(row.id, { sourceUrl: e.target.value || null })}
              />
            </Field>
            <Field label={`Measurement ${index + 1}: Limitations`}>
              <Textarea
                maxLength={1000}
                value={row.limitations}
                onChange={(e) => change(row.id, { limitations: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={plan.reflection.evidenceIds.includes(row.id)}
              disabled={
                !plan.reflection.evidenceIds.includes(row.id) &&
                plan.reflection.evidenceIds.length >= 20
              }
              onChange={(e) =>
                update((next) => {
                  next.reflection.evidenceIds = e.target.checked
                    ? [...next.reflection.evidenceIds, row.id]
                    : next.reflection.evidenceIds.filter((id) => id !== row.id);
                })
              }
            />
            Use measurement {index + 1} in this reflection
          </label>
        </fieldset>
      ))}
      <Button
        variant="outline"
        disabled={!plan.channels.length || plan.measurements.length >= 80}
        onClick={() =>
          update((next) => {
            const channelId = next.selection.primaryId ?? next.channels[0]?.id;
            if (!channelId || next.measurements.length >= 80) return;
            const today = new Date().toISOString().slice(0, 10);
            next.measurements.push({
              id: crypto.randomUUID(),
              channelId,
              assetId: null,
              metric: "relevant_reach",
              cohort: "mixed_unknown",
              from: today,
              to: today,
              unit: "unique_people",
              count: null,
              source: "",
              sourceUrl: null,
              recordedOn: today,
              limitations: "",
            });
          })
        }
      >
        Add a manual measurement
      </Button>
      <h4 className="text-xl font-bold">Comparable rates</h4>
      <p className="text-sm text-muted-foreground">
        Only compare unique people in the same channel, asset, audience and date window. A valid
        percentage describes these observations; it does not establish demand or causation. Any
        count edit requires a new population confirmation.
      </p>
      {plan.rates.map((rate, index) => {
        const result = deriveMarketingRate(rate, plan.measurements);
        const n = plan.measurements.find((r) => r.id === rate.numeratorId);
        const d = plan.measurements.find((r) => r.id === rate.denominatorId);
        return (
          <fieldset key={rate.id} className="space-y-4 rounded-xl border p-4">
            <legend className="px-2 font-bold">Rate {index + 1}</legend>
            <Field label={`Rate ${index + 1}: Label`}>
              <Input
                maxLength={120}
                value={rate.label}
                onChange={(e) =>
                  update((next) => {
                    next.rates[index]!.label = e.target.value;
                  })
                }
              />
            </Field>
            {(
              [
                ["numeratorId", "Numerator"],
                ["denominatorId", "Denominator"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={`Rate ${index + 1}: ${label}`}>
                <select
                  className={selectClass}
                  value={rate[key]}
                  onChange={(e) =>
                    update((next) => {
                      next.rates[index]![key] = e.target.value;
                      next.rates[index]!.subsetConfirmed = false;
                    })
                  }
                >
                  {plan.measurements.map((row, i) => (
                    <option
                      key={row.id}
                      value={row.id}
                      disabled={
                        row.id === rate[key === "numeratorId" ? "denominatorId" : "numeratorId"]
                      }
                    >
                      {summary(row, i)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={rate.subsetConfirmed}
                onChange={(e) =>
                  update((next) => {
                    next.rates[index]!.subsetConfirmed = e.target.checked;
                  })
                }
              />
              I checked that the numerator people are within the denominator population.
            </label>
            <p role="status" className="font-semibold">
              {result.ok
                ? `${result.numerator} / ${result.denominator} = ${formatMarketingPercent(result.percent)}`
                : result.reason}
            </p>
            {n && d && (
              <p className="text-sm text-muted-foreground">
                {cohortLabels[n.cohort]} · {n.from} to {n.to} (inclusive). Sources:{" "}
                {n.source || "unknown"}; {d.source || "unknown"}. Limitations:{" "}
                {n.limitations || "not recorded"}; {d.limitations || "not recorded"}.
              </p>
            )}
          </fieldset>
        );
      })}
      <Button
        variant="outline"
        disabled={plan.measurements.length < 2 || plan.rates.length >= 10}
        onClick={() =>
          update((next) => {
            const n = next.measurements[1];
            const d = next.measurements[0];
            if (n && d && next.rates.length < 10)
              next.rates.push({
                id: crypto.randomUUID(),
                numeratorId: n.id,
                denominatorId: d.id,
                label: "",
                subsetConfirmed: false,
              });
          })
        }
      >
        Compare two measurements
      </Button>
    </section>
  );
}
