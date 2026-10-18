import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  list: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  bootstrap: vi.fn(),
  authorize: vi.fn(),
  block: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (v: unknown) => {
    h.block(v);
    return { status: "idle" };
  },
}));
vi.mock("@/lib/guest-marketing/functions", () => ({
  listGuestMarketing: h.list,
  loadGuestMarketing: h.load,
  saveGuestMarketing: h.save,
}));
vi.mock("@/lib/guest-spaces.functions", () => ({ bootstrapGuestSession: h.bootstrap }));
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
      Test marketing PDF authorization
    </button>
  ),
}));
vi.mock("@/components/guest-marketing/ReviewedMarketingHandoff", () => ({
  ReviewedMarketingHandoff: ({ onDraftChange }: { onDraftChange: (dirty: boolean) => void }) => (
    <button onClick={() => onDraftChange(false)}>Test clean handoff child</button>
  ),
}));
import { GuestMarketingWorkspace } from "@/components/guest-marketing/GuestMarketingWorkspace";
import {
  createGuestMarketing,
  type GuestMarketingRecord,
  type SaveGuestMarketingInput,
} from "@/lib/guest-marketing/contracts";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import { fixtureId as id } from "./fixture";
const csrf = "a".repeat(64),
  view: GuestView = {
    classId: id(1),
    className: "Fictional workshop",
    mode: "class",
    instructions: "",
    accessExpiresAt: "2099-10-18T20:00:00Z",
    retentionDays: 30,
    aiEnabled: false,
    teamId: id(2),
    teamAlias: "Team A",
    principalId: id(3),
    principalAlias: "Learner A",
    assignments: [],
  };
