import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  choice: vi.fn(),
  saveChoice: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  withdraw: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@/lib/guest-marketing/handoff/functions", () => ({
  readMarketingChoice: h.choice,
  saveMarketingChoice: h.saveChoice,
  previewMarketingSubmission: h.preview,
  confirmMarketingSubmission: h.confirm,
  listMarketingSubmissions: h.list,
  getMarketingSubmission: h.get,
  withdrawMarketingSubmission: h.withdraw,
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
      Check private marketing PDF
    </button>
  ),
}));
import { ReviewedMarketingHandoff } from "@/components/guest-marketing/ReviewedMarketingHandoff";
import { view, csrf, record, preview, copy, id } from "./fixture";
const changed = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  h.choice.mockResolvedValue({
    ok: true,
    data: { planId: record.id, choice: "granted", revision: 1 },
  });
  h.saveChoice.mockResolvedValue({
    ok: true,
    data: { planId: record.id, choice: "granted", revision: 1 },
  });
  h.preview.mockResolvedValue({ ok: true, data: preview });
  h.confirm.mockResolvedValue({ ok: true, data: copy });
  h.list.mockResolvedValue({ ok: true, data: { items: [copy], nextCursor: null } });
  h.get.mockResolvedValue({ ok: true, data: copy });
  h.withdraw.mockResolvedValue({
    ok: true,
    data: { ...copy, grantState: "withdrawn", grantRevision: 2, recipientEligible: false },
  });
});
afterEach(cleanup);
function mount(dirty = false) {
  return render(
    <ReviewedMarketingHandoff
      view={view}
      csrf={csrf}
      record={record}
      dirty={dirty}
      onDraftChange={changed}
    />,
  );
}
async function prepare() {
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("Audience"));
  fireEvent.change(screen.getByLabelText("Submission title"), {
    target: { value: "Review my test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected marketing copy" }));
  await screen.findByText("Private preview — teacher has no access yet");
}
it("requires saved plan and separate reviewed-copy confirmation, transmitting only selectors", async () => {
  mount();
  await prepare();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(h.preview.mock.calls[0]![0].data).toMatchObject({
    planId: record.id,
    expectedPlanRevision: 2,
    selections: [{ kind: "audience", recordId: record.id }],
  });
  expect(h.preview.mock.calls[0]![0].data).not.toHaveProperty("document");
  const submit = screen.getByRole("button", { name: "Submit this exact teacher copy" });
  expect(submit).toBeDisabled();
  fireEvent.click(
    screen.getByLabelText(
      "I reviewed this exact copy and grant current class teachers access to it.",
    ),
  );
  fireEvent.click(submit);
  await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
  expect(h.confirm.mock.calls[0]![0].data.selectedCopyConfirmed).toBe(true);
  await screen.findByText(/Exact selected copy submitted/);
});
it("retains exact uncertain preview intent and blocks stale plan confirmations", async () => {
  h.preview.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  const m = mount();
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("Audience"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Review" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected marketing copy" }));
  await screen.findByRole("button", { name: "Retry exact marketing preview" });
  fireEvent.click(screen.getByRole("button", { name: "Retry exact marketing preview" }));
  await screen.findByText("Private preview — teacher has no access yet");
  expect(h.preview.mock.calls[1]![0]).toEqual(h.preview.mock.calls[0]![0]);
  m.rerender(
    <ReviewedMarketingHandoff
      view={view}
      csrf={csrf}
      record={{ ...record, revision: 3 }}
      dirty={false}
      onDraftChange={changed}
    />,
  );
  expect(screen.queryByRole("button", { name: "Submit this exact teacher copy" })).toBeNull();
  expect(h.confirm).not.toHaveBeenCalled();
});
it("ignores late previous-principal responses and keeps new scope clean", async () => {
  let release!: (v: unknown) => void;
  h.preview.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const m = mount();
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("Audience"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Old scope" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected marketing copy" }));
  m.rerender(
    <ReviewedMarketingHandoff
      view={{ ...view, principalId: id(99) }}
      csrf={csrf}
      record={null}
      dirty={false}
      onDraftChange={changed}
    />,
  );
  await act(async () => release({ ok: true, data: preview }));
  expect(screen.queryByText("Private preview — teacher has no access yet")).toBeNull();
  expect(screen.queryByDisplayValue("Old scope")).toBeNull();
});
it("rechecks private author PDF and retains withdrawn copies without restoring teacher access", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Refresh my marketing copies" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open my marketing copy" }));
  const pdf = await screen.findByRole("button", { name: "Check private marketing PDF" });
  h.get.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  fireEvent.click(pdf);
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Withdraw this teacher copy" }));
  await screen.findByText(/Teacher access withdrawn/);
  h.get.mockResolvedValue({
    ok: true,
    data: { ...copy, grantState: "withdrawn", grantRevision: 2, recipientEligible: false },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my marketing copy" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check private marketing PDF" }));
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("allowed"));
});
it("does not allow unsaved plan edits to be previewed and reports draft/busy state", async () => {
  mount(true);
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("Audience"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Not saved" } });
  expect(screen.getByRole("button", { name: "Preview selected marketing copy" })).toBeDisabled();
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(h.preview).not.toHaveBeenCalled();
});
