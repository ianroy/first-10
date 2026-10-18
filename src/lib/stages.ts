import type { Experiment } from "@/lib/data";

export type ChecklistItem = { k: string; l: string; auto?: boolean };
export type Checklist = { title: string; nextStage: number; items: ChecklistItem[] };

export type UnlockInput = {
  stage: number;
  completedInterviews: number;
  synthesisAccepted: boolean;
  experiments: Pick<Experiment, "stage">[];
  stage2Reached: number;
  surveyCount: number;
};

// The checklist that unlocks the next rung. Items with `auto` are computed from data;
// the rest are ticked by the founder and stored in projects.checklist.
export function unlockChecklist(i: UnlockInput): Checklist | null {
  if (i.stage === 1)
    return {
      title: "Ready for the next 50?",
      nextStage: 2,
      items: [
        { k: "s1_five", l: "Talked to at least 5 people", auto: i.completedInterviews >= 5 },
        { k: "s1_synth", l: "Reviewed and accepted your summary", auto: i.synthesisAccepted },
        {
          k: "s1_exp",
          l: "Logged at least one experiment",
          auto: i.experiments.some((e) => e.stage === 1),
        },
        { k: "s1_fit", l: "I can describe my best-fit user in one sentence" },
        { k: "s1_change", l: "I made (or scheduled) one change to the app or pitch" },
      ],
    };
  if (i.stage === 2)
    return {
      title: "Ready for the next 100?",
      nextStage: 3,
      items: [
        { k: "s2_ten", l: "At least 10 people have tried it", auto: i.stage2Reached >= 10 },
        { k: "s2_survey", l: "Feedback survey created", auto: i.surveyCount > 0 },
        {
          k: "s2_exp",
          l: "Logged a Stage 2 experiment",
          auto: i.experiments.some((e) => e.stage === 2),
        },
        { k: "s2_read", l: "I read the survey answers and know what to fix" },
      ],
    };
  return null;
}

export function itemDone(it: ChecklistItem, check: Record<string, unknown>) {
  return it.auto !== undefined ? it.auto : check[it.k] === true;
}

export function isReady(items: ChecklistItem[], check: Record<string, unknown>) {
  return items.every((it) => itemDone(it, check));
}
