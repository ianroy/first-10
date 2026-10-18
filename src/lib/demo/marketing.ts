import type { ChoiceId } from "./studyloop";

/** Authored teaching fixtures. These are proposals, never channel research or results. */
export const marketingScenarios = {
  confirmations: {
    audience: "Existing study groups with uncertain attendance",
    boundary:
      "Nora’s reliable group is not the target. A better agreement may be enough; a new app is only one possibility.",
    firstThought:
      "Start with a club where people already study together. Ask its organizer whether attendance is a recurring difficulty before offering a trial.",
    usefulAction: "A suitable group voluntarily agrees to discuss a one-week confirmation trial.",
    hook: "Does your study group spend more time checking who’s coming than getting started?",
    invitation:
      "We’re exploring a simple attendance-confirmation idea with existing study groups. It is an early student project; we have not shown that it improves attendance.",
    cta: "If attendance is a recurring problem for your group, would you be open to a short conversation about trying confirmations for one week?",
    dayFive:
      "If eligible groups consent, agree on a separate one-week trial and how they will record their own attendance. Five groups is a proposed invitation goal, not a recruitment result.",
    measurement:
      "Count unique groups that voluntarily agree to discuss the proposed trial; keep participant counts separate. A conversation is not adoption.",
    repeat:
      "Repeat a small invitation only if the intended groups understand it and describe a recurring problem. This would still not establish demand.",
    revise:
      "Revise if the invitation attracts the wrong groups or people mistake an early idea for a proven product.",
    stop: "Stop this route if access is refused, the problem is absent, or a simpler existing routine already meets the need.",
  },
  "another-group": {
    audience: "One group with reliable attendance and one with uncertainty",
    boundary:
      "Nora’s reliable group is a comparison to learn from, not a sales prospect. Explore what already works without asking it to switch.",
    firstThought:
      "Find contrasting routines before offering a product. An organizer might introduce two willing groups; permission and interest are unknown.",
    usefulAction: "A willing group agrees to describe its most recent study session.",
    hook: "What helps your study group know who will turn up?",
    invitation:
      "We’re comparing how study groups organize their sessions, including groups whose routines already work well. This student research invitation is not a product launch.",
    cta: "Would your group describe its most recent session and how you coordinated attendance in a short conversation? It is fine to decline.",
    dayFive:
      "With consent, hear from one reliable group and one uncertain group. Ask about their most recent session; do not turn a helpful introduction into a product pitch.",
    measurement:
      "Count unique groups that agree to a research conversation and record whether the comparison includes both routines. Responses are not users.",
    repeat:
      "Repeat the comparison only if the conversations reveal a specific uncertainty that another contrasting example could clarify.",
    revise:
      "Revise recruitment if both groups have the same routine or the invitation sounds like a product pitch.",
    stop: "Stop recruiting if access is refused or the comparison already points to an adequate existing routine; record what remains unknown.",
  },
  "partner-discovery": {
    audience: "Students who recently tried and failed to find suitable study partners",
    boundary:
      "The four fictional excerpts do not yet support this direction. Nora does not need another app; seek a relevant recent attempt instead.",
    firstThought:
      "Find a recent unsuccessful partner search before making a discovery feed. Ask in a relevant course community only if its rules allow research invitations.",
    usefulAction: "A student with a recent unsuccessful search volunteers to describe it.",
    hook: "Recently tried to find a study partner and struggled to find a useful match?",
    invitation:
      "We’re exploring how students find study partners. This is an early student research project; we do not yet know whether a new tool is needed.",
    cta: "If this happened recently, would you share what you tried and what got in the way in a short conversation? There is no product to sign up for.",
    dayFive:
      "With consent, ask about a recent unsuccessful search and current workarounds. Do not count general interest as evidence for a discovery feed.",
    measurement:
      "Count unique volunteers who describe a relevant recent attempt; distinguish them from general replies. No product activation is measured.",
    repeat:
      "Repeat a small research invitation if relevant recent attempts reveal a concrete unanswered question.",
    revise:
      "Revise if replies are only hypothetical opinions or the channel mostly reaches people whose current methods work.",
    stop: "Stop this route if access is refused or existing ways already solve the problem; do not build a feed to justify the original assumption.",
  },
} satisfies Record<
  ChoiceId,
  {
    audience: string;
    boundary: string;
    firstThought: string;
    usefulAction: string;
    hook: string;
    invitation: string;
    cta: string;
    dayFive: string;
    measurement: string;
    repeat: string;
    revise: string;
    stop: string;
  }
