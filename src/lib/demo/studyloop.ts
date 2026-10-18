/** Authored teaching fixtures. Never pass these IDs or texts to product data hooks. */
export const sources = [
  {
    id: "studyloop-maya",
    name: "Maya",
    kind: "Fictional quote",
    lens: "Who will show up?",
    text: "I don’t need more people. I need to know who’s actually showing up.",
  },
  {
    id: "studyloop-owen",
    name: "Owen",
    kind: "Fictional note",
    lens: "Last-minute coordination",
    text: "Describes repeated last-minute messages to work out who will attend a study session.",
  },
  {
    id: "studyloop-priya",
    name: "Priya",
    kind: "Fictional note",
    lens: "An existing routine",
    text: "Describes an existing group that works well when attendance is clear.",
  },
  {
    id: "studyloop-nora",
    name: "Nora",
    kind: "Fictional counterexample",
    lens: "A system that already works",
    text: "Already has a reliable study group and does not want another app.",
  },
] as const;

export type SourceId = (typeof sources)[number]["id"];
export const startingIdea = "Help students find study partners.";
export const startingAssumption = "Students struggle to find enough people to study with.";
export const interpretation =
  "Attendance coordination may matter more than finding more people for some existing groups.";
export const alternative = "These groups may need a clearer agreement, not another app.";
export const uncertainty = "We don’t know how common this is or whether a tool would help.";

export const choices = [
  {
    id: "confirmations",
    title: "Test attendance confirmations",
    summary: "Try a smaller coordination idea with existing groups.",
    feedback:
      "Focus on existing groups with uncertain attendance. This tests the coordination interpretation without assuming that every student needs another app.",
    question: "Would a simple confirmation flow be useful for these groups?",
    action:
      "Invite five consenting groups with this problem to try it for one week; compare each group’s own attendance records with its prior routine.",
    observe: "Whether groups use it, missed confirmations, attendance and workarounds.",
    reconsider:
      "Groups ignore it, their existing chat works as well, or coordination improves without a new app.",
    unknown: "Whether any change would persist or result from the confirmation flow.",
  },
  {
    id: "another-group",
    title: "Ask another group",
    summary: "Investigate the disagreement before building.",
    feedback:
      "You can investigate the disagreement before building. Look for how a reliable group organizes itself and how an uncertain group differs.",
    question: "What explains the contrast?",
    action:
      "Speak with one group with reliable attendance and one with uncertainty about their most recent session.",
    observe: "Their existing agreements, reminders and actual attendance.",
    reconsider: "The problem is not recurring or has a simpler non-product solution.",
    unknown: "How widespread either situation is.",
  },
  {
    id: "partner-discovery",
    title: "Keep exploring partner discovery",
    summary: "Find evidence for the original direction.",
    feedback:
      "You can retain the original direction, but these excerpts do not yet support it. Look for people who recently tried and failed to find suitable partners.",
    question: "Who has an unmet partner-finding problem?",
    action: "Seek recent concrete attempts and current workarounds before building the feed.",
    observe: "What was tried, who was available and what blocked a useful match.",
    reconsider: "Existing ways of finding partners already meet the need.",
    unknown: "Whether a discovery feed would be used.",
  },
] as const;

export type ChoiceId = (typeof choices)[number]["id"];
export const steps = [
  { short: "Listen", title: "What did people describe?", next: "Consider an interpretation" },
  {
    short: "Think",
    title: "A different problem may be emerging.",
    next: "Check what challenges it",
  },
  {
    short: "Check",
    title: "Nora already has a system that works.",
    next: "Choose a next move",
  },
  { short: "Choose", title: "What would you try next?", next: "Preview the next test" },
  { short: "Test", title: "Make the next test small and specific.", next: "" },
] as const;
