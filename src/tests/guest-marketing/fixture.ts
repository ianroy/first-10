import { createGuestMarketing } from "@/lib/guest-marketing/contracts";
export const fixtureId = (n: number) => `fc230000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function marketingFixture() {
  const d = createGuestMarketing();
  d.title = "Fictional Élodie workshop plan";
  d.thinking = {
    observations: "Fictional learners wait before asking for feedback.",
    reachableAudience: "A student club that permits an invitation",
    usefulAction: "Try one customer interview",
    channelIdeas: "Club meeting and organizer email",
    completedAt: "2026-10-18T20:00:00Z",
  };
  d.audience = {
    beachhead: "Fictional student builders",
    situation: "Before the weekly workshop",
    valueProposition: "Practice one manageable conversation",
    assumptions: "The club may not be relevant",
    sourceNotes: "Fictional classroom example only; no real participants",
  };
  d.channels.push({
    id: fixtureId(101),
    name: "Fictional student club",
    medium: "physical",
    place: "Club meeting",
    observation: "Fictional source note",
    fitReason: "Learners with a recent prototype",
    access: "needs_permission",
    rules: "Ask the organizer first",
    sourceNote: "Check the club rules",
    checkedOn: null,
    estimatedMinutes: 20,
    unknowns: "Politeness could be mistaken for interest",
  });
  d.primaryChannelId = fixtureId(101);
  d.selectionReason = "Start with accessible relevant people";
  d.content.push({
    id: fixtureId(102),
    channelId: fixtureId(101),
    format: "demo_script",
    hook: "A manageable next conversation",
    truthfulSupport: "Prototype, no measured learning claim",
    body: "Show the problem, choose a hypothesis, print a script. END_OF_DEMO_DRAFT",
    builderDisclosure: "We are building this prototype",
    callToAction: "Try a short interview script",
    destination: "Public prototype link (not fetched)",
    firstUsefulAction: "Write a falsifiable hypothesis",
    review: {
      truthful: false,
      builderDisclosed: false,
      accessChecked: false,
      destinationChecked: false,
    },
    walkthrough: {
      mode: "peer",
      understoodAudience: "Fictional learners",
      actionObserved: "Fictional peer found the script button",
      hesitation: "Unsure where notes are saved",
      revision: "Explain the save step",
    },
  });
  d.outreach.push({
    id: fixtureId(103),
    channelId: fixtureId(101),
    recipientRole: "Club organizer",
    purpose: "permission",
    subject: "May we invite relevant builders?",
    body: "We are building a prototype. Could we share a small optional activity? END_OF_OUTREACH_DRAFT",
    respectfulExit: "No problem if this does not fit your group.",
    status: "draft",
    observation: "Not sent",
  });
  d.resources = {
    cashBudgetCents: 0,
    availableMinutes: 60,
    existingResources: "Classroom and existing prototype",
    limitations: "No promotional budget",
    fallback: "Paper worksheet",
  };
  d.test.hypothesis = "Three relevant learners will try one interview script in a week";
  d.test.tasks.push({
    id: fixtureId(104),
    title: "Check organizer permission",
    ownerAlias: "Team A",
    dueOn: null,
    prerequisite: "Read club rules",
    doneMeans: "Permission recorded",
    status: "todo",
    completionNote: "Not done",
  });
  d.measurements.push({
    id: fixtureId(105),
    channelId: fixtureId(101),
    assetId: fixtureId(102),
    metric: "useful_action",
    cohort: "peer_test",
    from: "2026-10-18",
    to: "2026-10-18",
    unit: "unique_people",
    count: null,
    source: "No real test performed",
    recordedOn: "2026-10-18",
    limitations: "Fictional fixture; unknown is not zero",
  });
  d.reflection = {
    decision: "revise",
    evidenceIds: [fixtureId(105)],
    learned: "No demand established by this fictional example",
    uncertainty: "Audience fit remains unknown",
    nextAction: "Ask permission and recruit relevant people",
  };
  return d;
}
