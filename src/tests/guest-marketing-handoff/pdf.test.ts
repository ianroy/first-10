import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  marketingPreviewActivities,
  marketingSubmissionActivities,
} from "@/lib/guest-marketing/handoff/pdf-adapters";
import {
  activityExportSchema,
  freezeActivityExport,
  exportSnapshotText,
  type ActivityExportV1,
} from "@/lib/export/activity";
import { createActivityPdf } from "@/lib/export/pdf";
import { copy, preview } from "./fixture";
function doc(mode: "author" | "teacher" | "preview" = "teacher") {
  return activityExportSchema.parse({
    schemaVersion: 1,
    title: `Fictional Élodie - ${mode} selected marketing copy`,
    capturedAt: copy.submittedAt,
    activities: (mode === "preview"
      ? marketingPreviewActivities(preview)
      : marketingSubmissionActivities(
          mode === "author"
            ? { ...copy, grantState: "withdrawn", grantRevision: 2, recipientEligible: false }
            : copy,
          mode,
        )
    ).map((o) => o.activity),
  });
}
function freeze(d: ActivityExportV1, audience: "owner" | "teacher") {
  return freezeActivityExport(
    d,
    {
      audience,
      activityKeys: d.activities.map((a) => a.key),
      sectionKeys: d.activities.flatMap((a) => a.sections.map((s) => s.key)),
    },
    { allowedAudiences: [audience] },
  );
}
it("exports only reviewed selected material, with authored limits and private withdrawn author scope", () => {
  for (const mode of ["author", "teacher", "preview"] as const) {
    const d = doc(mode),
      snapshot = freeze(d, mode === "teacher" ? "teacher" : "owner"),
      t = exportSnapshotText(snapshot);
    expect(t).toContain("END_OF_SELECTED_COPY");
    expect(t).toContain("not verified customer evidence");
    expect(t).not.toMatch(
      /END_OF_OUTREACH_DRAFT|planRevision|choiceRevision|sessionToken|principalRecovery/,
    );
    expect(d.activities[0]!.sourceScope).toBe(
      mode === "teacher" ? "submitted_snapshot" : "guest_principal_private",
    );
    if (mode !== "teacher") expect(() => freeze(d, "teacher")).toThrow();
  }
  expect(exportSnapshotText(freeze(doc("author"), "owner"))).toContain("withdrawn");
  expect(() =>
    marketingSubmissionActivities({ ...copy, recipientEligible: false }, "teacher"),
  ).toThrow();
});
it("renders actual teacher, withdrawn-author and private-preview PDFs with complete Unicode and no annotations", async () => {
  const fonts = {
      regular: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Regular.ttf")),
      bold: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Bold.ttf")),
    },
    folder = process.env["MARKETING_HANDOFF_PDF_QA"];
  if (folder) await mkdir(folder, { recursive: true });
  for (const mode of ["teacher", "author", "preview"] as const) {
    const frozen = freeze(doc(mode), mode === "teacher" ? "teacher" : "owner"),
      r = await createActivityPdf(frozen, { fonts }),
      pdf = await PDFDocument.load(r.bytes);
    expect(r.pageCount).toBeGreaterThan(0);
    expect(pdf.getPages().every((p) => (p.node.Annots()?.size() ?? 0) === 0)).toBe(true);
    if (folder) {
      await writeFile(`${folder}/${mode}.pdf`, r.bytes);
      await writeFile(`${folder}/${mode}.txt`, exportSnapshotText(frozen));
    }
  }
});
