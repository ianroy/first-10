import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactId, draftRecord, project } from "../ws-004/fixtures";
import type { DraftRecordResult, InterviewDraftRecord } from "@/lib/interview-drafts";
import { INTERVIEW_AUTOSAVE_DELAY } from "@/lib/useInterviewDraft";
const h = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
  blocker: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/interview-drafts.functions", () => ({
  loadInterviewDraft: h.load,
  saveInterviewDraft: h.save,
  completeInterviewDraft: h.complete,
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => {
    h.blocker(options);
    return { status: "idle" };
  },
}));
vi.mock("@/lib/data", () => ({
  TAGS: ["has problem"],
  useContacts: () => ({
    data: [{ id: "c1640000-0000-4000-8000-000000000003", first_name: "Élodie" }],
  }),
  useRefresh: () => h.refresh,
}));
vi.mock("@/components/AIOrigin", () => ({ AIOrigin: () => null }));
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: () => <p>Local export remains available</p>,
}));
import { InterviewDraftSession } from "@/components/interview-drafts/InterviewDraftSession";
let saved: InterviewDraftRecord;
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
async function tick(ms = INTERVIEW_AUTOSAVE_DELAY) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function note(value: string) {
  fireEvent.change(screen.getByLabelText("Conversation notes"), { target: { value } });
}
async function open() {
  const view = render(
    <InterviewDraftSession project={project} draftId={saved.id} onDone={vi.fn()} />,
  );
  await flush();
  return view;
}
beforeEach(() => {
  vi.useFakeTimers();
  saved = draftRecord();
  h.load.mockReset().mockImplementation(async () => ({ ok: true, draft: structuredClone(saved) }));
  h.save.mockReset().mockImplementation(async ({ data }) => {
    saved = {
      ...saved,
      revision: data.expectedRevision + 1,
      document: structuredClone(data.document),
      contactId: data.contactId,
    };
    return { ok: true, draft: structuredClone(saved) };
  });
  h.complete.mockReset();
  h.refresh.mockReset();
  h.blocker.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("acknowledged private interview autosave", () => {
  it("debounces typing, saves exact choices, and resumes only acknowledged notes after remount", async () => {
    // RPC JSON object key order is not guaranteed to match Zod's parsed order.
    const { choices, tags, ...rest } = saved.document!;
    saved.document = { ...rest, choices, tags };
    const view = await open();
    note("First phrase");
    await tick(700);
    note("Complete observation");
    await tick(1199);
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsaved changes/)).toBeVisible();
    await tick(1);
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.save.mock.calls[0]![0].data).toMatchObject({
      projectId: project.id,
      draftId: saved.id,
      expectedRevision: 3,
      contactId,
      document: {
        choices: { noteStatus: "granted", aiStatus: "unknown", sharingStatus: "unknown" },
      },
    });
    expect(screen.getByText("Saved revision 4")).toBeVisible();
    view.unmount();
    await open();
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Complete observation");
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("never labels in-flight text saved; preserves edits typed during the request and saves them against its ACK", async () => {
    const first = deferred<DraftRecordResult>();
    h.save.mockImplementationOnce(() => first.promise);
    await open();
    note("Sent observation");
    await tick();
    expect(screen.getByText("Saving…")).toBeVisible();
    expect(screen.getByLabelText("Conversation notes")).toBeEnabled();
    note("Later local observation");
    await tick(5000);
    expect(h.save).toHaveBeenCalledOnce();
    const sent = h.save.mock.calls[0]![0].data;
    await act(async () => {
      first.resolve({ ok: true, draft: { ...saved, revision: 4, document: sent.document } });
    });
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Later local observation");
    expect(screen.getByText(/Unsaved changes/)).toBeVisible();
    await tick();
    expect(h.save.mock.calls[1]![0].data).toMatchObject({
      expectedRevision: 4,
      document: { answers: [{ note: "Later local observation" }, { note: "" }] },
    });
    expect(screen.getByText("Saved revision 5")).toBeVisible();
  });
  it("stops after disconnect, keeps newer edits, and reconnect never sends an automatic retry", async () => {
    h.save.mockRejectedValueOnce(new Error("Connection lost after commit"));
    await open();
    note("Unconfirmed sent text");
    await tick();
    expect(screen.getByText(/Autosave paused/)).toBeVisible();
    note("Newer text after disconnection");
    fireEvent(window, new Event("online"));
    await tick(60000);
    expect(h.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await flush();
    expect(h.save.mock.calls[1]![0]).toEqual(h.save.mock.calls[0]![0]);
    expect(screen.getByLabelText("Conversation notes")).toHaveValue(
      "Newer text after disconnection",
    );
    await tick();
    expect(h.save.mock.calls[2]![0].data).toMatchObject({
      expectedRevision: 4,
      document: { answers: [{ note: "Newer text after disconnection" }, { note: "" }] },
    });
    expect(h.save.mock.calls[2]![0].data.mutationId).not.toBe(
      h.save.mock.calls[0]![0].data.mutationId,
    );
  });
  it("keeps both tab versions and withdrawn remote choices visible without merging or retrying", async () => {
    h.save.mockResolvedValueOnce({ ok: false, code: "CONFLICT", currentRevision: 4 });
    await open();
    note("My unsaved local observation");
    await tick();
    const remote = structuredClone(saved);
    remote.revision = 4;
    remote.document!.answers[0]!.note = "";
    remote.document!.choices = {
      noteStatus: "withdrawn",
      aiStatus: "withdrawn",
      sharingStatus: "withdrawn",
    };
    h.load.mockResolvedValueOnce({ ok: true, draft: remote });
    fireEvent.click(screen.getByRole("button", { name: "Compare saved version" }));
    await flush();
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("My unsaved local observation");
    expect(screen.getByLabelText("Current remote interview draft")).toHaveTextContent(
      "Note permission: withdrawn; AI: withdrawn; sharing: withdrawn",
    );
    expect(screen.getByText("Local export remains available")).toBeVisible();
    await tick(60000);
    expect(h.save).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });
  it("a failed conflict comparison preserves local text and cannot resume autosave", async () => {
    h.save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    await open();
    note("Keep this");
    await tick();
    h.load.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: "Compare saved version" }));
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Reload failed");
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Keep this");
    await tick(10000);
    expect(h.save).toHaveBeenCalledOnce();
  });
  it("ignores an old owner's delayed load after changing scope", async () => {
    const delayed = deferred<DraftRecordResult>();
    h.load.mockImplementationOnce(() => delayed.promise);
    const view = render(
      <InterviewDraftSession project={project} draftId={saved.id} onDone={vi.fn()} />,
    );
    const otherProject = { ...project, user_id: "c1640000-0000-4000-8000-000000000099" };
    const otherDraft = {
      ...saved,
      document: {
        ...saved.document!,
        answers: saved.document!.answers.map((answer) => ({
          ...answer,
          note: "New owner's saved text",
        })),
      },
    };
    h.load.mockResolvedValueOnce({ ok: true, draft: otherDraft });
    view.rerender(
      <InterviewDraftSession project={otherProject} draftId={saved.id} onDone={vi.fn()} />,
    );
    await flush();
    await act(async () => {
      delayed.resolve({ ok: true, draft: saved });
    });
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("New owner's saved text");
    expect(h.save).not.toHaveBeenCalled();
  });
  it("ignores an old project's delayed save after switching project and draft", async () => {
    const delayed = deferred<DraftRecordResult>();
    h.save.mockImplementationOnce(() => delayed.promise);
    const view = await open();
    note("Old project sent text");
    await tick();
    const nextProject = { ...project, id: "c1640000-0000-4000-8000-000000000088" };
    const nextDraft = {
      ...saved,
      id: "c1640000-0000-4000-8000-000000000077",
      projectId: nextProject.id,
    };
    h.load.mockResolvedValueOnce({ ok: true, draft: nextDraft });
    view.rerender(
      <InterviewDraftSession project={nextProject} draftId={nextDraft.id} onDone={vi.fn()} />,
    );
    await flush();
    note("New project local text");
    await act(async () => {
      delayed.resolve({
        ok: true,
        draft: { ...saved, revision: 4, document: h.save.mock.calls[0]![0].data.document },
      });
    });
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("New project local text");
    await tick();
    expect(h.save.mock.calls[1]![0].data).toMatchObject({
      projectId: nextProject.id,
      draftId: nextDraft.id,
      expectedRevision: 3,
    });
  });
  it("does not overwrite an archived idea or repeatedly retry deterministic failures", async () => {
    h.save.mockResolvedValueOnce({ ok: false, code: "ARCHIVED" });
    await open();
    note("Local after archive");
    await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("Restore this idea in Account");
    note("Still local");
    fireEvent(window, new Event("online"));
    await tick(60000);
    expect(h.save).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Still local");
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("protects navigation and refresh while unsaved or saving, and clears the guard only after ACK", async () => {
    const delayed = deferred<DraftRecordResult>();
    h.save.mockImplementationOnce(() => delayed.promise);
    await open();
    expect(h.blocker.mock.lastCall![0].enableBeforeUnload).toBe(false);
    note("Protected note");
    expect(h.blocker.mock.lastCall![0].shouldBlockFn()).toBe(true);
    await tick();
    expect(h.blocker.mock.lastCall![0].enableBeforeUnload).toBe(true);
    await act(async () => {
      delayed.resolve({
        ok: true,
        draft: { ...saved, revision: 4, document: h.save.mock.calls[0]![0].data.document },
      });
    });
    expect(h.blocker.mock.lastCall![0].shouldBlockFn()).toBe(false);
  });
  it("pauses the debounce while a destructive confirmation is open", async () => {
    await open();
    note("Keep until my decision");
    fireEvent.click(screen.getByRole("button", { name: "Clear notes and save withdrawal" }));
    await tick(10000);
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
    await tick();
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.save.mock.calls[0]![0].data.document.answers[0].note).toBe("Keep until my decision");
  });
  it("stops invalid permission saves without sending notes and requires an explicit corrected save", async () => {
    await open();
    note("Permission-dependent private note");
    fireEvent.change(screen.getByLabelText("Permission to keep notes"), {
      target: { value: "withdrawn" },
    });
    await tick();
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Clear notes and quotes before saving");
    fireEvent.change(screen.getByLabelText("Permission to keep notes"), {
      target: { value: "granted" },
    });
    await tick(10000);
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await flush();
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.save.mock.calls[0]![0].data.document.choices).toEqual({
      noteStatus: "granted",
      aiStatus: "unknown",
      sharingStatus: "unknown",
    });
  });
  it("rejects a valid-looking response bound to a different project", async () => {
    h.save.mockResolvedValueOnce({
      ok: true,
      draft: { ...saved, projectId: "c1640000-0000-4000-8000-000000000099", revision: 4 },
    });
    await open();
    note("Scope-bound observation");
    await tick();
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Scope-bound observation");
    expect(screen.getByText(/Autosave paused/)).toBeVisible();
    expect(screen.queryByText("Saved revision 4")).not.toBeInTheDocument();
    await tick(10000);
    expect(h.save).toHaveBeenCalledOnce();
  });
  it("does not write private text to localStorage or sessionStorage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await open();
    note("Private observation never cached");
    await tick();
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
});
