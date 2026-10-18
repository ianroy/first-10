import type { MarketingPlanV1, AiOrigin } from "@/lib/marketing-plan";
import type { TeacherPlanV1 } from "@/lib/teacher-plan";
import {
  deriveMarketingRate,
  formatMarketingPercent,
  measurementLabels,
  cohortLabels,
} from "@/lib/marketing-metrics";
import { activity, section, sourceState, type SaveState, type ActivityOffer } from "./adapters";
import type { ExportValue } from "./activity";

function ai(origin: AiOrigin | null): string {
  return origin
    ? `AI draft: ${origin.kind}; prompt ${origin.promptVersion}; model ${origin.modelId}; plan revision ${origin.planRevision}. Current wording may include human edits.`
    : "No recorded AI origin; manual or earlier work.";
}
/** Uses only the explicit in-memory owner-loaded document. No hidden record/source fetch. */
export function marketingActivities(plan: MarketingPlanV1, state: SaveState): ActivityOffer[] {
  const options = {
    kind: "Manual Marketing Lab",
    fictional: state.fictional ?? false,
    updatedAt: state.dirty ? null : state.savedAt,
  };
  const name = (id: string | null) =>
    id ? plan.channels.find((c) => c.id === id)?.name || "Unavailable channel" : "Not selected";
  const assetName = (id: string | null) =>
    id
      ? plan.assets.findIndex((a) => a.id === id) >= 0
        ? `Content draft ${plan.assets.findIndex((a) => a.id === id) + 1}`
        : "Unavailable content"
      : "Whole channel / no specific asset";
  const source = (id: string) =>
    plan.sources.find((s) => s.id === id)?.label || "Referenced source unavailable";
  const measurement = (id: string | null) =>
    id
      ? plan.measurements.findIndex((m) => m.id === id) >= 0
        ? `Observation ${plan.measurements.findIndex((m) => m.id === id) + 1}`
        : "Referenced observation unavailable"
      : "Unknown / not recorded";
  const make = (key: string, title: string, sections: Parameters<typeof activity>[2]) =>
    activity(key, title, [sourceState(key, state), ...sections], options);
  const thinking = make("marketing.think", "Marketing 1 - Original thinking and audience", [
    section("marketing.think.original", "Preserved student-first thinking", [
      ["Preserved on", plan.studentFirst.completedAt],
      ["Audience", plan.studentFirst.audience],
      ["Useful action", plan.studentFirst.usefulAction],
      ["Initial channel ideas", plan.studentFirst.channelIdeas.join("\n")],
      ["Original board headings", plan.studentFirst.columns.map((c) => c.title).join("\n")],
      ...plan.studentFirst.notes.map((n): [string, ExportValue] => [
        plan.studentFirst.columns.find((c) => c.id === n.columnId)?.title ||
          "Unassigned original note",
        n.text,
      ]),
    ]),
    section("marketing.think.audience", "Audience and candidate value", [
      ["Beachhead", plan.audience.beachhead],
      ["Situation", plan.audience.situation],
      ["Useful action", plan.audience.usefulAction],
      ["Value proposition", plan.audience.valueProposition],
      ["Source references", plan.audience.sourceIds.map(source).join("\n")],
      ["Assumptions", plan.audience.assumptions.join("\n")],
      ["Unknowns", plan.audience.unknowns.join("\n")],
    ]),
    ...plan.sources.map((s, i) =>
      section(`marketing.think.source.${i}`, `Source note ${i + 1}`, [
        ["Label", s.label],
        ["Kind", s.kind],
        ["Source text", s.text],
        ["Owner-supplied URL (not verified)", s.url],
        ["Observed on", s.observedOn],
        [
          "Private record reference",
          s.recordId
            ? "Linked in the private source; identifier omitted"
            : "No linked private record",
        ],
      ]),
    ),
  ]);
  const channels = make("marketing.channels", "Marketing 2 - Channels and access", [
    section("marketing.channels.selection", "Current selection", [
      ["Primary", name(plan.selection.primaryId)],
      ["Alternative", name(plan.selection.alternativeId)],
      ["Reason", plan.selection.reason],
    ]),
    ...plan.channels.map((c, i) =>
      section(`marketing.channels.item.${i}`, `Channel ${i + 1}`, [
        ["Name", c.name],
        ["Medium", c.medium],
        ["Place", c.place],
        ["Owner-supplied URL (not verified)", c.url],
        ["Supporting sources", c.sourceIds.map(source).join("\n")],
        ["Observation", c.observation],
        ["Why it fits", c.fitReason],
        ["Access state", c.access.state],
        ["Rules note", c.access.rulesNote],
        ["Rules source", c.access.rulesSourceId ? source(c.access.rulesSourceId) : null],
        ["Checked on", c.access.checkedOn],
        ["Next access question", c.access.nextQuestion],
        ["Estimated minutes", c.estimatedMinutes],
        ["Resources", c.resourcesNeeded.join("\n")],
        ["Unknowns", c.unknowns.join("\n")],
        ["Origin", c.origin],
        ["AI source", ai(c.aiOrigin)],
      ]),
    ),
  ]);
  const contentSections = plan.assets.map((a, i) =>
    section(`marketing.content.item.${i}`, `Content draft ${i + 1} - unsent`, [
      ["Channel", name(a.channelId)],
      ["Format", a.format],
      ["Own hook", a.ownHook],
      ["Truthful support", a.truthfulSupport],
      ["Support references", a.supportSourceIds.map(source).join("\n")],
      ["Body", a.body],
      ["Builder disclosure", a.builderDisclosure],
      ["Call to action", a.cta],
      ["Owner-supplied destination (not verified)", a.destinationUrl],
      ["First useful action", a.firstUsefulAction],
      ["AI source", ai(a.aiOrigin)],
      ["Truth checked", a.review.truthful],
      ["Builder disclosed", a.review.disclosedBuilder],
      ["Access checked", a.review.accessChecked],
      ["Destination checked", a.review.destinationChecked],
      ["Checks recorded on", a.review.checkedAt],
      ["Walkthrough mode", a.walkthrough.mode],
      ["Audience understood", a.walkthrough.understoodAudience],
      ["Action observed", a.walkthrough.actionObserved],
      ["Hesitation", a.walkthrough.hesitation],
      ["Revision", a.walkthrough.revisionMade],
      ["Walkthrough date", a.walkthrough.checkedOn],
    ]),
  );
  const content = make(
    "marketing.content",
    "Marketing 3 - Content and peer walkthrough",
    contentSections.length
      ? contentSections
      : [
          section("marketing.content.empty", "Content", [
            [
              "Status",
              "No content drafts recorded. Temporary AI practice is separate until explicitly adopted.",
            ],
          ]),
        ],
  );
  const taskSections = plan.test.tasks.map((t, i) =>
    section(`marketing.test.task.${i}`, `Action ${i + 1}`, [
      ["Title", t.title],
      ["Type", t.kind],
      ["Owner label", t.ownerLabel],
      ["Channel", name(t.channelId)],
      ["Content", assetName(t.assetId)],
      ["Due", t.dueOn],
      [
        "Dependencies",
        t.dependsOn
          .map(
            (id) => plan.test.tasks.find((v) => v.id === id)?.title || "Unavailable prerequisite",
          )
          .join("\n"),
      ],
      ["Definition of done", t.doneMeans],
      ["Estimated minutes", t.estimatedMinutes],
      ["Status (owner recorded)", t.status],
      ["Completion observation", t.completionNote],
    ]),
  );
  const test = make("marketing.test", "Marketing 4 - Bounded test and tasks", [
    section("marketing.test.resources", "Time, resources and fallback", [
      ["Cash budget in cents", plan.resources.cashBudgetCents],
      ["Available minutes", plan.resources.availableMinutes],
      ["Resources", plan.resources.existingResources.join("\n")],
      ["Limitations", plan.resources.limitations.join("\n")],
      ["AI use", plan.resources.aiUse],
      ["Fallback", plan.resources.fallback],
    ]),
    section("marketing.test.protocol", "Test state and decision rules", [
      ["State", plan.test.state],
      ["Start date", plan.test.startOn],
      ["End date", plan.test.endOn],
      ["Review date", plan.test.reviewOn],
      ["Started at", plan.test.startedAt],
      ["Primary metric", measurementLabels[plan.test.primaryMetric]],
      ["Baseline", measurement(plan.test.baselineMeasurementId)],
      ["Target (not observed result)", plan.test.target],
      ["Unknown baseline or target", plan.test.unknownBaselineOrTarget],
      ["Measurement plan", plan.test.measurementPlan],
      ["Repeat if", plan.test.repeatIf],
      ["Revise if", plan.test.reviseIf],
      ["Stop if", plan.test.stopIf],
    ]),
    ...taskSections,
  ]);
  const measureSections = plan.measurements.map((m, i) =>
    section(`marketing.review.observation.${i}`, `Observation ${i + 1}`, [
      ["Metric", measurementLabels[m.metric]],
      ["Channel", name(m.channelId)],
      ["Asset scope", assetName(m.assetId)],
      ["Cohort", cohortLabels[m.cohort]],
      ["From", m.from],
      ["Through", m.to],
      ["Unit", m.unit],
      ["Count", m.count],
      ["Source", m.source],
      ["Owner-supplied source URL (not verified)", m.sourceUrl],
      ["Recorded on", m.recordedOn],
      ["Limitations", m.limitations],
    ]),
  );
  const review = make("marketing.review", "Marketing 5 - Measurements and reflection", [
    section("marketing.review.limits", "Measurement boundaries", [
      [
        "Limits",
        "Manual observations only. Unknown is not zero. Keep peer tests, classmates and external participants separate. Rates are descriptive, not causation or proof of demand.",
      ],
    ]),
    ...measureSections,
    ...plan.rates.map((r, i) => {
      const rate = deriveMarketingRate(r, plan.measurements);
      return section(`marketing.review.rate.${i}`, `Comparison ${i + 1}`, [
        ["Label", r.label],
        ["Numerator", measurement(r.numeratorId)],
        ["Denominator", measurement(r.denominatorId)],
        ["Subset confirmed", r.subsetConfirmed],
        [
          "Result",
          rate.ok
            ? `${rate.numerator} / ${rate.denominator} = ${formatMarketingPercent(rate.percent)}`
            : `Not calculated: ${rate.reason}`,
        ],
      ]);
    }),
    section("marketing.review.reflection", "Next decision", [
      ["Decision", plan.reflection.decision],
      ["Supporting observations", plan.reflection.evidenceIds.map(measurement).join("\n")],
      ["Learned", plan.reflection.learned],
      ["Uncertainty", plan.reflection.uncertainty],
      ["Next action", plan.reflection.nextAction],
      ["Reviewed on", plan.reflection.reviewedOn],
    ]),
  ]);
  return [
    thinking,
    channels,
    content,
    test,
    review,
    ...contentSections.map((s, i) =>
      make(`marketing.content-record.${i}`, `Marketing content draft ${i + 1}`, [s]),
    ),
    ...taskSections.map((s, i) =>
      make(`marketing.task-record.${i}`, `Marketing action ${i + 1}`, [s]),
    ),
    ...measureSections.map((s, i) =>
      make(`marketing.observation-record.${i}`, `Marketing observation ${i + 1}`, [s]),
    ),
  ];
}

