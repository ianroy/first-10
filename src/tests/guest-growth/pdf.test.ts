import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  guestGrowthActivities,
  guestGrowthPortfolio,
  guestGrowthExportAudiences,
  guestGrowthLearningPdf,
  guestGrowthExperimentPdf,
  guestGrowthPipelinePdf,
  guestGrowthSurveyPdf,
  guestGrowthReferralPdf,
  guestGrowthOnboardingPdf,
  type GuestGrowthPdfSource,
} from "@/lib/guest-growth/pdf";
import {
  freezeActivityExport,
  exportSnapshotText,
  type ActivityExportV1,
} from "@/lib/export/activity";
import { createActivityPdf } from "@/lib/export/pdf";
import { createEmptyGuestGrowth } from "@/lib/guest-growth/contracts";
import { records, scope, id, time } from "./fixture";
const freeze = (d: ActivityExportV1, audience: "owner" | "team" | "teacher" = "owner") =>
  freezeActivityExport(
    d,
    {
      audience,
      activityKeys: d.activities.map((a) => a.key),
      sectionKeys: d.activities.flatMap((a) => a.sections.map((s) => s.key)),
    },
    { allowedAudiences: [audience] },
  );
it.each([
  ["learning", guestGrowthLearningPdf],
  ["experiment", guestGrowthExperimentPdf],
  ["pipeline_contact", guestGrowthPipelinePdf],
  ["survey", guestGrowthSurveyPdf],
  ["referral", guestGrowthReferralPdf],
  ["onboarding", guestGrowthOnboardingPdf],
] as const)("binds the individual %s PDF to its exact structured kind", (kind, build) => {
  const record = records().find((r) => r.kind === kind)!;
  const source = { state: "saved" as const, record };
  expect(build(source, scope, "Individual", time)).toEqual(
    guestGrowthPortfolio([source], scope, "Individual", time),
  );
  const other = records().find((r) => r.kind !== kind)!;
  expect(() => build({ state: "saved", record: other }, scope)).toThrow("selected activity kind");
});
it("covers the complete six-kind document inventory without losing structured values", () => {
  const sources: GuestGrowthPdfSource[] = records().map((record) => ({ state: "saved", record }));
  const d = guestGrowthPortfolio(sources, scope, "Fictional growth portfolio", time),
    text = exportSnapshotText(freeze(d));
  const must = [
    "OBSERVATION_SUMMARY",
    "LEARNING_INTERPRETATION",
    "COUNTEREVIDENCE",
    "LEARNING_UNCERTAINTY",
    "PATTERN_OBSERVATION",
    "PATTERN_INTERPRETATION",
    "PATTERN_LIMITATIONS",
    "OBJECTION_ONE",
    "BEST_FIT_HYPOTHESIS",
    "CHANGE_TITLE",
    "CHANGE_REASON",
    "CHANGE_NEXT_STEP",
    "NEXT_FALSIFIABLE_TEST",
    "EXPERIMENT_HYPOTHESIS",
    "EXPERIMENT_CHANGE",
    "EXPERIMENT_AUDIENCE",
    "EXPERIMENT_PROCEDURE",
    "CRITERION_MEASURE",
    "REPEAT_RULE",
    "REVISE_RULE",
    "STOP_RULE",
    "REPORTED_RESULT_SUMMARY",
    "EXPERIMENT_LIMITATIONS",
    "EXPERIMENT_NEXT_ACTION",
    "ALIAS_RELEVANT_EXPERIENCE",
    "ALIAS_FIT_REASON",
    "ALIAS_SOURCE",
    "REPORTED_PAYMENT_BASIS",
    "PIPELINE_UNCERTAINTY",
    "PIPELINE_NEXT_ACTION",
    "SURVEY_PURPOSE",
    "SURVEY_AUDIENCE",
    "SURVEY_INTRODUCTION",
    "SURVEY_PERMISSION",
    "OPEN_SURVEY_PROMPT",
    "OPEN_SURVEY_PURPOSE",
    "CHOICE_SURVEY_PROMPT",
    "CHOICE_SURVEY_PURPOSE",
    "OPTION_ONE",
    "OPTION_TWO",
    "SCALE_SURVEY_PROMPT",
    "SCALE_SURVEY_PURPOSE",
    "SCALE_LOW",
    "SCALE_HIGH",
    "REFERRAL_ROLE",
    "REFERRAL_FIT_CRITERIA",
    "REFERRAL_BUILDER_DISCLOSURE",
    "REFERRAL_CONTEXT",
    "REFERRAL_SPECIFIC_ASK",
    "END_OF_REFERRAL_BODY",
    "REFERRAL_RESPECTFUL_EXIT",
    "ONBOARDING_AUDIENCE",
    "ONBOARDING_USER_GOAL",
    "ONBOARDING_FIRST_ACTION",
    "ONBOARDING_OBSERVATION_PLAN",
    "ONBOARDING_WALKTHROUGH",
    "ONBOARDING_HESITATION",
    "BEFORE_ONBOARDING_PROMPT",
    "BEFORE_ONBOARDING_PURPOSE",
    "DURING_ONBOARDING_PROMPT",
    "DURING_ONBOARDING_PURPOSE",
    "AFTER_ONBOARDING_PROMPT",
    "AFTER_ONBOARDING_PURPOSE",
  ];
  for (const value of must) expect(text, value).toContain(value);
  for (const referenceId of [id(101), id(102), id(103), id(201), id(206)])
    expect(JSON.stringify(d)).toContain(referenceId);
  // Existing export privacy scrubbing removes opaque identifiers in presentation text.
  expect(text).toContain("learning / [Identifier removed] / retained revision 2");
  expect(text).toContain("Question reference: [Identifier removed]");
  expect(d.activities).toHaveLength(6);
  expect(text).toContain("Unknown / not recorded");
  expect(text).toContain("Target: 0");
  expect(text).toContain("Reported count: 0");
  expect(text).toContain("not verified customer evidence");
  expect(text).toContain(
    "Linked bodies, raw interviews and cross-studio context are not loaded or copied",
  );
});
it("keeps genuinely scoped draft, exact saved and changed-local-overlay labels distinct", () => {
  const record = records()[0]!,
    draft = {
      state: "draft" as const,
      localDraftId: id(900),
      document: createEmptyGuestGrowth("learning"),
    };
  const unsaved = exportSnapshotText(freeze(guestGrowthPortfolio([draft], scope, "Draft", time)));
  expect(unsaved).toContain("Unsaved local draft; no stored record is claimed");
  expect(unsaved).not.toContain("Exact retained saved revision");
  const exact = exportSnapshotText(
    freeze(guestGrowthPortfolio([{ state: "saved", record }], scope, "Exact", time)),
  );
  expect(exact).toContain("Exact retained saved revision 2");
  const changed = exportSnapshotText(
    freeze(
      guestGrowthPortfolio(
        [{ state: "saved", record, localDocument: { ...record.document, title: "A local edit" } }],
        scope,
        "Changed",
        time,
      ),
    ),
  );
  expect(changed).toContain("these edits are NOT saved");
  expect(changed).toContain("A local edit");
  expect(() =>
    guestGrowthActivities({ state: "saved", record: { ...record, classId: id(77) } }, scope),
  ).toThrow();
  expect(() =>
    guestGrowthActivities(
      { state: "saved", record: { ...record, authorPrincipalId: id(77) } },
      scope,
    ),
  ).toThrow();
  expect(() =>
    guestGrowthActivities(
      { state: "saved", record, localDocument: createEmptyGuestGrowth("experiment") },
      scope,
    ),
  ).toThrow();
});
it("never widens private portfolio audiences or substitutes/drops repeated or oversized sources", () => {
  const privateSources: GuestGrowthPdfSource[] = records().map((record) => ({
      state: "saved",
      record,
    })),
    teamSources: GuestGrowthPdfSource[] = records(true).map((record) => ({
      state: "saved",
      record,
    }));
  expect(guestGrowthExportAudiences(privateSources)).toEqual(["owner"]);
  expect(guestGrowthExportAudiences(teamSources)).toEqual(["owner", "team"]);
  expect(() => freeze(guestGrowthPortfolio(privateSources, scope), "team")).toThrow();
  expect(() => freeze(guestGrowthPortfolio(teamSources, scope), "teacher")).toThrow();
  expect(() => guestGrowthPortfolio([privateSources[0]!, privateSources[0]!], scope)).toThrow();
  expect(() => guestGrowthPortfolio(Array(51).fill(privateSources[0]!), scope)).toThrow();
  const distinct = Array.from({ length: 40 }, (_, i) => {
    const r = records()[4]!;
    return { state: "saved" as const, record: { ...r, id: id(500 + i) } };
  });
  expect(() => guestGrowthPortfolio(distinct, scope)).toThrow();
  const r = records()[0]!;
  expect(
    guestGrowthPortfolio(
      [
        { state: "saved", record: r },
        { state: "saved", record: { ...r, revision: 1 } },
      ],
      scope,
    ).activities,
  ).toHaveLength(2);
});
it("creates actual complete six-kind portfolio and individual PDFs with Unicode and no annotations", async () => {
  const sources: GuestGrowthPdfSource[] = records().map((record) => ({ state: "saved", record })),
    fonts = {
      regular: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Regular.ttf")),
      bold: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Bold.ttf")),
    },
    folder = process.env["GUEST_GROWTH_PDF_QA"];
  if (folder) await mkdir(folder, { recursive: true });
  for (const [name, selected] of [
    ["portfolio", sources],
    ...sources.map((source, i) => [records()[i]!.kind, [source]]),
  ] as Array<[string, GuestGrowthPdfSource[]]>) {
    const snapshot = freeze(
        guestGrowthPortfolio(selected, scope, `Fictional Élodie - ${name}`, time),
      ),
      result = await createActivityPdf(snapshot, { fonts }),
      pdf = await PDFDocument.load(result.bytes);
    expect(result.pageCount).toBeGreaterThan(0);
    expect(pdf.getPages().every((p) => (p.node.Annots()?.size() ?? 0) === 0)).toBe(true);
    if (folder) {
      await writeFile(`${folder}/${name}.pdf`, result.bytes);
      await writeFile(`${folder}/${name}.txt`, exportSnapshotText(snapshot));
    }
  }
});
