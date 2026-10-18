import { expect, it } from "vitest";
import {
  dependencyError,
  invalidateChangedLaunchReviews,
  previewTestState,
  taskStatusError,
} from "./marketing-planning";
import { marketingPlanSchema } from "./marketing-plan";
import { planningFixture, fixtureId } from "@/tests/marketing-lab/planning-fixture";
it("rejects self, missing and transitive cyclic prerequisites without mutating work", () => {
  const p = planningFixture();
  const before = JSON.stringify(p);
  expect(dependencyError(p.test.tasks, fixtureId(4), [fixtureId(4)])).toMatch(/itself/);
  expect(dependencyError(p.test.tasks, fixtureId(4), [fixtureId(7)])).toMatch(/exists/);
  expect(dependencyError(p.test.tasks, fixtureId(4), [fixtureId(5)])).toMatch(/cycle/);
  expect(dependencyError(p.test.tasks, fixtureId(5), [])).toBeNull();
  expect(JSON.stringify(p)).toBe(before);
  p.test.tasks[0]!.dependsOn = [fixtureId(5)];
  expect(marketingPlanSchema.safeParse(p).success).toBe(false);
  p.test.tasks[0]!.dependsOn = [fixtureId(7)];
  expect(marketingPlanSchema.safeParse(p).success).toBe(false);
});
it("does not mark dependent work done without completed prerequisites and an observation", () => {
  const p = planningFixture();
  const first = p.test.tasks[0]!;
  const second = p.test.tasks[1]!;
  expect(taskStatusError(second, p.test.tasks, "doing")).toMatch(/prerequisite/);
  expect(taskStatusError(first, p.test.tasks, "done")).toMatch(/actually happened/);
  first.completionNote = "Organizer allowed the flyer";
  first.status = "done";
  expect(taskStatusError(second, p.test.tasks, "doing")).toBeNull();
  second.status = "doing";
  expect(taskStatusError(first, p.test.tasks, "todo")).toMatch(/dependent/);
});
it("validates owner-recorded readiness/start/reflection without inventing counts or overwriting first thinking", () => {
  const p = planningFixture();
  const original = structuredClone(p);
  expect(previewTestState(p, "ready_to_review").ok).toBe(true);
  const start = previewTestState(p, "running", "2026-10-18T13:00:00Z");
  expect(start.ok).toBe(true);
  if (start.ok) {
    expect(start.plan.test.startedAt).toBe("2026-10-18T13:00:00Z");
    expect(start.plan.test.target).toBeNull();
    expect(start.plan.studentFirst).toEqual(original.studentFirst);
  }
  expect(p).toEqual(original);
  p.assets[0]!.review.truthful = false;
  expect(previewTestState(p, "running").ok).toBe(false);
  expect(previewTestState(p, "reviewed").ok).toBe(false);
  p.reflection = {
    decision: "stop",
    evidenceIds: [],
    learned: "No one participated",
    uncertainty: "Small test",
    nextAction: "Ask a different audience",
    reviewedOn: "2026-10-25",
  };
  expect(previewTestState(p, "reviewed").ok).toBe(true);
});
it("invalidates launch checks after text, destination or permission-basis edits, not ordinary notes", () => {
  const p = planningFixture();
  const next = structuredClone(p);
  next.assets[0]!.body = "Changed claim";
  invalidateChangedLaunchReviews(p, next);
  expect(next.assets[0]!.review.checkedAt).toBeNull();
  expect(next.assets[0]!.review.truthful).toBe(false);
  const channel = structuredClone(p);
  channel.channels[0]!.access.state = "denied";
  invalidateChangedLaunchReviews(p, channel);
  expect(channel.assets[0]!.review.accessChecked).toBe(false);
  const notes = structuredClone(p);
  notes.reflection.learned = "New observation";
  invalidateChangedLaunchReviews(p, notes);
  expect(notes.assets[0]!.review).toEqual(p.assets[0]!.review);
});
