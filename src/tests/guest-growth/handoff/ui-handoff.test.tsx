import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  choice: vi.fn(),
  roster: vi.fn(),
  saveChoice: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  withdraw: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@/lib/guest-growth/handoff/functions", () => ({
  readGrowthChoice: h.choice,
  getGrowthHandoffSources: h.roster,
  saveGrowthChoice: h.saveChoice,
  previewGrowthSubmission: h.preview,
  confirmGrowthSubmission: h.confirm,
  listGrowthSubmissions: h.list,
  getGrowthSubmission: h.get,
  withdrawGrowthSubmission: h.withdraw,
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
      Check private growth PDF
    </button>
  ),
}));
import { ReviewedGrowthHandoff } from "@/components/guest-growth/ReviewedGrowthHandoff";
import { view, csrf, record, preview, copy, id, roster } from "./fixture";
const changed = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  h.choice.mockResolvedValue({
    ok: true,
    data: { sourceKind: "guest_growth", artifactId: record.id, choice: "granted", revision: 1 },
  });
  h.saveChoice.mockResolvedValue({
    ok: true,
    data: { sourceKind: "guest_growth", artifactId: record.id, choice: "granted", revision: 1 },
  });
  h.roster.mockResolvedValue({ ok: true, data: roster });
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
    <ReviewedGrowthHandoff
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
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Submission title"), {
    target: { value: "Review my test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected growth copy" }));
  await screen.findByText("Private preview — teacher has no access yet");
}
it("requires saved artifact and separate reviewed-copy confirmation, transmitting only selectors", async () => {
  mount();
  await prepare();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(h.preview.mock.calls[0]![0].data).toMatchObject({
    artifactId: record.id,
    expectedRevision: 2,
    selections: [{ kind: "learning", section: "observations" }],
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
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Review" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected growth copy" }));
  await screen.findByRole("button", { name: "Retry exact growth preview" });
  fireEvent.click(screen.getByRole("button", { name: "Retry exact growth preview" }));
  await screen.findByText("Private preview — teacher has no access yet");
  expect(h.preview.mock.calls[1]![0]).toEqual(h.preview.mock.calls[0]![0]);
  m.rerender(
    <ReviewedGrowthHandoff
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
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Old scope" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected growth copy" }));
  m.rerender(
    <ReviewedGrowthHandoff
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
  fireEvent.click(screen.getByRole("button", { name: "Refresh my growth copies" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open my growth copy" }));
  const pdf = await screen.findByRole("button", { name: "Check private growth PDF" });
  h.get.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  fireEvent.click(pdf);
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Withdraw this teacher copy" }));
  await screen.findByText(/Teacher access withdrawn/);
  h.get.mockResolvedValue({
    ok: true,
    data: { ...copy, grantState: "withdrawn", grantRevision: 2, recipientEligible: false },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my growth copy" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check private growth PDF" }));
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("allowed"));
});
it("does not allow unsaved artifact edits to be previewed and reports draft/busy state", async () => {
  mount(true);
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "Not saved" } });
  expect(screen.getByRole("button", { name: "Preview selected growth copy" })).toBeDisabled();
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(h.preview).not.toHaveBeenCalled();
});
it("retains edited optional excerpts in the dirty guard after deselecting their section", async () => {
  mount();
  await screen.findByText("granted");
  await screen.findByRole("option", { name: /learning.*granted/ });
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Optional exact excerpt — observations"), {
    target: { value: "My retained excerpt" },
  });
  fireEvent.click(screen.getByLabelText("observations"));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByLabelText("observations"));
  expect(screen.getByLabelText("Optional exact excerpt — observations")).toHaveValue(
    "My retained excerpt",
  );
});
it("keeps a handoff draft while an ordinary saved source revision changes", async () => {
  const mounted = mount();
  await screen.findByText("granted");
  fireEvent.change(screen.getByLabelText("Submission title"), {
    target: { value: "Preserve my interpretation" },
  });
  mounted.rerender(
    <ReviewedGrowthHandoff
      view={view}
      csrf={csrf}
      record={{ ...record, revision: 3 }}
      dirty={false}
      onDraftChange={changed}
    />,
  );
  expect(screen.getByLabelText("Submission title")).toHaveValue("Preserve my interpretation");
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(true));
});

