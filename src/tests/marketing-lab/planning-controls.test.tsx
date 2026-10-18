import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TestPlanner } from "@/components/marketing-lab/TestPlanner";
import { DestinationBuilder } from "@/components/marketing/DestinationBuilder";
import { planningFixture } from "./planning-fixture";
import type { MarketingPlanV1 } from "@/lib/marketing-plan";
afterEach(cleanup);
let latest: MarketingPlanV1;
function Harness() {
  const [plan, setPlan] = useState(planningFixture);
  latest = plan;
  return (
    <TestPlanner
      plan={plan}
      update={(mutate) => {
        const next = structuredClone(plan);
        mutate(next);
        setPlan(next);
      }}
    />
  );
}
it("keeps targets unknown unless the owner records zero and preserves the first board", () => {
  render(<Harness />);
  const board = structuredClone(latest.studentFirst);
  const target = screen.getByLabelText("Target count (blank means unknown)");
  fireEvent.change(target, { target: { value: "0" } });
  expect(latest.test.target).toBe(0);
  fireEvent.change(target, { target: { value: "" } });
  expect(latest.test.target).toBeNull();
  fireEvent.change(screen.getByLabelText("AI resources"), {
    target: { value: "existing_allowance" },
  });
  expect(latest.resources.aiUse).toBe("existing_allowance");
  expect(latest.studentFirst).toEqual(board);
});
it("rejects a cycle, shows blocked transition feedback and records a valid manual start", () => {
  render(<Harness />);
  fireEvent.click(screen.getByLabelText(/Share invitation · todo/));
  expect(screen.getByRole("alert")).toHaveTextContent("cycle");
  expect(latest.test.tasks[0]!.dependsOn).toEqual([]);
  fireEvent.change(screen.getByLabelText("Action 2: Status"), { target: { value: "doing" } });
  expect(screen.getByRole("alert")).toHaveTextContent("prerequisite");
  expect(latest.test.tasks[1]!.status).toBe("todo");
  fireEvent.change(screen.getByLabelText("Test status"), { target: { value: "running" } });
  expect(latest.test.state).toBe("running");
  expect(latest.test.startedAt).toBeTruthy();
});
it("previews locally, adopts only explicitly, and prevents adoption after inputs change", () => {
  const adopt = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(
    <DestinationBuilder
      label="Draft 1"
      url="https://example.edu/study?secret=remove"
      onAdopt={adopt}
    />,
  );
  for (const [label, value] of [
    ["source", "club"],
    ["medium", "flyer"],
    ["campaign", "week-one"],
  ])
    fireEvent.change(screen.getByLabelText(`Draft 1: UTM ${label}`), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Preview tagged URL" }));
  expect(adopt).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Draft 1: Tagged URL preview")).toHaveValue(
    "https://example.edu/study?utm_source=club&utm_medium=flyer&utm_campaign=week-one",
  );
  fireEvent.change(screen.getByLabelText("Draft 1: UTM source"), { target: { value: "other" } });
  expect(screen.getByRole("button", { name: "Adopt reviewed destination" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Preview tagged URL" }));
  fireEvent.click(screen.getByRole("button", { name: "Adopt reviewed destination" }));
  expect(adopt).toHaveBeenCalledOnce();
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
