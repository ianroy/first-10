import { describe, expect, it } from "vitest";
import {
  activityExportSchema,
  exportSnapshotText,
  freezeActivityExport,
  type ExportAudience,
} from "@/lib/export/activity";
import { exportFixture } from "./fixture";

const select = (audience: ExportAudience = "owner") => ({
  audience,
  activityKeys: ["interview", "marketing"],
  sectionKeys: ["observations", "plan"],
});
describe("strict, frozen activity export scope", () => {
  it("keeps genuine guest private and team work distinct from submitted teacher copies", () => {
    const doc = exportFixture();
    doc.activities[0]!.sourceScope = "guest_principal_private";
    doc.activities[1]!.sourceScope = "guest_team_shared";
    expect(
      freezeActivityExport(doc, select(), { allowedAudiences: ["owner"] }).activities,
    ).toHaveLength(2);
    expect(() => freezeActivityExport(doc, select("team"), { allowedAudiences: ["team"] })).toThrow(
      "Private source",
    );
    const teamSelection = { ...select("team"), activityKeys: ["marketing"] };
    expect(
      freezeActivityExport(doc, teamSelection, { allowedAudiences: ["team"] }).activities[0]!
        .sourceScope,
    ).toBe("guest_team_shared");
    for (const audience of ["teacher", "external"] as const)
      expect(() =>
        freezeActivityExport(doc, { ...teamSelection, audience }, { allowedAudiences: [audience] }),
      ).toThrow("Private source");
  });
  it("rejects accidental account metadata, duplicate selectors and malformed tables", () => {
    expect(
      activityExportSchema.safeParse({ ...exportFixture(), email: "private@example.test" }).success,
    ).toBe(false);
    const doc = exportFixture();
    doc.activities[1]!.key = "interview";
    expect(activityExportSchema.safeParse(doc).success).toBe(false);
    const malformed = exportFixture();
    malformed.activities[1]!.sections[0]!.blocks = [
      { key: "bad", type: "table", columns: ["One"], rows: [[1, 2]] },
    ];
    expect(activityExportSchema.safeParse(malformed).success).toBe(false);
  });
  it("requires both an allowed audience and a submitted/fictional source for non-owner copies", () => {
    const doc = exportFixture();
    doc.activities[0]!.sourceScope = "owner_private";
    expect(() =>
      freezeActivityExport(doc, select("teacher"), { allowedAudiences: ["owner"] }),
    ).toThrow("not permitted");
    for (const audience of ["teacher", "team", "external"] as const)
      expect(() =>
        freezeActivityExport(doc, select(audience), { allowedAudiences: [audience] }),
      ).toThrow("Private source");
    const permitted = freezeActivityExport(
      doc,
      { ...select("teacher"), activityKeys: ["marketing"] },
      { allowedAudiences: ["teacher"] },
    );
    expect(permitted.activities.map((a) => a.key)).toEqual(["marketing"]);
    expect(exportSnapshotText(permitted)).not.toContain("missed meeting");
  });
  it("copies, deeply freezes and redacts content without mutating its source", () => {
    const doc = exportFixture();
    const block = doc.activities[0]!.sections[0]!.blocks[0]!;
    if (block.type !== "text") throw new Error("fixture");
    block.text += " Email private@example.test. ID f2000000-0000-4000-8000-000000000001.";
    const snapshot = freezeActivityExport(
      doc,
      { ...select(), redactions: ["Élodie"], excludedBlockKeys: ["evidence"] },
      { allowedAudiences: ["owner"] },
    );
    const output = exportSnapshotText(snapshot);
    expect(output).not.toContain("private@example.test");
    expect(output).not.toContain("f2000000");
    expect(output).not.toContain("Élodie");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("Team alias");
    expect(output).not.toContain("Two reported missed meetings");
    expect(block.text).toContain("private@example.test");
    block.text = "Source changed after preview";
    expect(exportSnapshotText(snapshot)).not.toContain(block.text);
    expect(() => snapshot.activities.push(doc.activities[0]!)).toThrow();
    expect(() => exportSnapshotText(JSON.parse(JSON.stringify(snapshot)))).toThrow("frozen");
  });
  it("keeps unknown, blank, zero, false, dates and fictional/draft labels distinct", () => {
    const result = exportSnapshotText(
      freezeActivityExport(exportFixture(), select(), { allowedAudiences: ["owner"] }),
    );
    expect(result).toContain("Attendance baseline: Unknown / not recorded");
    expect(result).toContain("Confirmed trials: 0");
    expect(result).toContain("Next observation: Not entered");
    expect(result).toContain("Reviewed by a peer: No");
    expect(result).toContain("DRAFT | FICTIONAL EXAMPLE");
    expect(result).toContain("Updated: Not recorded");
    expect(result).toContain("Format version 1");
  });
  it("rejects stale selectors and empty selections", () => {
    expect(() =>
      freezeActivityExport(
        exportFixture(),
        { ...select(), activityKeys: ["foreign"] },
        { allowedAudiences: ["owner"] },
      ),
    ).toThrow("selection");
    expect(() =>
      freezeActivityExport(
        exportFixture(),
        { ...select(), sectionKeys: [] },
        { allowedAudiences: ["owner"] },
      ),
    ).toThrow("at least one");
  });
  it("redacts whole phrases containing an email before automatic identifier masking", () => {
    const doc = exportFixture();
    doc.activities[0]!.sections[0]!.blocks = [
      { key: "personal", type: "text", text: "Jane private@example.test agreed to talk." },
    ];
    const result = exportSnapshotText(
      freezeActivityExport(
        doc,
        { ...select(), redactions: ["Jane private@example.test"] },
        { allowedAudiences: ["owner"] },
      ),
    );
    expect(result).toContain("[Redacted] agreed to talk.");
    expect(result).not.toContain("Jane");
  });
});