function record(document = createGuestMarketing(), revision = 1): GuestMarketingRecord {
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
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  h.list.mockResolvedValue({ ok: true, data: [] });
  h.load.mockResolvedValue({ ok: true, data: record() });
  h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf });
  h.save.mockImplementation(async ({ data }: { data: SaveGuestMarketingInput }) => ({
    ok: true,
    data: {
      record: {
        ...record(data.document, data.expectedRevision + 1),
        id: data.planId,
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
  render(<GuestMarketingWorkspace view={view} csrf={csrf} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "New private marketing plan" })).toBeEnabled(),
  );
}
const edit = (value: string) =>
  fireEvent.change(screen.getByLabelText("What have you observed?"), { target: { value } });
it("uses real cookie scope/CAS and preserves edits made during a save", async () => {
  await start();
  const pending = deferred<Awaited<ReturnType<typeof h.save>>>();
  h.save.mockReturnValueOnce(pending.promise);
  edit("First observation");
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  const sent = h.save.mock.calls[0]![0].data as SaveGuestMarketingInput;
  expect(sent).toMatchObject({
    csrf,
    audience: "principal_private",
    expectedRevision: 0,
    sharedAudienceConfirmed: false,
  });
  expect(sent).not.toHaveProperty("userId");
  expect(sent).not.toHaveProperty("projectId");
  edit("Later local observation");
  await act(async () =>
    pending.resolve({
      ok: true,
      data: {
        record: { ...record(sent.document), id: sent.planId },
        savedRevision: 1,
        replayed: false,
      },
    }),
  );
  expect(screen.getByLabelText("What have you observed?")).toHaveValue("Later local observation");
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
  expect(h.save.mock.calls[1]![0].data.expectedRevision).toBe(1);
});
it("retries exactly the unconfirmed sent intent while retaining later edits", async () => {
  await start();
  h.save.mockRejectedValueOnce(new Error("Network unknown"));
  edit("Sent draft");
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  await screen.findByRole("button", { name: "Retry exact save" });
  const first = h.save.mock.calls[0]![0].data;
  edit("Later draft");
  fireEvent.click(screen.getByRole("button", { name: "Retry exact save" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
  expect(h.save.mock.calls[1]![0].data).toEqual(first);
  expect(screen.getByLabelText("What have you observed?")).toHaveValue("Later draft");
});
it("starts shared work blank and requires separate shared audience confirmation", async () => {
  await start();
  edit("PRIVATE NOTE MUST NOT COPY");
  fireEvent.click(screen.getByRole("button", { name: "New blank team marketing plan" }));
  expect(screen.getByLabelText("What have you observed?")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  expect(h.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /current and future members/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
  expect(h.save.mock.calls[0]![0].data).toMatchObject({
    audience: "team_shared",
    sharedAudienceConfirmed: true,
    expectedRevision: 0,
  });
  expect(JSON.stringify(h.save.mock.calls[0])).not.toContain("PRIVATE NOTE MUST NOT COPY");
});
it("keeps local edits on conflict and never silently replaces them with a replayed newer document", async () => {
  await start();
  h.save.mockImplementationOnce(async ({ data }: { data: SaveGuestMarketingInput }) => ({
    ok: true,
    data: {
      record: { ...record({ ...data.document, title: "Newer remote plan" }, 3), id: data.planId },
      savedRevision: 1,
      replayed: true,
    },
  }));
  edit("Local work");
  fireEvent.click(screen.getByRole("button", { name: "Save marketing plan" }));
  await screen.findByText(/newer version now exists/);
  expect(screen.getByLabelText("What have you observed?")).toHaveValue("Local work");
  expect(screen.getByLabelText("Marketing plan title")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save marketing plan" })).toBeDisabled();
});
it("ignores a stale plan load after class/principal scope changes", async () => {
  h.list.mockResolvedValue({ ok: true, data: [record()] });
  const pending = deferred<unknown>();
  h.load.mockReturnValueOnce(pending.promise);
  const { rerender } = render(<GuestMarketingWorkspace view={view} csrf={csrf} />);
  fireEvent.click(await screen.findByRole("button", { name: /Private plan 1/ }));
  rerender(<GuestMarketingWorkspace view={{ ...view, principalId: id(20) }} csrf={csrf} />);
  await act(async () =>
    pending.resolve({
      ok: true,
      data: record({ ...createGuestMarketing(), title: "OLD PRIVATE PLAN" }),
    }),
  );
  expect(screen.getByLabelText("Marketing plan title")).not.toHaveValue("OLD PRIVATE PLAN");
});
it("requires fresh cookie scope and saved revision before PDF delivery", async () => {
  h.list.mockResolvedValue({ ok: true, data: [record()] });
  await start();
  fireEvent.click(screen.getByRole("button", { name: /Private plan 1/ }));
  await screen.findByText(/Opened saved revision 1/);
  h.bootstrap.mockResolvedValueOnce({ ok: true, data: { ...view, principalId: id(99) }, csrf });
  fireEvent.click(screen.getByRole("button", { name: "Test marketing PDF authorization" }));
  await waitFor(() => expect(h.authorize).toHaveBeenLastCalledWith("denied"));
  h.load.mockResolvedValueOnce({ ok: true, data: record(createGuestMarketing(), 2) });
  fireEvent.click(screen.getByRole("button", { name: "Test marketing PDF authorization" }));
  await waitFor(() => expect(h.authorize).toHaveBeenCalledTimes(2));
  expect(h.authorize).toHaveBeenLastCalledWith("denied");
});
it("reports dirty or unconfirmed work to the parent access controls", async () => {
  const changed = vi.fn();
  render(<GuestMarketingWorkspace view={view} csrf={csrf} onDirtyChange={changed} />);
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(false));
  edit("Unsaved");
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(true));
  cleanup();
  expect(changed).toHaveBeenLastCalledWith(false);
});
it("offers manual channel, content, outreach, test and measurement controls", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "2. Map channels" }));
  fireEvent.click(screen.getByRole("button", { name: "Add channel" }));
  fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: "Student club" } });
  fireEvent.click(screen.getByRole("button", { name: "3. Make content" }));
  fireEvent.click(screen.getByRole("button", { name: "Add content draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Add outreach draft" }));
  expect(screen.getByLabelText("Content draft / product demo script")).toBeVisible();
  expect(screen.getByLabelText("Outreach message draft")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "4. Plan the test" }));
  fireEvent.click(screen.getByRole("button", { name: "Add test action" }));
  expect(screen.getByLabelText("What counts as done?")).toBeVisible();
  expect(screen.getByLabelText("Baseline — blank means unknown")).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "5. Review learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Add manual measurement" }));
  expect(screen.getByLabelText("Count — blank means unknown")).toHaveValue(null);
  expect(screen.getByText(/no conversion rate is inferred/)).toBeVisible();
});
it("does not preserve an empty thinking block and trap required fields", async () => {
  await start();
  expect(screen.getByRole("button", { name: "Preserve first thinking" })).toBeDisabled();
  edit("A recent observation");
  fireEvent.change(screen.getByLabelText("Who can you reach without spending money?"), {
    target: { value: "Relevant club members" },
  });
  fireEvent.change(screen.getByLabelText("What useful action could someone try?"), {
    target: { value: "Try one script" },
  });
  fireEvent.change(screen.getByLabelText("Your own physical and digital channel ideas"), {
    target: { value: "Club meeting and email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preserve first thinking" }));
  expect(screen.getByLabelText("What have you observed?")).toBeDisabled();
  expect(screen.getByLabelText("Beachhead audience")).toBeEnabled();
});
it("a clean reviewed-handoff child cannot clear an unsaved Marketing Lab draft guard", async () => {
  const report = vi.fn();
  render(<GuestMarketingWorkspace view={view} csrf={csrf} onDirtyChange={report} />);
  await screen.findByRole("button", { name: "Test clean handoff child" });
  fireEvent.change(screen.getByLabelText("Marketing plan title"), {
    target: { value: "Unsaved plan still here" },
  });
  await waitFor(() => expect(report).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole("button", { name: "Test clean handoff child" }));
  expect(report).toHaveBeenLastCalledWith(true);
  expect(h.block.mock.lastCall?.[0].shouldBlockFn()).toBe(true);
});