export function teacherActivities(plan: TeacherPlanV1, state: SaveState): ActivityOffer[] {
  const options = {
    kind: "Owner-private lesson planning",
    fictional: state.fictional ?? false,
    updatedAt: state.dirty ? null : state.savedAt,
  };
  return [
    activity(
      "teacher.plan",
      "Private lesson plan",
      [
        sourceState("teacher.plan", state),
        section("teacher.plan.fields", "Facilitator planning", [
          ["Class / lesson name", plan.className],
          ["Audience", plan.audience],
          ["Learning objectives", plan.learningObjectives.join("\n")],
          ["Assignment", plan.assignment],
          ["Session minutes", plan.sessionMinutes],
          ["Planned learner capacity - not enrollment", plan.plannedLearners],
          ["Scheduled on", plan.scheduledOn],
          ["Assessment", plan.assessment],
          ["Private facilitator notes", plan.facilitatorNotes],
          [
            "Access boundary",
            "Planning only. This does not include enrolled students, submissions, progress or authority to read private student notes.",
          ],
        ]),
      ],
      options,
    ),
    activity(
      "teacher.student-task",
      "Student task preview from lesson plan",
      [
        sourceState("teacher.student-task", state),
        section("teacher.student-task.fields", "Read-only assignment preview", [
          ["Lesson", plan.className],
          ["Objectives", plan.learningObjectives.join("\n")],
          ["Assignment", plan.assignment],
          ["Time in minutes", plan.sessionMinutes],
          ["Assessment", plan.assessment],
          ["Status", "A planning preview, not a published assignment or student submission."],
        ]),
      ],
      options,
    ),
  ];
}
