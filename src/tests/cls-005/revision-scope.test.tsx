import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SubmissionView } from "@/lib/submissions/contracts";
const h = vi.hoisted(() => ({
  own: vi.fn(),
  ownList: vi.fn(),
  teacher: vi.fn(),
  teacherList: vi.fn(),
}));
vi.mock("@/lib/submissions.functions", () => ({
  getOwnSubmission: h.own,
  listMySubmissions: h.ownList,
  getTeacherSubmission: h.teacher,
  listTeacherSubmissions: h.teacherList,
}));
import { SubmissionList } from "@/components/classes/SubmissionList";
const id = "c5050000-0000-4000-8000-000000000001";
const other = "c5050000-0000-4000-8000-000000000002";
const view: SubmissionView = {
  id,
  classId: id,
  assignmentId: id,
  threadId: id,
  version: 1,
  sourceType: "account_project",
  audience: "teacher",
  authorLabel: "My alias",
  submittedAt: "2026-10-18T12:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: "Current assignment copy",
  payload: {
    schemaVersion: 1,
    title: "Current assignment copy",
    interpretation: "",
    uncertainty: "",
    decision: "",
    nextAction: "",
    excerpts: [
      {
        key: "excerpt.1",
        text: "SELECTED_COPY",
        label: "Problem",
        sourceKind: "project",
        evidenceLabel: "Owner-reported; selected and reviewed",
      },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.ownList.mockResolvedValue({
    ok: true,
    data: {
      items: [view, { ...view, id: other, assignmentId: other, title: "Other assignment copy" }],
      nextCursor: null,
    },
  });
  h.teacherList.mockResolvedValue({ ok: true, data: { items: [view], nextCursor: null } });
  h.own.mockResolvedValue({ ok: true, data: view });
  h.teacher.mockResolvedValue({ ok: true, data: view });
});
afterEach(cleanup);
it("offers revision only for the deliberately selected assignment, retaining pagination for other own copies", async () => {
  h.ownList.mockResolvedValue({
    ok: true,
    data: {
      items: [view, { ...view, id: other, assignmentId: other, title: "Other assignment copy" }],
      nextCursor: other,
    },
  });
  const onRevise = vi.fn();
  render(
    <SubmissionList
      scopeKey="owner:project"
      mode="author"
      classId={id}
      assignmentId={id}
      onRevise={onRevise}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
  const revise = await screen.findByRole("button", { name: "Start a new reviewed revision" });
  expect(screen.queryByText("Other assignment copy")).toBeNull();
  expect(screen.getByRole("button", { name: "More submitted versions" })).toBeEnabled();
  fireEvent.click(revise);
  await waitFor(() => expect(onRevise).toHaveBeenCalledWith(view));
  expect(h.own).toHaveBeenCalledTimes(2);
  expect(h.teacher).not.toHaveBeenCalled();
});
it("a fresh author reread that fails or changes assignment cannot start a revision", async () => {
  const onRevise = vi.fn();
  render(
    <SubmissionList
      scopeKey="owner:project"
      mode="author"
      classId={id}
      assignmentId={id}
      onRevise={onRevise}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
  const revise = await screen.findByRole("button", { name: "Start a new reviewed revision" });
  h.own.mockResolvedValueOnce({ ok: true, data: { ...view, assignmentId: other } });
  fireEvent.click(revise);
  await screen.findByText(/does not belong to the selected class assignment/);
  expect(onRevise).not.toHaveBeenCalled();
  expect(screen.queryByText("SELECTED_COPY")).toBeNull();
});
it("teacher presentation never gains an author revision action even if a callback is supplied", async () => {
  const onRevise = vi.fn();
  render(
    <SubmissionList
      scopeKey="teacher:class"
      mode="teacher"
      classId={id}
      assignmentId={id}
      onRevise={onRevise}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open saved version" }));
  await screen.findByText("SELECTED_COPY");
  expect(screen.queryByRole("button", { name: "Start a new reviewed revision" })).toBeNull();
  expect(h.own).not.toHaveBeenCalled();
  expect(onRevise).not.toHaveBeenCalled();
});
