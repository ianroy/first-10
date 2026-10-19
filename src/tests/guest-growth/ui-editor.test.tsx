import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GrowthEditor } from "@/components/guest-growth/Editors";
import { createEmptyGuestGrowth, type GuestGrowthDocument } from "@/lib/guest-growth/contracts";
import { documents } from "./fixture";
afterEach(cleanup);
function Harness({ initial }: { initial: GuestGrowthDocument }) {
  const [d, setD] = useState(initial);
  return (
    <>
      <GrowthEditor document={d} onChange={setD} />
      <output data-testid="document">{JSON.stringify(d)}</output>
    </>
  );
}
const doc = () => JSON.parse(screen.getByTestId("document").textContent!);
it("preserves question identity while changing a structured survey format", () => {
  render(<Harness initial={createEmptyGuestGrowth("survey")} />);
  fireEvent.click(screen.getByRole("button", { name: "Add survey question" }));
  const before = doc().questions[0].id;
  fireEvent.change(screen.getByLabelText("Survey question 1 prompt"), {
    target: { value: "Last time?" },
  });
  fireEvent.change(screen.getByLabelText("Survey question 1 format"), {
    target: { value: "single_choice" },
  });
  fireEvent.change(screen.getByLabelText("Survey question 1 options — one per line"), {
    target: { value: "Did it\nDid not do it" },
  });
  expect(doc().questions[0]).toMatchObject({
    id: before,
    prompt: "Last time?",
    format: "single_choice",
    options: ["Did it", "Did not do it"],
  });
  fireEvent.change(screen.getByLabelText("Survey question 1 format"), {
    target: { value: "scale" },
  });
  fireEvent.change(screen.getByLabelText("Survey question 1 scale maximum"), {
    target: { value: "7" },
  });
  expect(doc().questions[0]).toMatchObject({
    id: before,
    prompt: "Last time?",
    format: "scale",
    minimum: 1,
    maximum: 7,
  });
  expect(doc().questions[0]).not.toHaveProperty("options");
});
it("resets a reported learning review on edits while retaining authored synthesis structures", () => {
  render(<Harness initial={documents()[0]!} />);
  fireEvent.change(screen.getByLabelText("Pattern 1 interpretation"), {
    target: { value: "A revised interpretation" },
  });
  expect(doc()).toMatchObject({
    reviewState: "draft",
    reviewedAt: null,
    patterns: [
      {
        observationSummary: "PATTERN_OBSERVATION",
        interpretation: "A revised interpretation",
        limitations: "PATTERN_LIMITATIONS",
      },
    ],
  });
  expect(doc().proposedChanges[0].nextStep).toBe("CHANGE_NEXT_STEP");
});
it("distinguishes unknown experiment counts from an entered zero", () => {
  render(<Harness initial={createEmptyGuestGrowth("experiment")} />);
  expect(doc().criterion.target).toBeNull();
  fireEvent.change(screen.getByLabelText("Experiment target"), { target: { value: "0" } });
  expect(doc().criterion.target).toBe(0);
  fireEvent.change(screen.getByLabelText("Experiment target"), { target: { value: "" } });
  expect(doc().criterion.target).toBeNull();
  expect(screen.queryByLabelText("Reported experiment result")).toBeNull();
});
it("keeps onboarding timing/questions as drafts without an answer capture field", () => {
  render(<Harness initial={createEmptyGuestGrowth("onboarding")} />);
  fireEvent.click(screen.getByRole("button", { name: "Add onboarding question" }));
  fireEvent.change(screen.getByLabelText("Onboarding question 1 timing"), {
    target: { value: "after" },
  });
  fireEvent.change(screen.getByLabelText("Onboarding question 1 prompt"), {
    target: { value: "Where did you hesitate?" },
  });
  expect(doc().questions[0]).toMatchObject({ when: "after", prompt: "Where did you hesitate?" });
  expect(doc().collection).toBe("not_collected");
  expect(doc().questions[0]).not.toHaveProperty("answer");
});