it("withdraws with a fresh revision after an uncertain grant instead of replaying it", async () => {
  h.saveChoice.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  mount();
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText(/I may submit selected authored/));
  fireEvent.click(screen.getByRole("button", { name: "Save reported sharing eligibility" }));
  await screen.findByRole("button", { name: "Retry exact reported choice" });
  h.choice.mockResolvedValueOnce({
    ok: true,
    data: { sourceKind: "guest_growth", artifactId: record.id, choice: "granted", revision: 4 },
  });
  h.saveChoice.mockResolvedValueOnce({
    ok: true,
    data: { sourceKind: "guest_growth", artifactId: record.id, choice: "withdrawn", revision: 5 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Withdraw reported sharing choice" }));
  await screen.findByText(/Reported sharing choice withdrawn/);
  expect(h.saveChoice.mock.calls[1]![0].data).toMatchObject({
    artifactId: record.id,
    choice: "withdrawn",
    expectedRevision: 4,
  });
  expect(h.saveChoice.mock.calls[1]![0].data.requestId).not.toBe(
    h.saveChoice.mock.calls[0]![0].data.requestId,
  );
  expect(screen.queryByRole("button", { name: "Retry exact reported choice" })).toBeNull();
});
it("retries an unknown withdrawal with the same operation identity and blocks grants", async () => {
  mount();
  await screen.findByText("granted");
  h.saveChoice.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  fireEvent.click(screen.getByRole("button", { name: "Withdraw reported sharing choice" }));
  const retry = await screen.findByRole("button", { name: /Retry exact sharing withdrawal/ });
  const reads = h.choice.mock.calls.length;
  fireEvent.click(screen.getByLabelText(/I may submit selected authored/));
  expect(screen.getByRole("button", { name: "Save reported sharing eligibility" })).toBeDisabled();
  h.saveChoice.mockResolvedValueOnce({
    ok: true,
    data: { sourceKind: "guest_growth", artifactId: record.id, choice: "withdrawn", revision: 2 },
  });
  fireEvent.click(retry);
  await screen.findByText(/Reported sharing choice withdrawn/);
  expect(h.saveChoice.mock.calls[1]![0]).toEqual(h.saveChoice.mock.calls[0]![0]);
  expect(h.choice).toHaveBeenCalledTimes(reads);
});
it("refreshes source choices and discards an unknown private preview without dropping form edits", async () => {
  h.preview.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  mount();
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText("observations"));
  fireEvent.change(screen.getByLabelText("Submission title"), {
    target: { value: "Keep this draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview selected growth copy" }));
  await screen.findByRole("button", { name: "Discard unconfirmed private preview" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh source choices" }));
  await screen.findByText(/Source choices refreshed/);
  expect(screen.getByLabelText("Submission title")).toHaveValue("Keep this draft");
  fireEvent.click(screen.getByRole("button", { name: "Discard unconfirmed private preview" }));
  await screen.findByText(/Private preview discarded/);
  expect(screen.getByLabelText("Submission title")).toHaveValue("Keep this draft");
  expect(h.confirm).not.toHaveBeenCalled();
});
it("does not claim restored teacher access when an exact submission retry recovers an ineligible copy", async () => {
  h.confirm.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  mount();
  await prepare();
  fireEvent.click(
    screen.getByLabelText(
      "I reviewed this exact copy and grant current class teachers access to it.",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit this exact teacher copy" }));
  await screen.findByRole("button", { name: "Retry prior exact submission (new edits remain)" });
  h.confirm.mockResolvedValueOnce({
    ok: true,
    data: { ...copy, recipientEligible: false, grantState: "withdrawn", grantRevision: 2 },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Retry prior exact submission (new edits remain)" }),
  );
  await screen.findByText(/Earlier exact copy recovered. Teacher access is unavailable/);
  expect(h.confirm.mock.calls[1]![0]).toEqual(h.confirm.mock.calls[0]![0]);
});

it("preserves an unrelated unknown grant when withdrawing another source", async () => {
  const dependency = { ...roster.sources[0]!, artifactId: id(88) };
  h.roster.mockResolvedValue({
    ok: true,
    data: { ...roster, sources: [...roster.sources, dependency] },
  });
  h.saveChoice.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  mount();
  await screen.findByText("granted");
  fireEvent.click(screen.getByLabelText(/I may submit selected authored/));
  fireEvent.click(screen.getByRole("button", { name: "Save reported sharing eligibility" }));
  await screen.findByRole("button", { name: "Retry exact reported choice" });
  fireEvent.change(screen.getByLabelText("Exact retained source for reported choice"), {
    target: { value: dependency.artifactId },
  });
  h.choice.mockResolvedValueOnce({
    ok: true,
    data: {
      sourceKind: "guest_growth",
      artifactId: dependency.artifactId,
      choice: "granted",
      revision: 3,
    },
  });
  h.saveChoice.mockResolvedValueOnce({
    ok: true,
    data: {
      sourceKind: "guest_growth",
      artifactId: dependency.artifactId,
      choice: "withdrawn",
      revision: 4,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Withdraw reported sharing choice" }));
  await screen.findByText(/Reported sharing choice withdrawn/);
  fireEvent.click(screen.getByRole("button", { name: "Retry prior exact reported choice" }));
  await waitFor(() => expect(h.saveChoice).toHaveBeenCalledTimes(3));
  expect(h.saveChoice.mock.calls[2]![0]).toEqual(h.saveChoice.mock.calls[0]![0]);
});
it("keeps an unknown source grant resolvable after that source leaves the current graph", async () => {
  const dependency = { ...roster.sources[0]!, artifactId: id(89) };
  h.roster.mockResolvedValueOnce({
    ok: true,
    data: { ...roster, sources: [...roster.sources, dependency] },
  });
  h.saveChoice.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  mount();
  await screen.findByText("granted");
  fireEvent.change(screen.getByLabelText("Exact retained source for reported choice"), {
    target: { value: dependency.artifactId },
  });
  fireEvent.click(screen.getByLabelText(/I may submit selected authored/));
  fireEvent.click(screen.getByRole("button", { name: "Save reported sharing eligibility" }));
  await screen.findByRole("button", { name: "Retry exact reported choice" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh source choices" }));
  await screen.findByText(/Source choices refreshed/);
  fireEvent.change(screen.getByLabelText("Exact retained source for reported choice"), {
    target: { value: record.id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry prior exact reported choice" }));
  await waitFor(() => expect(h.saveChoice).toHaveBeenCalledTimes(2));
  expect(h.saveChoice.mock.calls[1]![0]).toEqual(h.saveChoice.mock.calls[0]![0]);
});
