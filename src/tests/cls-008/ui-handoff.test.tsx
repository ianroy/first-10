import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  withdraw: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@/lib/guest-activities/functions", () => ({
  previewGuestSubmission: h.preview,
  confirmGuestSubmission: h.confirm,
  listGuestSubmissions: h.list,
  getGuestSubmission: h.get,
  withdrawGuestSubmission: h.withdraw,
}));
vi.mock("@/components/guest/GuestActivityExport", () => ({
  GuestActivityExport: ({ authorizeDownload }: { authorizeDownload: () => Promise<void> }) => (
    <button
      onClick={() =>
        void authorizeDownload().then(
          () => h.authorize("allowed"),
          () => h.authorize("denied"),
        )
      }
    >
      Test copy PDF authorization
    </button>
  ),
}));
import { GuestReviewedHandoff } from "@/components/guest/GuestReviewedHandoff";
import { guestExportFixture, guestFixtureId as id } from "./export-fixture";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import type { GuestActivityRecord, GuestSubmissionView } from "@/lib/guest-activities/contracts";
const time = "2026-10-18T20:00:00Z",
  csrf = "a".repeat(64),
  changed = vi.fn();
const view: GuestView = {
  classId: id(70),
  className: "Fictional class",
  mode: "class",
  instructions: "",
  accessExpiresAt: "2099-11-18T20:00:00Z",
  retentionDays: 120,
  aiEnabled: false,
  teamId: id(71),
  teamAlias: "Team",
  principalId: id(72),
  principalAlias: "Learner",
  assignments: [
    {
      id: id(73),
      classId: id(70),
      revision: 1,
      updatedAt: time,
      title: "Published test assignment",
      instructions: "",
      dueAt: null,
      state: "published",
    },
  ],
};
function record(): GuestActivityRecord {
  return {
    id: id(74),
    classId: view.classId,
    teamId: view.teamId,
    authorPrincipalId: view.principalId,
    audience: "principal_private",
    revision: 2,
    savedAt: time,
    document: guestExportFixture(),
    aiEnabled: false,
  };
}
const payload = {
  schemaVersion: 1 as const,
  title: "Fictional reviewed reflection",
  interpretation: "An interpretation, not demand",
  uncertainty: "Unknown",
  decision: "Test",
  nextAction: "One conversation",
  excerpts: [
    {
      key: "excerpt.1",
      label: "Problem space",
      text: "Selected exact problem",
      sourceKind: "discovery" as const,
      evidenceLabel: "Owner-reported; selected and reviewed" as const,
    },
  ],
};
const preview = {
  id: id(75),
  hash: "b".repeat(64),
  threadId: id(76),
  expiresAt: "2099-11-18T20:15:00Z",
  audience: "teacher" as const,
  payload,
};
const copy: GuestSubmissionView = {
  id: id(77),
  threadId: id(76),
  classId: view.classId,
  assignmentId: id(73),
  sourceType: "guest_team",
  version: 1,
  audience: "teacher",
  authorLabel: "Fictional learner",
  submittedAt: time,
  grantState: "active",
  grantRevision: 1,
  title: payload.title,
  payload,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.preview.mockResolvedValue({ ok: true, data: preview });
  h.confirm.mockResolvedValue({ ok: true, data: copy });
  h.list.mockResolvedValue({ ok: true, data: { items: [copy], nextCursor: null } });
  h.get.mockResolvedValue({ ok: true, data: copy });
  h.withdraw.mockResolvedValue({
    ok: true,
    data: { ...copy, grantState: "withdrawn", grantRevision: 2 },
  });
});
afterEach(cleanup);
function mount(dirty = false) {
  return render(
    <GuestReviewedHandoff
      view={view}
      csrf={csrf}
      record={record()}
      dirty={dirty}
      onDraftChange={changed}
    />,
  );
}
function fill() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Problem space" }));
  fireEvent.change(screen.getByLabelText("Copy title"), { target: { value: payload.title } });
}
it("requires saved work, exact source selection, server preview and separate audience confirmation", async () => {
  const mounted = mount(true);
  fill();
  expect(screen.getByRole("button", { name: "Prepare exact reviewed copy" })).toBeDisabled();
  mounted.rerender(
    <GuestReviewedHandoff
      view={view}
      csrf={csrf}
      record={record()}
      dirty={false}
      onDraftChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  await screen.findByRole("heading", { name: "Review the exact teacher copy" });
  const input = h.preview.mock.calls[0]![0].data;
  expect(input.selections).toEqual([{ kind: "discovery", recordId: id(74), field: "problem" }]);
  expect(input).not.toHaveProperty("userId");
  expect(input).not.toHaveProperty("projectId");
  expect(
    screen.getByRole("button", { name: "Confirm and submit this reviewed version" }),
  ).toBeDisabled();
  expect(h.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this exact copy/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm and submit this reviewed version" }));
  await waitFor(() => expect(h.confirm).toHaveBeenCalledOnce());
  expect(h.confirm.mock.calls[0]![0].data).toMatchObject({
    csrf,
    previewId: preview.id,
    previewHash: preview.hash,
  });
  expect(h.confirm.mock.calls[0]![0].data).not.toHaveProperty("payload");
});
it("invalidates review when form/source changes and retains confirmation request identity on uncertain retry", async () => {
  mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  await screen.findByRole("heading", { name: "Review the exact teacher copy" });
  fireEvent.change(screen.getByLabelText("Your decision"), { target: { value: "New decision" } });
  expect(
    screen.queryByRole("button", { name: "Confirm and submit this reviewed version" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  await screen.findByRole("heading", { name: "Review the exact teacher copy" });
  h.confirm.mockRejectedValueOnce(new Error("uncertain"));
  fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this exact copy/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm and submit this reviewed version" }));
  await screen.findByText(/operation could not be confirmed/);
  fireEvent.click(screen.getByRole("button", { name: "Confirm and submit this reviewed version" }));
  await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(2));
  expect(h.confirm.mock.calls[1]![0]).toEqual(h.confirm.mock.calls[0]![0]);
});
it("rechecks exact current grant before PDF and author withdrawal never deletes private source work", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Load my submitted copies" }));
  await screen.findByRole("button", { name: "Open reviewed copy" });
  fireEvent.click(screen.getByRole("button", { name: "Open reviewed copy" }));
  await screen.findByRole("button", { name: "Test copy PDF authorization" });
  h.get.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
  fireEvent.click(screen.getByRole("button", { name: "Test copy PDF authorization" }));
  await waitFor(() => expect(h.authorize).toHaveBeenCalledWith("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Withdraw this copy" }));
  expect(h.withdraw).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  await waitFor(() => expect(h.withdraw).toHaveBeenCalledOnce());
  expect(h.withdraw.mock.calls[0]![0].data).toMatchObject({ csrf, snapshotId: copy.id });
  await screen.findByText(/Access to this submitted copy was withdrawn/);
});
it("ignores a late preview if a different activity mounts", async () => {
  let resolve!: (v: unknown) => void;
  h.preview.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const mounted = mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  mounted.unmount();
  mount();
  await act(async () => resolve({ ok: true, data: preview }));
  expect(
    screen.queryByRole("heading", { name: "Review the exact teacher copy" }),
  ).not.toBeInTheDocument();
});
it("retries an unknown preview using the identical request and thread IDs", async () => {
  mount();
  fill();
  h.preview.mockRejectedValueOnce(new Error("network"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  await screen.findByText(/operation could not be confirmed/);
  fireEvent.click(screen.getByRole("button", { name: "Prepare exact reviewed copy" }));
  await screen.findByRole("heading", { name: "Review the exact teacher copy" });
  expect(h.preview).toHaveBeenCalledTimes(2);
  expect(h.preview.mock.calls[1]![0]).toEqual(h.preview.mock.calls[0]![0]);
});
it("lets an active-session author reopen a withdrawn copy privately and fails closed when that read permission ends", async () => {
  const withdrawn = { ...copy, grantState: "withdrawn" as const, grantRevision: 2 };
  h.list.mockResolvedValueOnce({ ok: true, data: { items: [withdrawn], nextCursor: null } });
  h.get.mockResolvedValue({ ok: true, data: withdrawn });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Load my submitted copies" }));
  await screen.findByRole("button", { name: "Open my withdrawn copy" });
  fireEvent.click(screen.getByRole("button", { name: "Open my withdrawn copy" }));
  await screen.findByRole("button", { name: "Test copy PDF authorization" });
  fireEvent.click(screen.getByRole("button", { name: "Test copy PDF authorization" }));
  await waitFor(() => expect(h.authorize).toHaveBeenCalledWith("allowed"));
  expect(h.get.mock.calls.at(-1)![0].data).toMatchObject({ mode: "author", snapshotId: copy.id });
  h.get.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
  fireEvent.click(screen.getByRole("button", { name: "Test copy PDF authorization" }));
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("denied"));
});
