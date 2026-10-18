import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityExportSchema,
  freezeActivityExport,
  exportSnapshotText,
} from "@/lib/export/activity";
import {
  submittedSnapshotDocument,
  submissionPreviewDocument,
} from "@/lib/export/submission-adapters";
import type { SubmissionView } from "@/lib/submissions/contracts";
const h = vi.hoisted(() => ({
  own: vi.fn(),
  teacher: vi.fn(),
  authorize: null as null | (() => Promise<void>),
}));
vi.mock("@/lib/submissions.functions", () => ({
  getOwnSubmission: h.own,
  getTeacherSubmission: h.teacher,
}));
vi.mock("@/components/export/ActivityPdfExport", () => ({
  ActivityPdfExport: ({
    authorizeDownload,
    permittedAudiences,
  }: {
    authorizeDownload: () => Promise<void>;
    permittedAudiences: string[];
  }) => {
    h.authorize = authorizeDownload;
    return <p>PDF for {permittedAudiences.join(",")}</p>;
  },
}));
import {
  SubmittedSnapshotExport,
  SubmissionPreviewExport,
} from "@/components/export/SubmittedSnapshotExport";
const id = "c2120000-0000-4000-8000-000000000001";
const view: SubmissionView = {
  id,
  threadId: id,
  classId: id,
  assignmentId: id,
  sourceType: "account_project",
  version: 1,
  audience: "teacher",
  authorLabel: "Learner alias",
  submittedAt: "2026-10-18T12:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: "Fictional check-in",
  payload: {
    schemaVersion: 1,
    title: "Fictional check-in",
    interpretation: "Interpretation, not observation",
    uncertainty: "Not verified",
    decision: "Test",
    nextAction: "Ask about recent behavior",
    excerpts: [
      {
        key: "excerpt.1",
        label: "Selected reported words",
        text: "ONLY_INTENTIONALLY_REVIEWED_TEXT",
        sourceKind: "interview",
        evidenceLabel: "Owner-reported; selected and reviewed",
      },
    ],
  },
};
const preview = {
  id,
  hash: "a".repeat(64),
  threadId: id,
  expiresAt: "2099-10-18T12:10:00Z",
  audience: "teacher" as const,
  teacherVisibleFields: ["title", "excerpts"],
  payload: view.payload,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.authorize = null;
  h.own.mockResolvedValue({ ok: true, data: view });
  h.teacher.mockResolvedValue({ ok: true, data: view });
});
afterEach(cleanup);
describe("selected submission PDF adapter", () => {
  it("retains only approved payload and disclosure/version labels, with generic keys", () => {
    const doc = activityExportSchema.parse(submittedSnapshotDocument(view, "teacher"));
    const snapshot = freezeActivityExport(
      doc,
      {
        audience: "teacher",
        activityKeys: doc.activities.map((a) => a.key),
        sectionKeys: doc.activities.flatMap((a) => a.sections.map((s) => s.key)),
      },
      { allowedAudiences: ["teacher"] },
    );
    const text = exportSnapshotText(snapshot);
    expect(text).toContain("ONLY_INTENTIONALLY_REVIEWED_TEXT");
    expect(text).toContain("Currently authorized class teacher");
    expect(text).toContain("active");
    expect(text).toContain("Not verified");
    expect(text).not.toContain(id);
    expect(JSON.stringify(doc)).not.toContain(id);
    expect(doc.activities[0]?.fictional).toBe(true);
  });
  it("rejects withdrawn recipient copies while preserving the author's withdrawn private copy", () => {
    const withdrawn = { ...view, grantState: "withdrawn" as const, grantRevision: 2 };
    expect(() => submittedSnapshotDocument(withdrawn, "teacher")).toThrow();
    expect(JSON.stringify(submittedSnapshotDocument(withdrawn, "author"))).toContain("withdrawn");
  });
  it("keeps the unsubmitted server preview owner-private and never says it was submitted", () => {
    const doc = activityExportSchema.parse(submissionPreviewDocument(preview));
    expect(doc.activities[0]?.sourceScope).toBe("owner_private");
    expect(doc.activities[0]?.status).toBe("draft");
    expect(JSON.stringify(doc)).not.toContain(id);
    expect(JSON.stringify(doc)).toContain("Draft only — not submitted to teachers");
  });
});
describe("fresh PDF authority", () => {
  it("checks exact teacher scope before opening and again for each download authorization", async () => {
    render(<SubmittedSnapshotExport scopeKey="teacher-a" mode="teacher" view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare authorized submission PDF" }));
    await screen.findByText("PDF for teacher");
    expect(h.teacher).toHaveBeenCalledWith({ data: { classId: id, snapshotId: id } });
    await h.authorize!();
    expect(h.teacher).toHaveBeenCalledTimes(2);
    h.teacher.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
    await expect(h.authorize!()).rejects.toThrow("no longer available");
  });
  it("denies an altered or mismatched snapshot and never exposes the PDF controls", async () => {
    h.teacher.mockResolvedValue({
      ok: true,
      data: { ...view, payload: { ...view.payload, interpretation: "Changed" } },
    });
    render(<SubmittedSnapshotExport scopeKey="teacher-a" mode="teacher" view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare authorized submission PDF" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("PDF for teacher")).toBeNull();
  });
  it("authorizes withdrawn author copies with the own endpoint only", async () => {
    const withdrawn = { ...view, grantState: "withdrawn" as const, grantRevision: 2 };
    h.own.mockResolvedValue({ ok: true, data: withdrawn });
    render(<SubmittedSnapshotExport scopeKey="author-a" mode="author" view={withdrawn} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare authorized submission PDF" }));
    await screen.findByText("PDF for owner");
    expect(h.teacher).not.toHaveBeenCalled();
    await h.authorize!();
    expect(h.own).toHaveBeenCalledTimes(2);
  });
  it("ignores a slow authorization after changing actors", async () => {
    let resolve!: (x: unknown) => void;
    h.teacher.mockReturnValue(new Promise((r) => (resolve = r)));
    const ui = render(<SubmittedSnapshotExport scopeKey="teacher-a" mode="teacher" view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare authorized submission PDF" }));
    ui.rerender(<SubmittedSnapshotExport scopeKey="teacher-b" mode="teacher" view={view} />);
    resolve({ ok: true, data: view });
    await waitFor(() => expect(screen.queryByText("PDF for teacher")).toBeNull());
  });
  it("reauthorizes unsubmitted previews and denies expired ones", async () => {
    const reauthorize = vi.fn().mockResolvedValue(undefined);
    const ui = render(
      <SubmissionPreviewExport scopeKey="author-a" preview={preview} reauthorize={reauthorize} />,
    );
    await h.authorize!();
    expect(reauthorize).toHaveBeenCalledTimes(1);
    ui.rerender(
      <SubmissionPreviewExport
        scopeKey="author-a"
        preview={{ ...preview, expiresAt: "2020-01-01T12:00:00Z" }}
        reauthorize={reauthorize}
      />,
    );
    await expect(h.authorize!()).rejects.toThrow("expired");
    expect(reauthorize).toHaveBeenCalledTimes(1);
  });
});