>;

export const marketingChannels = [
  {
    id: "club",
    name: "Campus club introduction",
    medium: "In person",
    role: "Organizer conversation",
    place: "A relevant campus club to identify",
    fit: "An organizer may know existing study groups and can explain whether an invitation fits.",
    access: "Organizer permission unknown",
    question: "Does this club serve the intended audience, and may we ask for an introduction?",
    effort: "Proposed: 30 minutes to investigate and ask",
    resource: "Use an existing meeting only if invited. No new travel or printing spend.",
    format: "Organizer email / conversation script",
  },
  {
    id: "community",
    name: "Course community post",
    medium: "Digital",
    role: "Moderated invitation",
    place: "A relevant course community to identify",
    fit: "A course-specific group may reach people with a recent shared study context.",
    access: "Community rules and moderator permission unknown",
    question: "Is a research invitation allowed, and is this the right audience?",
    effort: "Proposed: 30 minutes to investigate rules",
    resource: "Use an existing accessible space; do not buy reach or mass-message members.",
    format: "Short community post",
  },
] as const;
export type MarketingChannelId = (typeof marketingChannels)[number]["id"];
export const marketingPanels = ["Think", "Channels", "Draft", "7 days", "Review"] as const;

export function sampleContent(choiceId: ChoiceId, channelId: MarketingChannelId) {
  const scenario = marketingScenarios[choiceId];
  return channelId === "club"
    ? `Hello [organizer], we’re students exploring study-group routines. ${scenario.invitation} Does this fit your club? If so, may we invite interested members to a conversation? Please do not share anyone’s contact details without their permission.

Suggested invitation, only if allowed:
${scenario.hook}
${scenario.cta}`
    : `${scenario.hook}

${scenario.invitation}

${scenario.cta}

Posted by the student team building this idea, only with community permission.`;
}

export function sevenDayPlan(choiceId: ChoiceId, channelId: MarketingChannelId) {
  const channel = marketingChannels.find((item) => item.id === channelId)!;
  return [
    {
      day: "1",
      title: "Check audience and access",
      owner: "Team researcher",
      done: `Identify the actual place and ask: ${channel.question} Record permission or stop.`,
    },
    {
      day: "2",
      title: "Draft and check the destination",
      owner: "Student author",
      done: "Adapt the sample in your own words. Choose a working, consent-based reply route; remove placeholders before any invitation.",
    },
    {
      day: "3",
      title: "Watch a peer try it",
      owner: "Peer reviewer + author",
      done: "Ask whom the invitation is for and what happens next. Observe hesitation; revise before sending. A peer test is not market evidence.",
    },
    {
      day: "4",
      title: "Invite only if allowed",
      owner: "Team organizer",
      done: `Manually share one reviewed invitation through ${channel.name.toLowerCase()}, only after access and destination checks. If refused, investigate the alternative; never post anyway.`,
    },
    {
      day: "5",
      title: "Follow up with consent",
      owner: "Team researcher",
      done: marketingScenarios[choiceId].dayFive,
    },
    {
      day: "6",
      title: "Record counts and limits",
      owner: "Team recorder",
      done: "Record dated, consent-based manual observations. Keep peers, classmates and outside participants separate. Use unknown when a denominator is unavailable.",
    },
    {
      day: "7",
      title: "Explain the next decision",
      owner: "Team together",
      done: "Compare observations with the starting thought. Choose repeat, revise or stop, cite the reason and name the next uncertainty.",
    },
  ];
}
