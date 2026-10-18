import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  list: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  bootstrap: vi.fn(),
  block: vi.fn((_value: unknown) => ({ status: "idle" })),
  exportAuthorize: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (v: unknown) => {
    h.block(v);
    return { status: "idle" };
  },
}));
vi.mock("@/lib/guest-activities/functions", () => ({
  listGuestActivities: h.list,
  loadGuestActivity: h.load,
  saveGuestActivity: h.save,
}));
vi.mock("@/lib/guest-spaces.functions", () => ({ bootstrapGuestSession: h.bootstrap }));
vi.mock("@/components/guest/GuestReviewedHandoff", () => ({ GuestReviewedHandoff: () => null }));
vi.mock("@/components/guest/GuestActivityExport", () => ({
  GuestActivityExport: ({ authorizeDownload }: { authorizeDownload: () => Promise<void> }) => (
    <button
      onClick={() => {
        void authorizeDownload().then(
          () => h.exportAuthorize("allowed"),
          () => h.exportAuthorize("denied"),
        );
      }}
    >
      Test fresh export authorization
    </button>
  ),
}));
import { GuestLearningWorkspace } from "@/components/guest/GuestLearningWorkspace";
import {
  createEmptyGuestLearning,
  type GuestActivityRecord,
  type SaveGuestActivityInput,
} from "@/lib/guest-activities/contracts";
import type { GuestView } from "@/lib/guest-spaces/contracts";
const id = (n: number) => `fc080000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const view: GuestView = {
  classId: id(1),
  className: "Fictional class",
  mode: "class",
  instructions: "",
  accessExpiresAt: "2099-11-18T20:00:00Z",
  retentionDays: 120,
  aiEnabled: false,
  teamId: id(2),
  teamAlias: "Fictional team",
  principalId: id(3),
  principalAlias: "Learner",
  assignments: [],
};
const csrf = "a".repeat(64);
function record(document = createEmptyGuestLearning(), revision = 1): GuestActivityRecord {
  return {
    id: id(4),
    classId: view.classId,
    teamId: view.teamId,
    authorPrincipalId: view.principalId,
    audience: "principal_private",
    revision,
    savedAt: "2026-10-18T20:00:00Z",
    document,
    aiEnabled: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  h.list.mockResolvedValue({ ok: true, data: [] });
  h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf });
  h.load.mockResolvedValue({ ok: true, data: record() });
  h.save.mockImplementation(async ({ data }: { data: SaveGuestActivityInput }) => ({
    ok: true,
    data: {
      record: {
        ...record(data.document, data.expectedRevision + 1),
        id: data.activityId,
        audience: data.audience,
      },
      savedRevision: data.expectedRevision + 1,
      replayed: false,
    },
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function start() {
  render(<GuestLearningWorkspace view={view} csrf={csrf} />);
  await screen.findByRole("heading", { name: "One conversation. A clearer next move." });
}
it("saves real guest scope, preserves edits made during save, and uses the next CAS baseline", async () => {
  await start();
  const pending = deferred<Awaited<ReturnType<typeof h.save>>>();
  h.save.mockReturnValueOnce(pending.promise);
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "First observation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  const sent = h.save.mock.calls[0]![0].data as SaveGuestActivityInput;
  expect(sent).toMatchObject({
    csrf,
    audience: "principal_private",
    expectedRevision: 0,
    sharedAudienceConfirmed: false,
  });
  expect(sent).not.toHaveProperty("userId");
  expect(sent).not.toHaveProperty("projectId");
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Later local observation" },
  });
  await act(async () =>
    pending.resolve({
      ok: true,
      data: {
        record: { ...record(sent.document), id: sent.activityId },
        savedRevision: 1,
        replayed: false,
      },
    }),
  );
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue(
    "Later local observation",
  );
  expect(screen.getByText(/Edits made while saving are still local/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
  expect(h.save.mock.calls[1]![0].data).toMatchObject({
    expectedRevision: 1,
    document: { discovery: { frame: { problem: "Later local observation" } } },
  });
});
it("retries an uncertain save with identical intent, then saves later edits separately", async () => {
  await start();
  h.save.mockRejectedValueOnce(new Error("network"));
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Sent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByRole("button", { name: "Retry the identical save" });
  const input = h.save.mock.calls[0]![0];
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "After timeout" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry the identical save" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
  expect(h.save.mock.calls[1]![0]).toEqual(input);
  await screen.findByText(/Edits made while saving are still local/);
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue("After timeout");
});
it("does not overwrite local edits when a replay reports a newer current record", async () => {
  await start();
  h.save.mockImplementationOnce(async ({ data }: { data: SaveGuestActivityInput }) => ({
    ok: true,
    data: {
      record: { ...record(data.document, 4), id: data.activityId },
      savedRevision: 1,
      replayed: true,
    },
  }));
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Keep me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText(/current server record is revision 4/);
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue("Keep me");
  expect(screen.getByRole("button", { name: "Save activity" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reload saved version" })).toBeEnabled();
});
it("opens saved work explicitly, recovers on reload, and ignores a late former principal response", async () => {
  const first = deferred<{ ok: true; data: ReturnType<typeof record>[] }>();
  h.list.mockReturnValueOnce(first.promise);
  const mounted = render(<GuestLearningWorkspace view={view} csrf={csrf} />);
  mounted.rerender(<GuestLearningWorkspace view={{ ...view, principalId: id(9) }} csrf={csrf} />);
  await screen.findByRole("heading", { name: "One conversation. A clearer next move." });
  await act(async () => first.resolve({ ok: true, data: [record()] }));
  expect(screen.queryByLabelText("Open saved activity")).not.toBeInTheDocument();
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue("");
});
it("requires explicit blank shared-audience confirmation and never copies private work", async () => {
  await start();
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "My private observation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "New blank team planning space" }));
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save activity" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I understand this blank planning activity/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
  expect(h.save.mock.calls[0]![0].data).toMatchObject({
    audience: "team_shared",
    sharedAudienceConfirmed: true,
    document: { interviews: [], discovery: { frame: { problem: "" } } },
  });
});
it("calculates permission revisions against the saved baseline despite multiple local toggles", async () => {
  const saved = record();
  h.list.mockResolvedValueOnce({ ok: true, data: [saved] });
  h.load.mockResolvedValueOnce({ ok: true, data: saved });
  await start();
  fireEvent.change(screen.getByLabelText("Open saved activity"), { target: { value: saved.id } });
  await screen.findByText("Opened saved revision 1.");
  const choice = screen.getByLabelText("Sharing selected activity material");
  fireEvent.change(choice, { target: { value: "granted" } });
  fireEvent.change(choice, { target: { value: "withdrawn" } });
  fireEvent.change(choice, { target: { value: "granted" } });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(h.save).toHaveBeenCalled());
  expect(h.save.mock.calls[0]![0].data.document.permissions).toEqual({
    ai: "unknown",
    sharing: "granted",
    revision: 2,
  });
});
it("fresh export authorization fails when the current browser identity changed", async () => {
  await start();
  h.bootstrap.mockResolvedValueOnce({ ok: true, data: { ...view, principalId: id(99) }, csrf });
  fireEvent.click(screen.getByRole("button", { name: "Test fresh export authorization" }));
  await waitFor(() => expect(h.exportAuthorize).toHaveBeenCalledWith("denied"));
  expect(h.save).not.toHaveBeenCalled();
});
it("blocks navigation for local work and explains the actual deadline", async () => {
  await start();
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Unsaved" },
  });
  const options = h.block.mock.calls.at(-1)![0] as {
    enableBeforeUnload: boolean;
    shouldBlockFn: () => boolean;
  };
  expect(options.enableBeforeUnload).toBe(true);
  expect(options.shouldBlockFn()).toBe(true);
  expect(screen.getByText(/post-expiry access ends/)).toBeInTheDocument();
});
it("reopens exact saved scripts and private draft notes while completed reports stay immutable", async () => {
  const { guestExportFixture } = await import("./export-fixture");
  const saved = record(guestExportFixture());
  h.list.mockResolvedValueOnce({ ok: true, data: [saved] });
  h.load.mockResolvedValueOnce({ ok: true, data: saved });
  await start();
  fireEvent.change(screen.getByLabelText("Open saved activity"), { target: { value: saved.id } });
  await screen.findByText("Opened saved revision 1.");
  fireEvent.click(screen.getByRole("button", { name: /Go and listen/ }));
  expect(screen.getByLabelText("Interview alias / role")).toHaveValue("Fictional role B");
  expect(screen.getByLabelText("Question 1: observation / notes")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Saved or current interview draft"), {
    target: { value: saved.document.interviews[0]!.id },
  });
  expect(screen.getByLabelText("Interview alias / role")).toHaveValue("Fictional Élodie");
  expect(
    screen.getByText("1. Tell me about the last time you found a project team."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Question 1: observation / notes")).toHaveValue(
    saved.document.interviews[0]!.answers[0]!.note,
  );
  expect(screen.getByLabelText("Question 1: observation / notes")).toBeEnabled();
  expect(h.save).not.toHaveBeenCalled();
});
it("requires deliberate interview withdrawal, clears linked results and increments choices once", async () => {
  const { guestExportFixture } = await import("./export-fixture");
  const saved = record(guestExportFixture());
  h.list.mockResolvedValueOnce({ ok: true, data: [saved] });
  h.load.mockResolvedValueOnce({ ok: true, data: saved });
  await start();
  fireEvent.change(screen.getByLabelText("Open saved activity"), { target: { value: saved.id } });
  await screen.findByText("Opened saved revision 1.");
  fireEvent.click(screen.getByRole("button", { name: /Go and listen/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Withdraw and clear this interview's notes" }),
  );
  expect(screen.getByLabelText("Question 1: observation / notes")).toHaveValue(
    saved.document.interviews[1]!.answers[0]!.note,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm clear and withdrawal" }));
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(h.save).toHaveBeenCalled());
  const sent = h.save.mock.calls[0]![0].data.document;
  expect(sent.interviews[1]).toMatchObject({
    completed: false,
    choices: { note: "withdrawn", ai: "withdrawn", sharing: "withdrawn", revision: 2 },
  });
  expect(
    sent.interviews[1].answers.every((a: { note: string; quote: string }) => !a.note && !a.quote),
  ).toBe(true);
  expect(sent.discovery.results[0]).toMatchObject({
    interviewId: null,
    observation: "",
    quote: "",
    interpretation: "",
    counterevidence: "",
  });
});
it("keeps invalid secret-bearing edits visible instead of crashing the PDF adapter", async () => {
  await start();
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Bearer fictional_secret_token_0123456789" },
  });
  expect(screen.getByLabelText("What is your problem space?")).toHaveValue(
    "Bearer fictional_secret_token_0123456789",
  );
  expect(screen.getByText(/current draft needs valid field lengths/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  expect(h.save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Remove credentials");
});
it("does not cancel an in-flight save merely because the same scoped view object refreshes", async () => {
  const mounted = render(<GuestLearningWorkspace view={view} csrf={csrf} />);
  await screen.findByRole("heading", { name: "One conversation. A clearer next move." });
  const pending = deferred<Awaited<ReturnType<typeof h.save>>>();
  h.save.mockReturnValueOnce(pending.promise);
  fireEvent.change(screen.getByLabelText("What is your problem space?"), {
    target: { value: "Same identity" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  const sent = h.save.mock.calls[0]![0].data as SaveGuestActivityInput;
  mounted.rerender(
    <GuestLearningWorkspace
      view={{ ...view, instructions: "A refreshed class description" }}
      csrf={csrf}
    />,
  );
  await act(async () =>
    pending.resolve({
      ok: true,
      data: {
        record: { ...record(sent.document), id: sent.activityId },
        savedRevision: 1,
        replayed: false,
      },
    }),
  );
  expect(screen.getByText("Saved revision 1.")).toBeInTheDocument();
  expect(h.list).toHaveBeenCalledTimes(1);
});
