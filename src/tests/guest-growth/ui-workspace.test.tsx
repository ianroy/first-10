import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActivityExportV1 } from "@/lib/export/activity";
const h = vi.hoisted(() => ({ pdf: vi.fn(), delivery: vi.fn() }));
vi.mock("@/components/export/ActivityPdfExport", () => ({
  ActivityPdfExport: ({
    document,
    authorizeDownload,
  }: {
    document: ActivityExportV1;
    authorizeDownload: () => Promise<void>;
  }) => {
    h.pdf({ document, authorizeDownload });
    return (
      <button
        onClick={() =>
          void authorizeDownload().then(
            () => h.delivery("allowed"),
            () => h.delivery("denied"),
          )
        }
      >
        Check {document.title} access
      </button>
    );
  },
}));
import { GuestGrowthWorkspace } from "@/components/guest-growth/GuestGrowthWorkspace";
import type { GuestGrowthPorts } from "@/components/guest-growth/ports";
import { createEmptyGuestGrowth, type saveGuestGrowthSchema } from "@/lib/guest-growth/contracts";
import type { z } from "zod";
import { view, csrf, time, records, id, type Saved } from "./fixture";
type Save = z.infer<typeof saveGuestGrowthSchema>;
const ports = {
  list: vi.fn(),
  load: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
  authorizeExport: vi.fn(),
} satisfies GuestGrowthPorts;
const reporter = vi.fn();
function ack(
  input: Save,
  revision = input.expectedRevision + 1,
): { ok: true; data: { record: Saved; savedRevision: number; replayed: boolean } } {
  return {
    ok: true,
    data: {
      record: {
        id: input.artifactId,
        classId: view.classId,
        teamId: view.teamId,
        authorPrincipalId: view.principalId,
        audience: input.audience,
        kind: input.document.kind,
        revision,
        savedAt: time,
        aiEnabled: false,
        document: input.document,
      },
      savedRevision: input.expectedRevision + 1,
      replayed: false,
    },
  };
}
function deferred() {
  let resolve!: (v: unknown) => void;
  return {
    promise: new Promise<unknown>((r) => {
      resolve = r;
    }),
    resolve: (v: unknown) => resolve(v),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  ports.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  ports.load.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  ports.history.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  ports.save.mockImplementation(async (input: Save) => ack(input));
  ports.authorizeExport.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const mount = () =>
  render(
    <GuestGrowthWorkspace
      view={view}
      csrf={csrf}
      ports={ports}
      onDirtyChange={reporter}
      fictional
    />,
  );
async function title(v: string) {
  fireEvent.change(screen.getByLabelText("Growth activity title"), { target: { value: v } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save growth revision" })).toBeEnabled(),
  );
}
it("acknowledges an exact revision only after the port response and preserves edits typed in flight", async () => {
  const pending = deferred();
  ports.save.mockReturnValueOnce(pending.promise);
  mount();
  await title("First sent text");
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  expect(screen.queryByText(/Saved revision 1 confirmed/)).toBeNull();
  fireEvent.change(screen.getByLabelText("Growth activity title"), {
    target: { value: "Newer local edits" },
  });
  const sent = ports.save.mock.calls[0]![0];
  await act(async () => pending.resolve(ack(sent)));
  await screen.findByText(/Saved revision 1 confirmed; newer local edits are still unsaved/);
  expect(screen.getByDisplayValue("Newer local edits")).toBeInTheDocument();
  expect(ports.save.mock.calls[0]![0].document.title).toBe("First sent text");
  expect(reporter).toHaveBeenLastCalledWith(true);
});
it("retains one exact uncertain intent and does not replace newer local work with its retry receipt", async () => {
  ports.save.mockRejectedValueOnce(new Error("uncertain network"));
  mount();
  await title("Original save");
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  await screen.findByRole("button", { name: "Retry exact growth save" });
  fireEvent.change(screen.getByLabelText("Growth activity title"), {
    target: { value: "Keep this newer text" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check Current growth activity access" }));
  await waitFor(() => expect(h.delivery).toHaveBeenLastCalledWith("denied"));
  expect(ports.authorizeExport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry exact growth save" }));
  await screen.findByText(/Saved revision 1 confirmed/);
  expect(ports.save.mock.calls[1]![0]).toEqual(ports.save.mock.calls[0]![0]);
  expect(screen.getByDisplayValue("Keep this newer text")).toBeInTheDocument();
});
it("ignores a late previous-principal acknowledgement after scope replacement", async () => {
  const pending = deferred();
  ports.save.mockReturnValueOnce(pending.promise);
  const m = mount();
  await title("Old principal local text");
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  const sent = ports.save.mock.calls[0]![0];
  m.rerender(
    <GuestGrowthWorkspace
      view={{ ...view, principalId: id(88) }}
      csrf={csrf}
      ports={ports}
      onDirtyChange={reporter}
    />,
  );
  await act(async () => pending.resolve(ack(sent)));
  expect(screen.queryByDisplayValue("Old principal local text")).toBeNull();
  expect(screen.queryByText(/Saved revision 1 confirmed/)).toBeNull();
  expect(screen.getByLabelText("Growth activity title")).toHaveValue("");
});
it("requires a confirmed blank team record and never copies the private draft into its create request", async () => {
  mount();
  await title("Private content must not copy");
  fireEvent.click(screen.getByRole("button", { name: "New blank team activity" }));
  const checkbox = screen.getByRole("checkbox", {
    name: /I understand that current and future authorized teammates/,
  });
  expect(screen.getByLabelText("Growth activity title")).toBeDisabled();
  fireEvent.click(checkbox);
  const create = screen.getByRole("button", { name: "Create confirmed blank team activity" });
  fireEvent.click(create);
  await waitFor(() => expect(ports.save).toHaveBeenCalledTimes(1));
  expect(ports.save.mock.calls[0]![0]).toMatchObject({
    audience: "team_shared",
    expectedRevision: 0,
    sharedAudienceConfirmed: true,
    document: createEmptyGuestGrowth("learning"),
  });
  await waitFor(() => expect(screen.getByLabelText("Growth activity title")).toBeEnabled());
  expect(screen.getByLabelText("Growth activity title")).toHaveValue("");
});
it("opens an exact retained revision for read/export without silently turning it into an editable latest version", async () => {
  const current = records()[0]!,
    old = {
      ...current,
      revision: 1,
      document: { ...current.document, title: "Exact older learning" },
    };
  ports.list.mockResolvedValue({
    ok: true,
    data: { items: [(({ document: _document, ...header }) => header)(current)], nextCursor: null },
  });
  ports.load.mockImplementation(async (input: { revision?: number }) => ({
    ok: true,
    data: input.revision === 1 ? old : current,
  }));
  ports.history.mockResolvedValue({
    ok: true,
    data: {
      artifactId: current.id,
      versions: [
        { ...current, document: undefined },
        { ...old, document: undefined },
      ].map(({ document: _d, ...header }) => header),
    },
  });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Learning & synthesis 1 · revision 2" }),
  );
  await screen.findByDisplayValue(current.document.title);
  fireEvent.click(screen.getByRole("button", { name: "Load retained growth revisions" }));
  await screen.findByLabelText("Retained growth revision");
  fireEvent.change(screen.getByLabelText("Retained growth revision"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Open exact retained growth revision" }));
  await screen.findByDisplayValue("Exact older learning");
  expect(screen.getByLabelText("Growth activity title")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save growth revision" })).toBeDisabled();
  expect(JSON.stringify(h.pdf.mock.lastCall?.[0].document)).toContain(
    "Exact retained saved revision 1",
  );
  expect(ports.load).toHaveBeenLastCalledWith({ csrf, artifactId: current.id, revision: 1 });
});
it("refuses a substituted portfolio revision instead of silently omitting or replacing a selection", async () => {
  const current = records()[0]!;
  ports.list.mockResolvedValue({
    ok: true,
    data: { items: [(({ document: _document, ...header }) => header)(current)], nextCursor: null },
  });
  ports.load.mockResolvedValue({ ok: true, data: { ...current, revision: 3 } });
  mount();
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Include exact revision in portfolio" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Load exact selected growth portfolio" }));
  await screen.findByText(/Nothing was substituted or silently omitted/);
  expect(
    screen.queryByRole("button", { name: "Check Selected saved growth portfolio access" }),
  ).toBeNull();
});
it("withholds an export whose fresh authorization resolves after a scope change", async () => {
  const pending = deferred();
  ports.authorizeExport.mockReturnValueOnce(pending.promise);
  const m = mount();
  fireEvent.click(screen.getByRole("button", { name: "Check Current growth activity access" }));
  await waitFor(() => expect(ports.authorizeExport).toHaveBeenCalledTimes(1));
  m.rerender(
    <GuestGrowthWorkspace view={{ ...view, principalId: id(88) }} csrf={csrf} ports={ports} />,
  );
  await act(async () => pending.resolve(undefined));
  await waitFor(() => expect(h.delivery).toHaveBeenLastCalledWith("denied"));
});
it("keeps a reviewed PDF snapshot stable across the access-deadline clock tick", async () => {
  vi.useFakeTimers();
  mount();
  await act(async () => {
    await Promise.resolve();
  });
  const before = h.pdf.mock.lastCall?.[0].document;
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(h.pdf.mock.lastCall?.[0].document).toEqual(before);
});
it("shows dedicated structured editors for all six kinds without pretending that drafts were sent or collected", async () => {
  mount();
  await title("Manual draft");
  fireEvent.click(screen.getByRole("button", { name: "Experiment" }));
  expect(screen.getByLabelText("Falsifiable experiment hypothesis")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Alias pipeline contact" }));
  expect(screen.getByLabelText("Reported pipeline status")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Feedback survey draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Add survey question" }));
  expect(screen.getByLabelText("Survey question 1 format")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Referral ask draft" }));
  expect(screen.getByLabelText("Specific referral ask")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Onboarding research draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Add onboarding question" }));
  expect(screen.getByLabelText("Onboarding question 1 timing")).toBeInTheDocument();
  expect(ports.save).not.toHaveBeenCalled();
});

it("does not acknowledge a same-revision response with substituted document content", async () => {
  ports.save.mockImplementation(async (input: Save) => {
    const response = ack(input);
    response.data.record.document = { ...input.document, title: "Substituted response" };
    return response;
  });
  mount();
  await title("Keep my exact draft");
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  await screen.findByText(
    "The saved scope/revision could not be confirmed. Your draft remains here.",
  );
  expect(screen.getByLabelText("Growth activity title")).toHaveValue("Keep my exact draft");
  expect(screen.getByRole("button", { name: "Retry exact growth save" })).toBeEnabled();
});
