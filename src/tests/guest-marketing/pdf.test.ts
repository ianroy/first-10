import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { guestMarketingActivities } from "@/lib/guest-marketing/pdf-adapters";
import {
  activityExportSchema,
  freezeActivityExport,
  exportSnapshotText,
  type ActivityExportV1,
} from "@/lib/export/activity";
import { createActivityPdf } from "@/lib/export/pdf";
import { marketingFixture } from "./fixture";
function document(shared = false) {
  const d = marketingFixture();
  d.content[0]!.body = "Fictional draft. ".repeat(340) + " END_OF_DEMO_DRAFT";
  return activityExportSchema.parse({
    schemaVersion: 1,
    title: "Fictional guest Marketing Lab portfolio",
    capturedAt: "2026-10-18T20:00:00Z",
    activities: guestMarketingActivities(
      d,
      { savedAt: "2026-10-18T19:00:00Z", revision: 3, dirty: true, fictional: true },
      shared ? "team_shared" : "principal_private",
    ).map((o) => o.activity),
  });
}
function freeze(doc: ActivityExportV1, audience: "owner" | "team" | "teacher" = "owner") {
  return freezeActivityExport(
    doc,
    {
      audience,
      activityKeys: doc.activities.map((a) => a.key),
      sectionKeys: doc.activities.flatMap((a) => a.sections.map((s) => s.key)),
    },
    { allowedAudiences: [audience] },
  );
}
it("covers each activity individually and preserves every draft, scope and unknown label", () => {
  const d = document(),
    text = exportSnapshotText(freeze(d));
  expect(d.activities.map((a) => a.key)).toEqual([
    "guest.marketing.thinking",
    "guest.marketing.audience",
    "guest.marketing.channel.0",
    "guest.marketing.content.0",
    "guest.marketing.outreach.0",
    "guest.marketing.test",
    "guest.marketing.task.0",
    "guest.marketing.measurement.0",
    "guest.marketing.reflection",
  ]);
  expect(
    d.activities.every((a) => a.sourceScope === "guest_principal_private" && a.fictional),
  ).toBe(true);
  expect(text).toContain("END_OF_DEMO_DRAFT");
  expect(text).toContain("END_OF_OUTREACH_DRAFT");
  expect(text).toContain("Current unsaved edits");
  expect(text).toContain("Fictional Élodie");
  expect(text).toContain("No real test performed");
  expect(text).not.toMatch(/fc230000|project_id|principalRecovery/);
});
it("allows team scope only for explicitly team-shared plans and never teacher scope", () => {
  expect(() => freeze(document(), "team")).toThrow();
  expect(() => freeze(document(true), "teacher")).toThrow();
  expect(exportSnapshotText(freeze(document(true), "team"))).toContain("$0 test plan");
});
it("renders actual portfolio, demo and outreach PDFs with complete final text and no annotations", async () => {
  const doc = document(),
    fonts = {
      regular: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Regular.ttf")),
      bold: new Uint8Array(await readFile("public/fonts/pdf/NotoSans-Bold.ttf")),
    };
  const result = await createActivityPdf(freeze(doc), { fonts });
  const pdf = await PDFDocument.load(result.bytes);
  expect(result.pageCount).toBeGreaterThan(7);
  expect(pdf.getPages().every((p) => (p.node.Annots()?.size() ?? 0) === 0)).toBe(true);
  const path = process.env["GUEST_MARKETING_PDF_QA"];
  if (path) {
    await mkdir(path, { recursive: true });
    await writeFile(`${path}/marketing-portfolio.pdf`, result.bytes);
    await writeFile(`${path}/marketing-portfolio.txt`, exportSnapshotText(freeze(doc)));
    for (const [name, key] of [
      ["marketing-demo", "guest.marketing.content.0"],
      ["marketing-outreach", "guest.marketing.outreach.0"],
    ]) {
      const one = { ...doc, activities: doc.activities.filter((a) => a.key === key) };
      await writeFile(
        `${path}/${name}.pdf`,
        (await createActivityPdf(freeze(one), { fonts })).bytes,
      );
    }
  }
});
