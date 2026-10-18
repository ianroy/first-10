import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { interviewDraftActivities } from "@/lib/export/interview-draft-adapters";
import { createActivityPdf } from "@/lib/export/pdf";
import { frozen, textOf } from "../exp-002/fixtures";
import { draftRecord, project } from "./fixtures";
describe("current and resumed incomplete interview PDF", () => {
  it("preserves exact Unicode questions, choices, empties and unsaved observations without contact identity", () => {
    const d = draftRecord();
    d.document!.answers[0]!.note = "Current note from Élodie";
    d.document!.answers[1]!.quote = "Exact reported words";
    const offers = interviewDraftActivities(project, [d], true),
      text = textOf(offers);
    expect(frozen(offers).activities).toHaveLength(1);
    expect(text).toContain(d.questions[0]);
    expect(text).toContain("Current note from Élodie");
    expect(text).toContain("Exact reported words");
    expect(text).toContain("unknown");
    expect(text).toContain("Not entered");
    expect(text).toContain("not a completed interview");
    expect(text).toContain("Current unsaved edits");
    expect(text).not.toContain(d.contactId!);
    expect(text).not.toContain(project.user_id);
    expect(offers[0]!.activity).toMatchObject({
      fictional: true,
      sourceScope: "owner_private",
      updatedAt: null,
    });
    expect(d.document!.answers[0]!.note).toBe("Current note from Élodie");
  });
  it("rejects mismatched projects and excludes terminal receipts, keeping separate draft identifiers", () => {
    const d = draftRecord();
    expect(() => interviewDraftActivities({ ...project, id: "other" }, [d])).toThrow(
      "another project",
    );
    const completed = {
      ...d,
      status: "completed" as const,
      document: null,
      completedAt: d.savedAt,
      interviewId: d.id,
    };
    const offers = interviewDraftActivities(project, [
      d,
      { ...d, id: "c1640000-0000-4000-8000-000000000006" },
      completed,
    ]);
    expect(new Set(offers.map((o) => o.activity.key)).size).toBe(2);
    expect(frozen(offers).activities).toHaveLength(2);
  });
  it("generates inert actual PDF bytes with all long notes retained; no network is used", async () => {
    const d = draftRecord();
    d.document!.answers[0]!.note =
      "Élodie décrit une expérience. ".repeat(160) + "END_OF_LONG_OBSERVATION";
    d.document!.answers[1]!.note =
      '<script>alert("inert")</script> https://example.invalid/private?token=fictional';
    const offers = interviewDraftActivities(project, [d], true),
      fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const pdf = await createActivityPdf(frozen(offers), {
        fonts: {
          regular: new Uint8Array(readFileSync("public/fonts/pdf/NotoSans-Regular.ttf")),
          bold: new Uint8Array(readFileSync("public/fonts/pdf/NotoSans-Bold.ttf")),
        },
      });
      expect(pdf.pageCount).toBeGreaterThan(2);
      expect(pdf.pageCount).toBeLessThan(10);
      const parsed = await PDFDocument.load(pdf.bytes);
      expect(parsed.getPageCount()).toBe(pdf.pageCount);
      expect(parsed.getPages().every((p) => (p.node.Annots()?.size() ?? 0) === 0)).toBe(true);
      expect(fetcher).not.toHaveBeenCalled();
      // Optional visual-QA artifact only; regular test execution does not write files.
      if (process.env["WS004_PDF_OUTPUT"])
        writeFileSync(process.env["WS004_PDF_OUTPUT"], pdf.bytes);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
