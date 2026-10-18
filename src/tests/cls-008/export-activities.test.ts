import { readFile, writeFile, mkdir } from "node:fs/promises";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  guestLearningActivities,
  guestSubmissionActivities,
} from "@/lib/export/guest-activity-adapters";
import {
  activityExportSchema,
  freezeActivityExport,
  exportSnapshotText,
  type ActivityExportV1,
} from "@/lib/export/activity";
import { createActivityPdf } from "@/lib/export/pdf";
import { guestSubmissionViewSchema } from "@/lib/guest-activities/contracts";
import { guestExportFixture, guestFixtureId as id } from "./export-fixture";
const state = { savedAt: "2026-10-18T20:00:00Z", revision: 3, dirty: true, fictional: true };
function doc() {
  return activityExportSchema.parse({
    schemaVersion: 1,
    title: "Fictional guest learning activities",
    capturedAt: "2026-10-18T20:01:00Z",
    activities: guestLearningActivities(guestExportFixture(), state, "principal_private").map(
      (o) => o.activity,
    ),
  });
}
function freeze(document: ActivityExportV1, audience: "owner" | "team" | "teacher" = "owner") {
  return freezeActivityExport(
    document,
    {
      audience,
      activityKeys: document.activities.map((a) => a.key),
      sectionKeys: document.activities.flatMap((a) => a.sections.map((s) => s.key)),
    },
    { allowedAudiences: [audience] },
  );
}
it("exports every manual activity, preserved version, exact worksheet, context and current private interview without fake account scopes", () => {
  const document = doc(),
    text = exportSnapshotText(freeze(document));
  expect(
    document.activities.every((a) => a.sourceScope === "guest_principal_private" && a.fictional),
  ).toBe(true);
  expect(text).toContain("Current unsaved edits");
  expect(text).toContain("first preserved attempt");
  expect(text).toContain("Pivot after learning");
  expect(text).toContain("Planned conversation 5");
  expect(text).toContain("false negative");
  expect(text).toContain("Question 3: uncertainty / counterexample");
  expect(text).toContain("END_OF_PRIVATE_DRAFT");
  expect(text).toContain("not interview evidence");
  expect(text).toContain("link_not_read");
  expect(text).not.toContain("EXCLUDED_CONTEXT_NEVER_EXPORTED");
  expect(text).not.toContain(id(40));
  expect(() => freeze(document, "team")).toThrow();
  expect(() => freeze(document, "teacher")).toThrow();
});
it("rejects raw interview/quote payloads in a team planning export and allows only private/team planning copies", () => {
  const privateDoc = guestExportFixture();
  expect(() => guestLearningActivities(privateDoc, state, "team_shared")).toThrow("Raw interviews");
  privateDoc.interviews = [];
  privateDoc.discovery.results = [];
  const document = activityExportSchema.parse({
    ...doc(),
    activities: guestLearningActivities(privateDoc, state, "team_shared").map((o) => o.activity),
  });
  expect(document.activities.every((a) => a.sourceScope === "guest_team_shared")).toBe(true);
  expect(() => freeze(document, "team")).not.toThrow();
  expect(() => freeze(document, "teacher")).toThrow();
});
function submission() {
  return guestSubmissionViewSchema.parse({
    id: id(60),
    threadId: id(61),
    classId: id(62),
    assignmentId: id(63),
    sourceType: "guest_team",
    version: 1,
    audience: "team",
    authorLabel: "Fictional learner",
    submittedAt: state.savedAt,
    grantState: "active",
    grantRevision: 1,
    title: "Fictional reviewed copy",
    payload: {
      schemaVersion: 1,
      title: "Fictional reviewed copy",
      interpretation: "Unverified interpretation",
      uncertainty: "Outcome unknown",
      decision: "Try another conversation",
      nextAction: "Observe behavior",
      excerpts: [
        {
          key: "excerpt.1",
          label: "Unicode selected text",
          text: "😀".repeat(6000),
          sourceKind: "discovery",
          evidenceLabel: "Owner-reported; selected and reviewed",
        },
      ],
    },
  });
}
it("uses the genuine code-point guest schema and does not leak source IDs into reviewed-copy exports", () => {
  const s = submission();
  const document = activityExportSchema.parse({
    ...doc(),
    activities: guestSubmissionActivities(s).map((o) => o.activity),
  });
  const text = exportSnapshotText(freeze(document, "team"));
  expect(Array.from(text).filter((c) => c === "😀")).toHaveLength(6000);
  expect(text).not.toContain(s.id);
  expect(document.activities[0]?.sourceScope).toBe("submitted_snapshot");
  expect(() => guestSubmissionActivities({ ...s, grantState: "withdrawn" })).toThrow("withdrawn");
});
it("renders a real Unicode long-draft PDF with all selected content and no PDF annotations", async () => {
  const document = doc();
  const fonts = {
    regular: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Regular.ttf")),
    bold: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Bold.ttf")),
  };
  const result = await createActivityPdf(freeze(document), { fonts });
  const pdf = await PDFDocument.load(result.bytes);
  expect(result.pageCount).toBeGreaterThan(10);
  expect(result.pageCount).toBeLessThan(120);
  expect(pdf.getPages().every((p) => (p.node.Annots()?.size() ?? 0) === 0)).toBe(true);
  if (process.env["GUEST_PDF_QA"]) {
    await mkdir(process.env["GUEST_PDF_QA"], { recursive: true });
    await writeFile(`${process.env["GUEST_PDF_QA"]}/guest-portfolio.pdf`, result.bytes);
    await writeFile(
      `${process.env["GUEST_PDF_QA"]}/guest-portfolio.txt`,
      exportSnapshotText(freeze(document)),
    );
    const one = {
      ...document,
      activities: document.activities.filter((a) => a.key === "guest.interview.0"),
    };
    await writeFile(
      `${process.env["GUEST_PDF_QA"]}/guest-interview.pdf`,
      (await createActivityPdf(freeze(one), { fonts })).bytes,
    );
    const script = {
      ...document,
      activities: document.activities.filter((a) => a.key === "discovery.script.1"),
    };
    await writeFile(
      `${process.env["GUEST_PDF_QA"]}/guest-script.pdf`,
      (await createActivityPdf(freeze(script), { fonts })).bytes,
    );
    const withdrawn = submission();
    withdrawn.grantState = "withdrawn";
    withdrawn.grantRevision = 2;
    withdrawn.payload.excerpts[0]!.text =
      "Fictional reviewed excerpt from Élodie. Not real research.";
    const withdrawnDoc = {
      ...document,
      activities: guestSubmissionActivities(withdrawn, "author").map((o) => o.activity),
    };
    await writeFile(
      `${process.env["GUEST_PDF_QA"]}/guest-withdrawn.pdf`,
      (await createActivityPdf(freeze(withdrawnDoc), { fonts })).bytes,
    );
  }
});
it("allows an explicitly authorized author's private withdrawn-copy PDF without reviving audience access", () => {
  const s = { ...submission(), grantState: "withdrawn" as const, grantRevision: 2 };
  const document = activityExportSchema.parse({
    ...doc(),
    activities: guestSubmissionActivities(s, "author").map((o) => o.activity),
  });
  const text = exportSnapshotText(freeze(document));
  expect(document.activities[0]?.sourceScope).toBe("guest_principal_private");
  expect(document.activities[0]?.fictional).toBe(true);
  expect(text).toContain("Current access state: withdrawn");
  expect(text).toContain("does not restore that access");
  expect(() => freeze(document, "team")).toThrow();
  expect(() => guestSubmissionActivities(s, "team")).toThrow();
  expect(() => guestSubmissionActivities(s, "teacher")).toThrow();
});
