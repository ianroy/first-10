import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManualMeasurements } from "@/components/marketing/ManualMeasurements";
import {
  createEmptyMarketingPlan,
  marketingPlanSchema,
  type MarketingPlanV1,
} from "@/lib/marketing-plan";
const id = (n: number) => `a7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const plan = createEmptyMarketingPlan();
  plan.channels.push({
    id: id(1),
    name: "Club organizer",
    medium: "physical",
    place: "Campus",
    url: null,
    sourceIds: [],
    observation: "",
    fitReason: "",
    access: {
      state: "unknown",
      rulesNote: "",
      rulesSourceId: null,
      checkedOn: null,
      nextQuestion: "",
    },
    estimatedMinutes: null,
    resourcesNeeded: [],
    unknowns: [],
    origin: "student",
    aiOrigin: null,
  });
  return plan;
}
let latest: MarketingPlanV1;
function Harness({
  initial = fixture(),
  disabled = false,
}: {
  initial?: MarketingPlanV1;
  disabled?: boolean;
}) {
  const [plan, setPlan] = useState(initial);
  latest = plan;
  return (
    <fieldset disabled={disabled}>
      <ManualMeasurements
        fictional
        plan={plan}
        update={(mutate) => {
          const next = structuredClone(plan);
          mutate(next);
          setPlan(next);
        }}
      />
    </fieldset>
  );
}
afterEach(cleanup);
it("adds only unknown observations, preserves explicit zero, and round-trips the existing save schema", () => {
  render(<Harness />);
  expect(screen.getByRole("note")).toHaveTextContent("Fictional demo project");
  fireEvent.click(screen.getByRole("button", { name: "Add a manual measurement" }));
  expect(latest.measurements[0]!.count).toBeNull();
  expect(latest.measurements[0]!.cohort).toBe("mixed_unknown");
  expect(marketingPlanSchema.safeParse(latest).success).toBe(true);
  const input = screen.getByLabelText("Measurement 1: Count (blank means unknown)");
  fireEvent.change(input, { target: { value: "0" } });
  expect(latest.measurements[0]!.count).toBe(0);
  fireEvent.change(input, { target: { value: "" } });
  expect(latest.measurements[0]!.count).toBeNull();
  fireEvent.change(screen.getByLabelText("Measurement 1: Audience cohort"), {
    target: { value: "classmate" },
  });
  fireEvent.change(screen.getByLabelText("Measurement 1: Source of count"), {
    target: { value: "My dated tally" },
  });
  fireEvent.click(screen.getByLabelText("Use measurement 1 in this reflection"));
  expect(latest.reflection.evidenceIds).toEqual([latest.measurements[0]!.id]);
  expect(marketingPlanSchema.safeParse(latest).success).toBe(true);
  expect(screen.queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();
});
it("resets comparison confirmation after editing evidence, preserving reflection and baseline references", () => {
  const plan = fixture();
  const row = {
    id: id(2),
    channelId: id(1),
    assetId: null,
    metric: "relevant_reach" as const,
    cohort: "external" as const,
    from: "2026-10-01",
    to: "2026-10-07",
    unit: "unique_people" as const,
    count: 10,
    source: "Manual tally",
    sourceUrl: null,
    recordedOn: "2026-10-08",
    limitations: "Small sample",
  };
  plan.measurements = [row, { ...row, id: id(3), metric: "visits", count: 3 }];
  plan.test.primaryMetric = "relevant_reach";
  plan.test.baselineMeasurementId = row.id;
  plan.reflection.evidenceIds = [row.id];
  plan.rates = [
    {
      id: id(4),
      numeratorId: id(3),
      denominatorId: row.id,
      label: "Visit rate",
      subsetConfirmed: true,
    },
  ];
  render(<Harness initial={plan} />);
  expect(screen.getByRole("status")).toHaveTextContent("3 / 10 = 30.0%");
  expect(screen.getByLabelText("Measurement 1: Metric")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Measurement 2: Count (blank means unknown)"), {
    target: { value: "4" },
  });
  expect(latest.rates[0]!.subsetConfirmed).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("Confirm");
  expect(latest.reflection.evidenceIds).toEqual([row.id]);
  expect(latest.test.baselineMeasurementId).toBe(row.id);
  fireEvent.click(
    screen.getByLabelText(
      "I checked that the numerator people are within the denominator population.",
    ),
  );
  expect(screen.getByRole("status")).toHaveTextContent("4 / 10 = 40.0%");
  expect(marketingPlanSchema.safeParse(latest).success).toBe(true);
});
it("inherits read-only/busy form gating and requires an existing channel", () => {
  const view = render(<Harness disabled />);
  expect(screen.getByRole("button", { name: "Add a manual measurement" })).toBeDisabled();
  view.unmount();
  render(<Harness initial={createEmptyMarketingPlan()} />);
  expect(screen.getByRole("button", { name: "Add a manual measurement" })).toBeDisabled();
});
