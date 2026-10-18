import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freezeActivityExport } from "@/lib/export/activity";
import { createActivityPdf, loadPdfFonts, PDF_FONT_PATHS } from "@/lib/export/pdf";
import { exportFixture } from "./fixture";

const fonts = {
  regular: new Uint8Array(readFileSync("public/fonts/pdf/NotoSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/pdf/NotoSans-Bold.ttf")),
};
const snapshot = (doc = exportFixture()) =>
  freezeActivityExport(
    doc,
    {
      audience: "owner",
      activityKeys: doc.activities.map((a) => a.key),
      sectionKeys: doc.activities.flatMap((a) => a.sections.map((s) => s.key)),
      includeTeamLabel: true,
    },
    { allowedAudiences: ["owner"] },
  );
afterEach(() => vi.unstubAllGlobals());
describe("actual PDF rendering", () => {
  it("makes a parseable PDF with supported Unicode, frozen dates and no active links/scripts", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const doc = exportFixture();
    doc.activities[0]!.sections[0]!.blocks.push({
      key: "hostile",
      type: "text",
      text: '<script>alert("x")</script> https://evil.example/?secret=fictional',
    });
    const result = await createActivityPdf(snapshot(doc), { fonts });
    expect(new TextDecoder().decode(result.bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(result.pageCount);
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(loaded.getTitle()).toBe("First Ten activity export");
    expect(loaded.getAuthor()).toBeUndefined();
    expect(loaded.getCreationDate()?.toISOString()).toBe(doc.capturedAt);
    expect(loaded.getPages().every((page) => (page.node.Annots()?.size() ?? 0) === 0)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("paginates long paragraphs, unbroken text and table rows instead of clipping or losing pages", async () => {
    const doc = exportFixture();
    doc.activities[0]!.sections[0]!.blocks.push(
      { key: "long", type: "text", text: "A".repeat(5000) },
      {
        key: "long-table",
        type: "table",
        columns: ["Long observation", "Counterexample", "Next step"],
        rows: [
          [
            "Long fictional observation. ".repeat(250),
            "Keep disagreement visible. ".repeat(180),
            "Reflect. ".repeat(200),
          ],
        ],
      },
    );
    const result = await createActivityPdf(snapshot(doc), { fonts });
    expect(result.pageCount).toBeGreaterThan(5);
    expect(result.pageCount).toBeLessThan(30);
    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(result.pageCount);
  });
  it.each(["中文", "مرحبا", "😀", "hidden\u202Etext"])(
    "fails visibly for unsupported or directional-control text: %s",
    async (value) => {
      const doc = exportFixture();
      doc.title = value;
      await expect(createActivityPdf(snapshot(doc), { fonts })).rejects.toThrow("cannot render");
    },
  );
  it("fetches only fixed same-origin font assets with no credential or redirect forwarding", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => fonts.regular.buffer });
    vi.stubGlobal("fetch", fetcher);
    await loadPdfFonts();
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(PDF_FONT_PATHS);
    expect(
      fetcher.mock.calls.every(
        (call) => call[1].credentials === "omit" && call[1].redirect === "error",
      ),
    ).toBe(true);
  });
});
