import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  preview: vi.fn(),
  submit: vi.fn(),
  own: vi.fn(),
  teacher: vi.fn(),
  myList: vi.fn(),
  teacherList: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock("@/lib/submissions.functions", () => ({
  previewSubmission: h.preview,
  submitSnapshot: h.submit,
  getOwnSubmission: h.own,
  getTeacherSubmission: h.teacher,
  listMySubmissions: h.myList,
  listTeacherSubmissions: h.teacherList,
  withdrawSubmission: h.withdraw,
}));
import { SubmissionPreview } from "@/components/classes/SubmissionPreview";
import { SubmissionList } from "@/components/classes/SubmissionList";
const id = "c2120000-0000-4000-8000-000000000001",
  other = "c2120000-0000-4000-8000-000000000002";
const payload = {
  schemaVersion: 1 as const,
  title: "Exact server-reviewed title",
  interpretation: "Student interpretation",
  uncertainty: "Unverified",
  decision: "Test",
  nextAction: "Interview",
  excerpts: [
    {
      key: "excerpt.1",
      label: "Selected problem",
      text: "ONLY_APPROVED_EXCERPT",
      sourceKind: "project" as const,
      evidenceLabel: "Owner-reported; selected and reviewed" as const,
    },
  ],
};
const header = {
  id,
  threadId: id,
  classId: id,
  assignmentId: id,
  version: 1,
  sourceType: "account_project",
  audience: "teacher",
  authorLabel: "Learner alias",
  submittedAt: "2026-10-18T12:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: payload.title,
};
const view = { ...header, payload };
const preview = {
  ok: true,
  data: {
    id,
    hash: "a".repeat(64),
    threadId: id,
    expiresAt: "2099-10-18T12:10:00Z",
    audience: "teacher",
    teacherVisibleFields: ["title", "excerpts"],
    payload,
  },
};
const props = {
  scopeKey: "actor-a",
  classId: id,
  assignmentId: id,
  source: { type: "account_project" as const, projectId: id },
  sourceOptions: [
    {
      label: "My saved problem",
      selection: { kind: "project" as const, recordId: id, field: "problem" as const },
    },
  ],
};
const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.clearAllMocks();
  h.preview.mockResolvedValue(preview);
  h.submit.mockResolvedValue({ ok: true, data: view });
  h.myList.mockResolvedValue({ ok: true, data: { items: [header], nextCursor: null } });
  h.teacherList.mockResolvedValue({ ok: true, data: { items: [header], nextCursor: null } });
  h.own.mockResolvedValue({ ok: true, data: view });
  h.teacher.mockResolvedValue({ ok: true, data: view });
  h.withdraw.mockResolvedValue({
    ok: true,
    data: { ...header, grantState: "withdrawn", grantRevision: 2 },
  });
});
afterEach(cleanup);
async function makePreview() {
  fireEvent.click(screen.getByLabelText(/My saved problem/));
  fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
  await screen.findByText("ONLY_APPROVED_EXCERPT");
}
describe("deliberate selected publication", () => {
  it("starts empty, previews actual server payload, and requires separate affirmation", async () => {
    render(<SubmissionPreview {...props} />);
    expect(
      (screen.getByRole("button", { name: "Create exact teacher preview" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await makePreview();
    expect(h.submit).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Submit this reviewed version" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I reviewed this exact version/));
    fireEvent.click(button);
    await waitFor(() => expect(h.submit).toHaveBeenCalledOnce());
    expect(h.submit.mock.calls[0]![0]!.data).toEqual({
      previewId: id,
      previewHash: "a".repeat(64),
      requestId: expect.any(String),
    });
    expect(h.preview.mock.calls[0]![0]!.data.selections).toEqual([
      props.sourceOptions[0]!.selection,
    ]);
  });
  it("edited fields invalidate the displayed preview immediately", async () => {
    render(<SubmissionPreview {...props} />);
    await makePreview();
    fireEvent.change(screen.getByLabelText("Submission title"), {
      target: { value: "New private draft" },
    });
    expect(screen.queryByText("ONLY_APPROVED_EXCERPT")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit this reviewed version" })).toBeNull();
  });
  it("ignores slow preview from another account/class and resets draft selection", async () => {
    const slow = deferred();
    h.preview.mockReturnValueOnce(slow.promise);
    const r = render(<SubmissionPreview {...props} />);
    fireEvent.click(screen.getByLabelText(/My saved problem/));
    fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
    r.rerender(<SubmissionPreview {...props} scopeKey="actor-b" classId={other} />);
    await act(async () => slow.resolve(preview));
    expect(screen.queryByText("ONLY_APPROVED_EXCERPT")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Create exact teacher preview" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("editing during slow preview does not wedge the next review", async () => {
    const slow = deferred();
    h.preview.mockReturnValueOnce(slow.promise);
    render(<SubmissionPreview {...props} />);
    fireEvent.click(screen.getByLabelText(/My saved problem/));
    fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
    fireEvent.change(screen.getByLabelText("Submission title"), {
      target: { value: "Changed during request" },
    });
    await act(async () => slow.resolve(preview));
    expect(screen.queryByText("ONLY_APPROVED_EXCERPT")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Create exact teacher preview" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("keeps guest sources unavailable rather than inventing project work", () => {
    render(<SubmissionPreview {...props} source={{ type: "guest_team", teamId: id }} />);
    expect(
      (screen.getByRole("button", { name: "Create exact teacher preview" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(h.preview).not.toHaveBeenCalled();
  });
});
describe("fresh recipient and author read scopes", () => {
  it("teacher without an authorized class never falls back to author list", async () => {
    render(<SubmissionList scopeKey="a" mode="teacher" />);
    await screen.findByText("Choose an authorized class first.");
    expect(h.myList).not.toHaveBeenCalled();
    expect(h.teacherList).not.toHaveBeenCalled();
  });
  it("slow private read is discarded after scope switch", async () => {
    const slow = deferred();
    h.own.mockReturnValueOnce(slow.promise);
    const r = render(<SubmissionList scopeKey="a" mode="author" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
    h.myList.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
    r.rerender(<SubmissionList scopeKey="b" mode="author" />);
    await act(async () => slow.resolve({ ok: true, data: view }));
    expect(screen.queryByText("ONLY_APPROVED_EXCERPT")).toBeNull();
  });
  it("PDF handoff re-authorizes and clears forbidden cached recipient payload", async () => {
    const onExport = vi.fn();
    render(<SubmissionList scopeKey="teacher" mode="teacher" classId={id} onExport={onExport} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
    await screen.findByText("ONLY_APPROVED_EXCERPT");
    h.teacher.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
    fireEvent.click(screen.getByRole("button", { name: "Review this authorized version for PDF" }));
    await waitFor(() => expect(screen.queryByText("ONLY_APPROVED_EXCERPT")).toBeNull());
    expect(onExport).not.toHaveBeenCalled();
    expect(h.teacher).toHaveBeenCalledTimes(2);
  });
  it("author can withdraw a saved copy without class lookup", async () => {
    render(<SubmissionList scopeKey="author" mode="author" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw recipient access" }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledOnce());
    expect(h.withdraw.mock.calls[0]![0]!.data).toEqual({
      snapshotId: id,
      requestId: expect.any(String),
    });
    expect(h.teacher).not.toHaveBeenCalled();
    expect(h.teacherList).not.toHaveBeenCalled();
  });
});
