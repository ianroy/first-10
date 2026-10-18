import {
  activity,
  section,
  sourceState,
  boundedOffers,
  type ActivityOffer,
  type SaveState,
} from "@/lib/export/adapters";
import { guestMarketingDocumentSchema, type GuestMarketingDocument } from "./contracts";
/** Every editable activity is independently selectable; no private-account source reads. */
export function guestMarketingActivities(
  value: GuestMarketingDocument,
  state: SaveState,
  audience: "principal_private" | "team_shared",
): ActivityOffer[] {
  const d = guestMarketingDocumentSchema.parse(value),
    offers: ActivityOffer[] = [],
    channel = (id: string) => d.channels.find((c) => c.id === id)?.name || "Unnamed channel";
  const add = (
    key: string,
    title: string,
    entries: Array<[string, string | number | boolean | null]>,
  ) =>
    offers.push(
      activity(
        `guest.marketing.${key}`,
        title,
        [
          sourceState(`guest.marketing.${key}`, state),
          section(`guest.marketing.${key}.fields`, title, entries),
        ],
        {
          kind: "Manually recorded guest Marketing Lab",
          updatedAt: state.dirty ? null : state.savedAt,
          fictional: state.fictional ?? false,
          sourceScope:
            audience === "principal_private" ? "guest_principal_private" : "guest_team_shared",
        },
      ),
    );
  add("thinking", "First thinking", [
    ["Plan", d.title],
    ["Observations", d.thinking.observations],
    ["Reachable audience", d.thinking.reachableAudience],
    ["Useful action", d.thinking.usefulAction],
    ["Own channel ideas", d.thinking.channelIdeas],
    ["Preserved at", d.thinking.completedAt],
    ["Limit", "First thinking is a student-authored starting point; not customer evidence."],
  ]);
  add("audience", "Audience and value proposition", [
    ["Beachhead", d.audience.beachhead],
    ["Situation", d.audience.situation],
    ["Value proposition", d.audience.valueProposition],
    ["Assumptions", d.audience.assumptions],
    ["Source notes and limits", d.audience.sourceNotes],
    ["Primary channel", d.primaryChannelId ? channel(d.primaryChannelId) : null],
    ["Alternative channel", d.alternativeChannelId ? channel(d.alternativeChannelId) : null],
    ["Selection reason", d.selectionReason],
  ]);
  d.channels.forEach((c, i) =>
    add(`channel.${i}`, `Channel ${i + 1}: ${c.name || "Untitled"}`, [
      ["Medium", c.medium],
      ["Place / public link", c.place],
      ["Observation", c.observation],
      ["Fit", c.fitReason],
      ["Access", c.access],
      ["Rules", c.rules],
      ["Rules source", c.sourceNote],
      ["Checked on", c.checkedOn],
      ["Estimated minutes", c.estimatedMinutes],
      ["Unknowns and response bias", c.unknowns],
    ]),
  );
  d.content.forEach((a, i) =>
    add(`content.${i}`, `Content ${i + 1}: ${a.format}`, [
      ["Channel", channel(a.channelId)],
      ["Hook", a.hook],
      ["Truthful support", a.truthfulSupport],
      ["Body / demo script", a.body],
      ["Builder disclosure", a.builderDisclosure],
      ["Call to action", a.callToAction],
      ["Destination (not fetched)", a.destination],
      ["First useful action", a.firstUsefulAction],
      ["Claims checked", a.review.truthful],
      ["Builder relationship checked", a.review.builderDisclosed],
      ["Access checked", a.review.accessChecked],
      ["Destination checked", a.review.destinationChecked],
      ["Walkthrough mode", a.walkthrough.mode],
      ["Understood audience", a.walkthrough.understoodAudience],
      ["Observed action", a.walkthrough.actionObserved],
      ["Hesitation", a.walkthrough.hesitation],
      ["Revision", a.walkthrough.revision],
    ]),
  );
  d.outreach.forEach((a, i) =>
    add(`outreach.${i}`, `Outreach ${i + 1}: ${a.purpose}`, [
      ["Channel", channel(a.channelId)],
      ["Recipient role / alias", a.recipientRole],
      ["Subject", a.subject],
      ["Message draft", a.body],
      ["Respectful exit", a.respectfulExit],
      ["Manually reported status", a.status],
      ["Observed response", a.observation],
      ["Limit", "The app does not send outreach, verify delivery or contact anyone."],
    ]),
  );
  add("test", "$0 test plan", [
    ["Cash budget (cents)", d.resources.cashBudgetCents],
    ["Available minutes", d.resources.availableMinutes],
    ["Existing resources", d.resources.existingResources],
    ["Limits", d.resources.limitations],
    ["Fallback", d.resources.fallback],
    ["Hypothesis", d.test.hypothesis],
    ["Manually reported state", d.test.state],
    ["Primary metric", d.test.primaryMetric],
    ["Baseline", d.test.baseline],
    ["Target", d.test.target],
    ["Unknowns", d.test.unknowns],
    ["Measurement plan", d.test.measurementPlan],
    ["Repeat if", d.test.repeatIf],
    ["Revise if", d.test.reviseIf],
    ["Stop if", d.test.stopIf],
    ["Start", d.test.startOn],
    ["End", d.test.endOn],
    ["Review", d.test.reviewOn],
  ]);
  d.test.tasks.forEach((a, i) =>
    add(`task.${i}`, `Test action ${i + 1}: ${a.title || "Untitled"}`, [
      ["Owner role / alias", a.ownerAlias],
      ["Due", a.dueOn],
      ["Prerequisite", a.prerequisite],
      ["Done means", a.doneMeans],
      ["Manual status", a.status],
      ["Observed completion / blocker", a.completionNote],
    ]),
  );
  d.measurements.forEach((m, i) =>
    add(`measurement.${i}`, `Measurement ${i + 1}: ${m.metric}`, [
      ["Channel", channel(m.channelId)],
      [
        "Content",
        m.assetId
          ? d.content.find((a) => a.id === m.assetId)?.hook || "Unnamed content"
          : "Entire channel / unknown content",
      ],
      ["Metric", m.metric],
      ["Cohort", m.cohort],
      ["Inclusive window", `${m.from} to ${m.to}`],
      ["Unit", m.unit],
      ["Count — blank is unknown", m.count],
      ["Source", m.source],
      ["Recorded on", m.recordedOn],
      ["Limitations", m.limitations],
      ["Used for reflection", d.reflection.evidenceIds.includes(m.id)],
    ]),
  );
  add("reflection", "Learning and next action", [
    ["Decision", d.reflection.decision],
    [
      "Selected measurements",
      d.reflection.evidenceIds
        .map((id) => `Measurement ${d.measurements.findIndex((m) => m.id === id) + 1}`)
        .join("\n"),
    ],
    ["Learning", d.reflection.learned],
    ["Uncertainty", d.reflection.uncertainty],
    ["Next action", d.reflection.nextAction],
    [
      "Limits",
      "Manual observations and counts are unverified. Saving/exporting does not publish, submit, prove demand or enable AI/analytics. Teachers cannot open this plan automatically.",
    ],
  ]);
  return boundedOffers(offers);
}
