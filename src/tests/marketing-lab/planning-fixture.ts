import { createEmptyMarketingPlan, type MarketingPlanV1 } from "@/lib/marketing-plan";
export const fixtureId = (n: number) => `f6000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function planningFixture(): MarketingPlanV1 {
  const p = createEmptyMarketingPlan();
  p.studentFirst = {
    columns: [],
    notes: [{ id: fixtureId(9), columnId: null, text: "Fictional practice only" }],
    audience: "Club organizers",
    usefulAction: "Try one session",
    channelIdeas: ["Club"],
    completedAt: "2026-10-18T12:00:00Z",
  };
  p.audience = {
    beachhead: "Club organizers",
    situation: "Weekly study session",
    usefulAction: "Confirm attendance",
    valueProposition: "",
    sourceIds: [],
    assumptions: [],
    unknowns: ["Would anyone return?"],
  };
  p.channels = [1, 2].map((n) => ({
    id: fixtureId(n),
    name: n === 1 ? "Club noticeboard" : "Club organizer",
    medium: "physical",
    place: "Campus",
    url: null,
    sourceIds: [],
    observation: "",
    fitReason: "",
    access: {
      state: "allowed",
      rulesNote: "Fictional permission record",
      rulesSourceId: null,
      checkedOn: "2026-10-18",
      nextQuestion: "",
    },
    estimatedMinutes: null,
    resourcesNeeded: [],
    unknowns: [],
    origin: "student",
    aiOrigin: null,
  }));
  p.selection = { primaryId: fixtureId(1), alternativeId: fixtureId(2), reason: "One small test" };
  p.assets = [
    {
      id: fixtureId(3),
      channelId: fixtureId(1),
      format: "flyer",
      ownHook: "Plan a study session",
      truthfulSupport: "Practice",
      supportSourceIds: [],
      body: "A fictional manual invitation",
      builderDisclosure: "I built this",
      cta: "Try one session",
      destinationUrl: "https://example.edu/study",
      firstUsefulAction: "Confirm attendance",
      aiOrigin: null,
      review: {
        truthful: true,
        disclosedBuilder: true,
        accessChecked: true,
        destinationChecked: true,
        checkedAt: "2026-10-18T12:00:00Z",
      },
      walkthrough: {
        mode: "self",
        understoodAudience: "Club organizers",
        actionObserved: "Found the confirmation step",
        hesitation: "",
        revisionMade: "",
        checkedOn: "2026-10-18",
      },
    },
  ];
  p.resources = {
    cashBudgetCents: 0,
    availableMinutes: 120,
    existingResources: ["Noticeboard"],
    limitations: ["One afternoon"],
    aiUse: "manual_only",
    fallback: "Ask one organizer directly",
  };
  p.test = {
    state: "draft",
    startOn: "2026-10-18",
    endOn: "2026-10-24",
    reviewOn: "2026-10-25",
    startedAt: null,
    primaryMetric: "useful_action",
    baselineMeasurementId: null,
    target: null,
    unknownBaselineOrTarget: "Not measured yet",
    measurementPlan: "Dated manual tally",
    repeatIf: "Useful action observed",
    reviseIf: "Confusion",
    stopIf: "No access",
    tasks: [
      {
        id: fixtureId(4),
        channelId: fixtureId(1),
        assetId: fixtureId(3),
        kind: "permission",
        title: "Check permission",
        ownerLabel: "Founder",
        dueOn: "2026-10-18",
        dependsOn: [],
        doneMeans: "Record organizer response",
        estimatedMinutes: 20,
        status: "todo",
        completionNote: "",
      },
      {
        id: fixtureId(5),
        channelId: fixtureId(1),
        assetId: fixtureId(3),
        kind: "manual_outreach",
        title: "Share invitation",
        ownerLabel: "Founder",
        dueOn: "2026-10-19",
        dependsOn: [fixtureId(4)],
        doneMeans: "Put flyer up after permission",
        estimatedMinutes: null,
        status: "todo",
        completionNote: "",
      },
    ],
  };
  return p;
}
