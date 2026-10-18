import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  assertFrozenActivityExport,
  displayExportValue,
  exportSnapshotText,
  type FrozenActivityExport,
} from "./activity";

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };
export const PDF_FONT_PATHS = [
  "/fonts/pdf/NotoSans-Regular.ttf",
  "/fonts/pdf/NotoSans-Bold.ttf",
] as const;
/** Only these bundled same-origin resources are fetched. No payload can supply an asset URL. */
export async function loadPdfFonts(): Promise<PdfFonts> {
  const fonts = await Promise.all(
    PDF_FONT_PATHS.map(async (path) => {
      const response = await fetch(path, {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error("The bundled PDF font could not be loaded. Your saved work is unchanged.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 2_000_000) throw new Error("The PDF font exceeded its expected size.");
      return bytes;
    }),
  );
  return { regular: fonts[0]!, bold: fonts[1]! };
}
const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 44,
  BOTTOM = 58;
const CONTENT = WIDTH - 2 * MARGIN;
const INK = rgb(0.12, 0.19, 0.16),
  PINE = rgb(0.1, 0.28, 0.22),
  MUTED = rgb(0.34, 0.39, 0.36);
const PAPER = rgb(0.96, 0.95, 0.91),
  RULE = rgb(0.78, 0.82, 0.78);
const clean = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");

export function wrapPdfText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      if (!word) continue;
      const proposed = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(proposed, size) <= width) {
        line = proposed;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      // Hard-wrap unbroken URLs/hostile text without dropping characters or creating PDF links.
      for (const char of Array.from(word)) {
        const chunk = line + char;
        if (line && font.widthOfTextAtSize(chunk, size) > width) {
          lines.push(line);
          line = char;
        } else line = chunk;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function createActivityPdf(
  snapshot: FrozenActivityExport,
  options: { fonts?: PdfFonts } = {},
) {
  assertFrozenActivityExport(snapshot);
  const bytes = options.fonts ?? (await loadPdfFonts());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(bytes.regular, { subset: true, features: { liga: false } });
  const bold = await pdf.embedFont(bytes.bold, { subset: true, features: { liga: false } });
  const boldCharacters = new Set(bold.getCharacterSet());
  const supported = new Set(regular.getCharacterSet().filter((point) => boldCharacters.has(point)));
  const unsupported = new Set<number>();
  for (const char of clean(exportSnapshotText(snapshot))) {
    const point = char.codePointAt(0)!;
    if (
      char !== "\n" &&
      (!supported.has(point) ||
        point < 32 ||
        point === 127 ||
        /[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(char))
    )
      unsupported.add(point);
  }
  if (unsupported.size) {
    const codes = [...unsupported]
      .slice(0, 8)
      .map((p) => `U+${p.toString(16).toUpperCase().padStart(4, "0")}`)
      .join(", ");
    throw new Error(
      `PDF export cannot render these characters reliably: ${codes}. This version supports Latin, Greek and Cyrillic text, not all scripts or emoji. Redact the affected text or use a reviewed supported alias; the source remains unchanged.`,
    );
  }
  pdf.setTitle("First Ten activity export");
  pdf.setSubject("Selected activity snapshot; audience and draft status appear in the document");
  pdf.setCreator("First Ten");
  pdf.setProducer("First Ten / pdf-lib");
  pdf.setCreationDate(new Date(snapshot.capturedAt));
  pdf.setModificationDate(new Date(snapshot.capturedAt));
  let page: PDFPage,
    y = 0;
  const newPage = () => {
    if (pdf.getPageCount() >= 120)
      throw new Error("This export exceeds 120 pages. Select fewer activities or sections.");
    page = pdf.addPage([WIDTH, HEIGHT]);
    page.drawRectangle({ x: 0, y: HEIGHT - 14, width: WIDTH, height: 14, color: PINE });
    page.drawText("FIRST TEN  /  ACTIVITY PORTFOLIO", {
      x: MARGIN,
      y: HEIGHT - 39,
      size: 8,
      font: bold,
      color: PINE,
    });
    y = HEIGHT - 66;
  };
  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };
  const paragraph = (
    value: string,
    size = 10,
    font = regular,
    color = INK,
    indent = 0,
    gap = 7,
  ) => {
    const lines = wrapPdfText(value, font, size, CONTENT - indent);
    const leading = size * 1.45;
    for (const line of lines) {
      ensure(leading);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color });
      y -= leading;
    }
    y -= gap;
  };
  const table = (columns: string[], rows: string[][]) => {
    const columnWidth = CONTENT / columns.length,
      pad = 6,
      size = 9,
      leading = 13;
    const headingLines = columns.map((s) => wrapPdfText(s, bold, size, columnWidth - 2 * pad));
    const headingHeight = Math.max(...headingLines.map((r) => r.length)) * leading + 2 * pad;
    const drawCells = (cells: string[][], height: number, header: boolean) => {
      page.drawRectangle({
        x: MARGIN,
        y: y - height,
        width: CONTENT,
        height,
        color: header ? PAPER : rgb(1, 1, 1),
        borderColor: RULE,
        borderWidth: 0.5,
      });
      cells.forEach((cell, index) => {
        if (index)
          page.drawLine({
            start: { x: MARGIN + index * columnWidth, y },
            end: { x: MARGIN + index * columnWidth, y: y - height },
            thickness: 0.5,
            color: RULE,
          });
        cell.forEach((line, n) =>
          page.drawText(line, {
            x: MARGIN + index * columnWidth + pad,
            y: y - pad - size - n * leading,
            size,
            font: header ? bold : regular,
            color: INK,
          }),
        );
      });
      y -= height;
    };
    const drawHeading = () => {
      ensure(headingHeight + leading + 2 * pad);
      drawCells(headingLines, headingHeight, true);
    };
    drawHeading();
    for (const row of rows.length
      ? rows
      : [columns.map((_, i) => (i ? "" : "No rows recorded."))]) {
      const lines = row.map((s) => wrapPdfText(s, regular, size, columnWidth - 2 * pad));
      let offset = 0;
      const count = Math.max(...lines.map((r) => r.length));
      // A row longer than a page is continued with the column headings repeated.
      while (offset < count) {
        const available = Math.floor((y - BOTTOM - 2 * pad) / leading);
        if (available < 1) {
          newPage();
          drawHeading();
          continue;
        }
        const take = Math.min(count - offset, available);
        drawCells(
          lines.map((cell) => cell.slice(offset, offset + take)),
          take * leading + 2 * pad,
          false,
        );
        offset += take;
        if (offset < count) {
          newPage();
          drawHeading();
        }
      }
    }
    y -= 12;
  };
  newPage();
  paragraph(snapshot.title, 24, bold, PINE, 0, 12);
  paragraph(`Audience: ${snapshot.audience}  |  Export format v1`, 9, bold, MUTED);
  paragraph(`Frozen snapshot: ${snapshot.capturedAt}`, 9, regular, MUTED);
  if (snapshot.teamLabel) paragraph(`Team alias: ${snapshot.teamLabel}`, 10, bold);
  paragraph(
    "Selected work only. Unknown is not zero. Drafts and fictional examples are labeled. This PDF does not verify claims or grant access to source records.",
    9,
    regular,
    MUTED,
    0,
    16,
  );
  snapshot.activities.forEach((activity, index) => {
    if (index) newPage();
    ensure(90);
    paragraph(activity.title, 18, bold, PINE);
    paragraph(
      `${activity.kind}  |  ${activity.status.toUpperCase()}${activity.fictional ? "  |  FICTIONAL EXAMPLE" : ""}`,
      9,
      bold,
    );
    paragraph(`Updated: ${activity.updatedAt ?? "Not recorded"}`, 8, regular, MUTED, 0, 14);
    for (const section of activity.sections) {
      ensure(54);
      paragraph(section.title, 13, bold, PINE, 0, 9);
      if (!section.blocks.length) paragraph("No content selected.", 10, regular, MUTED);
      for (const block of section.blocks) {
        if (block.type === "text") paragraph(displayExportValue(block.text));
        else if (block.type === "fields") {
          if (!block.fields.length) paragraph("No fields recorded.");
          for (const field of block.fields) {
            ensure(43);
            paragraph(field.label, 9, bold, MUTED, 0, 2);
            paragraph(displayExportValue(field.value), 10, regular, INK, 0, 9);
          }
        } else
          table(
            block.columns,
            block.rows.map((r) => r.map(displayExportValue)),
          );
      }
      y -= 6;
    }
  });
  const pages = pdf.getPages();
  const markers = [
    snapshot.activities.some((a) => a.fictional) ? "Fictional examples included" : "",
    snapshot.activities.some((a) => a.status === "draft") ? "Draft work included" : "",
  ]
    .filter(Boolean)
    .join(" / ");
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: MARGIN, y: 43 },
      end: { x: WIDTH - MARGIN, y: 43 },
      thickness: 0.5,
      color: RULE,
    });
    p.drawText(markers || "Reviewed snapshot / source claims not verified", {
      x: MARGIN,
      y: 29,
      size: 7,
      font: regular,
      color: MUTED,
    });
    const counter = `${index + 1} / ${pages.length}`;
    p.drawText(counter, {
      x: WIDTH - MARGIN - regular.widthOfTextAtSize(counter, 8),
      y: 29,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });
  return {
    bytes: await pdf.save(),
    pageCount: pages.length,
    filename: `first-ten-activities-${snapshot.capturedAt.slice(0, 10)}.pdf`,
  };
}

export function downloadActivityPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } finally {
    // Give the browser time to start the download, then release private bytes from the URL registry.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
