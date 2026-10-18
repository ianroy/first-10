import { expect, it } from "vitest";
import { createEmptyMarketingPlan } from "./marketing-plan";
import { buildMarketingPlanMarkdown } from "./marketing-export";
it("exports unknowns explicitly, distinguishes a zero target from results and labels fictional practice", () => {
  const plan = createEmptyMarketingPlan();
  plan.test.target = 0;
  const text = buildMarketingPlanMarkdown(plan, { projectName: "StudyLoop", fictional: true });
  expect(text).toContain("FICTIONAL DEMO / PRACTICE DATA");
  expect(text).toContain("may include unsaved edits");
  expect(text).toContain("Target \\(not an observed result\\): 0");
  expect(text).toContain("No observations recorded.");
  expect(text).toContain("Available minutes: Unknown / not recorded");
  expect(text).toContain("Cash budget: $0. This does not mean unlimited time or free AI.");
  expect(text).not.toContain("0%");
});
it("neutralizes markup in project names, source text, URLs and multiline notes", () => {
  const plan = createEmptyMarketingPlan();
  plan.studentFirst.columns = [
    { id: "column", title: "\n# injected label <img src=x> ![column](https://example.test/image)" },
  ];
  plan.studentFirst.notes = [{ id: "note", columnId: "column", text: "Note" }];
  plan.audience.beachhead = "<img src=x onerror=alert(1)>";
  plan.reflection.learned = "First line\n# forged heading\n![image](https://evil.test/image)";
  plan.sources = [
    {
      id: "source",
      kind: "owner_observation",
      label: "<script>bad</script>",
      text: "**claim** [click](javascript:alert(1))",
      recordId: null,
      url: "https://example.test/?x=<html>&y=1",
      observedOn: null,
    },
  ];
  const text = buildMarketingPlanMarkdown(plan, { projectName: "![remote](https://evil.test)" });
  expect(text).not.toContain("\n# injected label");
  expect(text).not.toContain("![column]");
  expect(text).not.toContain("<img");
  expect(text).not.toContain("<script>");
  expect(text).not.toContain("![image]");
  expect(text).not.toContain("\n# forged heading");
  expect(text).toContain("&lt;img");
  expect(text).toContain("&amp;");
  expect(text).toContain("\\!\\[remote\\]");
});
it("retains cohort, period, sources, limitations and references while suppressing invalid percentages", () => {
  const plan = createEmptyMarketingPlan();
  const row = {
    id: "reach",
    channelId: "c",
    assetId: null,
    metric: "relevant_reach" as const,
    cohort: "classmate" as const,
    from: "2026-10-01",
    to: "2026-10-07",
    unit: "unique_people" as const,
    count: 10,
    source: "Dated tally",
    sourceUrl: null,
    recordedOn: "2026-10-08",
    limitations: "Class exercise, no external adoption",
  };
  plan.measurements = [row, { ...row, id: "visit", metric: "visits", count: 0 }];
  plan.rates = [
    {
      id: "r",
      numeratorId: "visit",
      denominatorId: "reach",
      label: "Visit rate",
      subsetConfirmed: true,
    },
  ];
  plan.reflection.evidenceIds = ["visit"];
  let text = buildMarketingPlanMarkdown(plan, { projectName: "Example" });
  expect(text).toContain("Cohort: Classmates");
  expect(text).toContain("2026\\-10\\-01 to 2026\\-10\\-07");
  expect(text).toContain("Source: Dated tally");
  expect(text).toContain("Class exercise, no external adoption");
  expect(text).toContain("0 / 10 = 0\\.0%");
  expect(text).toContain("Supporting observations: Measurement 2");
  plan.measurements[0]!.count = null;
  text = buildMarketingPlanMarkdown(plan, { projectName: "Example" });
  expect(text).toContain("Count: Unknown / not recorded");
  expect(text).toContain("Not calculated:");
  expect(text).not.toContain("0\\.0%");
  expect(text).not.toContain('"id"');
});
it("does not mutate the private plan or silently omit its current drafts and next action", () => {
  const plan = createEmptyMarketingPlan();
  plan.reflection.nextAction = "Ask organizer for permission";
  plan.audience.unknowns = ["Does coordination cause trouble?"];
  const before = JSON.stringify(plan);
  expect(buildMarketingPlanMarkdown(plan, { projectName: "My draft" })).toContain(
    "Ask organizer for permission",
  );
  expect(JSON.stringify(plan)).toBe(before);
});
