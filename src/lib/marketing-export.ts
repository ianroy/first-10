import type { MarketingPlanV1 } from "./marketing-plan";
import {
  cohortLabels,
  deriveMarketingRate,
  formatMarketingPercent,
  measurementLabels,
} from "./marketing-metrics";
/** Treat owner-authored text as text even if the downloaded Markdown is rendered elsewhere. */
function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim()))
    return "Unknown / not recorded";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " / ")
    .split("")
    .map((char) => ("\\`*_{}[]()#+-.!|~".includes(char) ? `\\${char}` : char))
    .join("");
}
export function buildMarketingPlanMarkdown(
  plan: MarketingPlanV1,
  options: { projectName: string; fictional?: boolean },
): string {
  const lines = [
    "# First Ten — Marketing Lab",
    "",
    `Project: ${text(options.projectName)}`,
    "",
    "Current workspace snapshot; may include unsaved edits. Manually recorded, not independently verified. This export does not save the plan or transmit it anywhere.",
    "",
  ];
  if (options.fictional)
    lines.push("FICTIONAL DEMO / PRACTICE DATA — not evidence of real adoption.", "");
  const field = (label: string, value: string | number | null | undefined) =>
    lines.push(`- ${text(label)}: ${text(value)}`);
  const list = (label: string, values: string[]) =>
    field(label, values.length ? values.join("; ") : null);
  const section = (title: string) => lines.push("", `## ${title}`, "");
  const channel = (id: string | null) =>
    plan.channels.find((item) => item.id === id)?.name || "Unknown / not selected";
  const asset = (id: string | null) =>
    id === null
      ? "Whole channel"
      : plan.assets.find((item) => item.id === id)?.ownHook || "Unnamed asset";
  const measurement = (id: string | null) => {
    const i = plan.measurements.findIndex((row) => row.id === id);
    return i < 0 ? "Unknown / not recorded" : `Measurement ${i + 1}`;
  };
  section("Original thinking");
  field("Preserved on", plan.studentFirst.completedAt);
  field("Audience", plan.studentFirst.audience);
  field("Useful action", plan.studentFirst.usefulAction);
  list("Initial channel ideas", plan.studentFirst.channelIdeas);
  for (const note of plan.studentFirst.notes)
    field(
      plan.studentFirst.columns.find((c) => c.id === note.columnId)?.title || "Initial note",
      note.text,
    );
  section("Audience and value");
  field("Beachhead", plan.audience.beachhead);
  field("Situation", plan.audience.situation);
  field("Useful action", plan.audience.usefulAction);
  field("Value proposition", plan.audience.valueProposition);
  list("Assumptions", plan.audience.assumptions);
  list("Unknowns", plan.audience.unknowns);
  section("Source notes");
  if (!plan.sources.length) lines.push("No source notes recorded.");
  for (const source of plan.sources) {
    lines.push(`### ${text(source.label)}`, "");
    field("Kind", source.kind);
    field("Observation / source text", source.text);
    field("Observed on", source.observedOn);
    field("Owner-supplied URL (not verified)", source.url);
  }
  section("Channels and access");
  field("Primary channel", channel(plan.selection.primaryId));
  field("Alternative", channel(plan.selection.alternativeId));
  field("Selection reason", plan.selection.reason);
  for (const item of plan.channels) {
    lines.push("", `### ${text(item.name)}`, "");
    field("Medium", item.medium);
    field("Place", item.place);
    field("Owner-supplied URL (not verified)", item.url);
    field("Observation", item.observation);
    field("Why it fits", item.fitReason);
    field("Access status (owner recorded)", item.access.state);
    field("Rules / permission note", item.access.rulesNote);
    field("Checked on", item.access.checkedOn);
    field("Next access question", item.access.nextQuestion);
    field("Estimated minutes", item.estimatedMinutes);
    list("Resources needed", item.resourcesNeeded);
    list("Unknowns", item.unknowns);
  }
  section("Content drafts — unsent");
  if (!plan.assets.length)
    lines.push(
      "No content drafts recorded. Temporary AI practice is not part of the saved plan and is not included.",
    );
  for (const item of plan.assets) {
    lines.push("", `### ${text(item.ownHook || "Untitled draft")}`, "");
    field("Channel", channel(item.channelId));
    field("Format", item.format);
    field("Body", item.body);
    field("Truthful support", item.truthfulSupport);
    field("Builder disclosure", item.builderDisclosure);
    field("Call to action", item.cta);
    field("First useful action", item.firstUsefulAction);
    field("Owner-supplied destination (not verified)", item.destinationUrl);
    field(
      "Truth / disclosure / access / destination checks (owner recorded)",
      [
        item.review.truthful,
        item.review.disclosedBuilder,
        item.review.accessChecked,
        item.review.destinationChecked,
      ]
        .map((v) => (v ? "checked" : "not checked"))
        .join(" / "),
    );
    field("Peer/self walkthrough", item.walkthrough.mode);
    field("Walkthrough observation", item.walkthrough.actionObserved);
    field("Hesitation", item.walkthrough.hesitation);
    field("Revision made", item.walkthrough.revisionMade);
  }
  section("Resources and small test");
  lines.push("Cash budget: $0. This does not mean unlimited time or free AI.");
  field("Available minutes", plan.resources.availableMinutes);
  list("Existing resources", plan.resources.existingResources);
  list("Limitations", plan.resources.limitations);
  field("AI use setting", plan.resources.aiUse);
  field("Fallback", plan.resources.fallback);
  field("Test state", plan.test.state);
  field("Start", plan.test.startOn);
  field("End", plan.test.endOn);
  field("Review date", plan.test.reviewOn);
  field("Primary metric", measurementLabels[plan.test.primaryMetric]);
  field("Baseline", measurement(plan.test.baselineMeasurementId));
  field("Target (not an observed result)", plan.test.target);
  field("Unknown baseline / target explanation", plan.test.unknownBaselineOrTarget);
  field("Measurement plan", plan.test.measurementPlan);
  field("Repeat if", plan.test.repeatIf);
  field("Revise if", plan.test.reviseIf);
  field("Stop if", plan.test.stopIf);
  for (const task of plan.test.tasks) {
    lines.push("", `### ${text(task.title || "Untitled action")}`, "");
    field("Owner", task.ownerLabel);
    field("Due", task.dueOn);
    field("Status", task.status);
    field("Done means", task.doneMeans);
    field("Estimated minutes", task.estimatedMinutes);
    list(
      "Dependencies",
      task.dependsOn.map((id) => plan.test.tasks.find((t) => t.id === id)?.title || "Unknown task"),
    );
    field("Completion observation", task.completionNote);
  }
  section("Manual observations");
  lines.push(
    "Unknown is not zero. Peer practice, classmates and outside participants remain separate; no automated analytics is implied.",
  );
  if (!plan.measurements.length) lines.push("No observations recorded.");
  plan.measurements.forEach((row, i) => {
    lines.push("", `### Measurement ${i + 1}`, "");
    field("Metric", measurementLabels[row.metric]);
    field("Channel", channel(row.channelId));
    field("Asset scope", asset(row.assetId));
    field("Cohort", cohortLabels[row.cohort]);
    field("Inclusive date window", `${row.from || "unknown"} to ${row.to || "unknown"}`);
    field("Unit", row.unit);
    field("Count", row.count);
    field("Source", row.source);
    field("Owner-supplied source URL (not verified)", row.sourceUrl);
    field("Recorded on", row.recordedOn);
    field("Limitations", row.limitations);
  });
  section("Comparable rates");
  if (!plan.rates.length) lines.push("No comparisons recorded.");
  for (const rate of plan.rates) {
    const result = deriveMarketingRate(rate, plan.measurements);
    lines.push("", `### ${text(rate.label || "Untitled comparison")}`, "");
    field("Numerator", measurement(rate.numeratorId));
    field("Denominator", measurement(rate.denominatorId));
    field(
      "Result",
      result.ok
        ? `${result.numerator} / ${result.denominator} = ${formatMarketingPercent(result.percent)}`
        : `Not calculated: ${result.reason}`,
    );
    lines.push(
      "Read the referenced observations for cohort, date window, sources and limitations. A descriptive rate does not establish demand or causation.",
    );
  }
  section("Reflection and next decision");
  field("Decision", plan.reflection.decision);
  list("Supporting observations", plan.reflection.evidenceIds.map(measurement));
  field("What was learned", plan.reflection.learned);
  field("Limits and uncertainty", plan.reflection.uncertainty);
  field("Next action", plan.reflection.nextAction);
  field("Reviewed on", plan.reflection.reviewedOn);
  return lines.join("\n") + "\n";
}
