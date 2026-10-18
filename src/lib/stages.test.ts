import { describe, expect, it } from "vitest";
import { isReady, itemDone, unlockChecklist, type UnlockInput } from "@/lib/stages";

const base: UnlockInput = {
  stage: 1,
  completedInterviews: 0,
  synthesisAccepted: false,
  experiments: [],
  stage2Reached: 0,
  surveyCount: 0,
};

describe("unlockChecklist", () => {
  it("unlocks stage 2 only when auto items and manual ticks are all done", () => {
    const c = unlockChecklist({
      ...base,
      completedInterviews: 5,
      synthesisAccepted: true,
      experiments: [{ stage: 1 }],
    })!;
    expect(c.nextStage).toBe(2);
    expect(isReady(c.items, {})).toBe(false);
    expect(isReady(c.items, { s1_fit: true, s1_change: true })).toBe(true);
  });

  it("does not count fewer than 5 interviews or a stage 2 experiment for stage 1", () => {
    const c = unlockChecklist({
      ...base,
      completedInterviews: 4,
      synthesisAccepted: true,
      experiments: [{ stage: 2 }],
    })!;
    const auto = Object.fromEntries(c.items.map((i) => [i.k, i.auto]));
    expect(auto["s1_five"]).toBe(false);
    expect(auto["s1_exp"]).toBe(false);
    expect(isReady(c.items, { s1_fit: true, s1_change: true })).toBe(false);
  });

  it("uses reached contacts and the survey for stage 2", () => {
    const c = unlockChecklist({
      ...base,
      stage: 2,
      stage2Reached: 10,
      surveyCount: 3,
      experiments: [{ stage: 2 }],
    })!;
    expect(c.nextStage).toBe(3);
    expect(isReady(c.items, { s2_read: true })).toBe(true);
  });

  it("has nothing to unlock at stage 3", () => {
    expect(unlockChecklist({ ...base, stage: 3 })).toBeNull();
  });
});

describe("itemDone", () => {
  it("prefers the computed value over a manual tick", () => {
    expect(itemDone({ k: "x", l: "", auto: false }, { x: true })).toBe(false);
    expect(itemDone({ k: "x", l: "" }, { x: true })).toBe(true);
    expect(itemDone({ k: "x", l: "" }, { x: { nested: 1 } })).toBe(false);
  });
});
