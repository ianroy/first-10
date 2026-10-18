import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GuestSubmissionView } from "@/lib/guest-activities/contracts";
const h = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), authorized: vi.fn() }));
vi.mock("@/lib/guest-activities/teacher.functions", () => ({
  listTeacherGuestSubmissions: h.list,
  getTeacherGuestSubmission: h.get,
}));
vi.mock("@/components/export/ActivityPdfExport", () => ({
  ActivityPdfExport: ({ authorizeDownload }: { authorizeDownload: () => Promise<void> }) => (
    <button
      onClick={() =>
        void authorizeDownload().then(
          () => h.authorized("allowed"),
          () => h.authorized("denied"),
        )
      }
    >
      Check teacher PDF access
    </button>
  ),
}));
import { TeacherGuestSubmissions } from "@/components/classes/TeacherGuestSubmissions";
import { guestFixtureId as id } from "./export-fixture";
const copy: GuestSubmissionView = {
  id: id(77),
  threadId: id(76),
  classId: id(70),
  assignmentId: id(73),
  sourceType: "guest_team",
  version: 1,
  audience: "teacher",
  authorLabel: "Fictional learner",
  submittedAt: "2026-10-18T20:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: "Selected reflection",
  payload: {
    schemaVersion: 1,
    title: "Selected reflection",
    interpretation: "One report, not demand",
    uncertainty: "Unknown",
    decision: "Test",
    nextAction: "One conversation",
    excerpts: [
      {
        key: "excerpt.1",
        label: "Problem",
        text: "Selected problem only",
        sourceKind: "discovery",
        evidenceLabel: "Owner-reported; selected and reviewed",
      },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.list.mockResolvedValue({ ok: true, data: { items: [copy], nextCursor: null } });
  h.get.mockResolvedValue({ ok: true, data: copy });
});
afterEach(cleanup);
it("acquires only the selected reviewed teacher copy and rechecks access for every PDF", async () => {
  render(<TeacherGuestSubmissions userId="teacher" classId={copy.classId} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open reviewed version" }));
  const pdf = await screen.findByRole("button", { name: "Check teacher PDF access" });
  expect(h.get).toHaveBeenCalledWith({ data: { classId: copy.classId, snapshotId: copy.id } });
  h.get.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  fireEvent.click(pdf);
  await waitFor(() => expect(h.authorized).toHaveBeenLastCalledWith("denied"));
  h.get.mockResolvedValue({ ok: true, data: { ...copy, grantRevision: 2 } });
  fireEvent.click(pdf);
  await waitFor(() => expect(h.authorized).toHaveBeenCalledTimes(2));
  expect(h.authorized).toHaveBeenLastCalledWith("denied");
  h.get.mockResolvedValue({ ok: true, data: copy });
  fireEvent.click(pdf);
  await waitFor(() => expect(h.authorized).toHaveBeenLastCalledWith("allowed"));
});
it("discards a late prior-class response after selection changes", async () => {
  let release: (value: unknown) => void = () => {};
  h.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const mounted = render(<TeacherGuestSubmissions userId="teacher" classId={copy.classId} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open reviewed version" }));
  h.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  mounted.rerender(<TeacherGuestSubmissions userId="teacher" classId={id(90)} />);
  await screen.findByText("No currently authorized guest submissions.");
  await act(async () => release({ ok: true, data: copy }));
  expect(screen.queryByRole("button", { name: "Check teacher PDF access" })).toBeNull();
  expect(screen.queryByText(copy.title)).toBeNull();
});
it("recovers from rejected transport calls without leaving stale copies or a busy panel", async () => {
  h.list.mockRejectedValueOnce(new Error("offline"));
  render(<TeacherGuestSubmissions userId="teacher" classId={copy.classId} />);
  await screen.findByRole("alert");
  const refresh = screen.getByRole("button", { name: "Refresh guest versions" });
  expect(refresh).toBeEnabled();
  fireEvent.click(refresh);
  fireEvent.click(await screen.findByRole("button", { name: "Open reviewed version" }));
  await screen.findByRole("button", { name: "Check teacher PDF access" });
  h.list.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(refresh);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Check teacher PDF access" })).toBeNull();
  expect(refresh).toBeEnabled();
});
