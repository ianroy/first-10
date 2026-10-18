import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage } from "@/test/render-page";
import type { ActivityOffer } from "@/lib/export/adapters";
import { contactId, draftRecord, project } from "./fixtures";
const h = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
  refresh: vi.fn(),
  contacts: [{ id: "c1640000-0000-4000-8000-000000000003", first_name: "Élodie" }],
  exported: [] as unknown[],
}));
vi.mock("@/lib/interview-drafts.functions", () => ({
  loadInterviewDraft: h.load,
  saveInterviewDraft: h.save,
  completeInterviewDraft: h.complete,
}));
vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data")>()),
  useContacts: () => ({ data: h.contacts, isLoading: false, error: null }),
  useRefresh: () => h.refresh,
}));
vi.mock("@/components/AIOrigin", () => ({ AIOrigin: () => null }));
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: ({ activities }: { activities: () => ActivityOffer[] }) => (
    <button
      onClick={() => {
        h.exported = activities();
      }}
    >
      Export current draft fixture
    </button>
  ),
}));
import { InterviewDraftSession } from "@/components/interview-drafts/InterviewDraftSession";
let saved = draftRecord();
beforeEach(() => {
  saved = draftRecord();
  h.load.mockReset().mockImplementation(async () => ({ ok: true, draft: structuredClone(saved) }));
  h.save.mockReset().mockImplementation(async ({ data }) => {
    saved = {
      ...saved,
      document: structuredClone(data.document),
      contactId: data.contactId,
      revision: data.expectedRevision + 1,
    };
    return { ok: true, draft: structuredClone(saved) };
  });
  h.complete.mockReset().mockResolvedValue({
    ok: true,
    interviewId: "c1640000-0000-4000-8000-000000000005",
    replayed: false,
    completedRevision: 4,
  });
  h.refresh.mockReset();
  h.contacts = [{ id: contactId, first_name: "Élodie" }];
  h.exported = [];
});
afterEach(cleanup);
function open(onDone = vi.fn()) {
  renderPage(
    () => <InterviewDraftSession project={project} draftId={saved.id} onDone={onDone} />,
    "/interview",
  );
  return onDone;
}
async function changeNote(value = "Current unsaved observation") {
  fireEvent.change(await screen.findByLabelText("Conversation notes"), { target: { value } });
}
describe("private interview save/resume interface", () => {
  it("resumes the exact snapshot and position; current preparation never replaces it", async () => {
    saved.document!.currentQuestion = 1;
    saved.document!.answers[1]!.note = "Saved observation";
    open();
    expect(await screen.findByLabelText("Conversation notes")).toHaveValue("Saved observation");
    expect(screen.getByRole("heading", { name: "What did you do next?" })).toBeVisible();
    expect(screen.queryByText((project.questions as string[])[0]!)).not.toBeInTheDocument();
    expect(h.load).toHaveBeenCalledWith({ data: { projectId: project.id, draftId: saved.id } });
    expect(h.save).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("keeps ambiguous save text and reuses identical mutation identity on retry", async () => {
    h.save.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
    open();
    await changeNote();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("result could not be confirmed");
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Current unsaved observation");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\. It is still incomplete/);
    expect(h.save.mock.calls[0]![0]).toEqual(h.save.mock.calls[1]![0]);
    expect(h.save.mock.calls[0]![0].data).toMatchObject({
      projectId: project.id,
      draftId: saved.id,
      expectedRevision: 3,
      contactId,
      document: {
        answers: [
          { q: saved.questions[0], note: "Current unsaved observation", quote: "" },
          { q: saved.questions[1], note: "", quote: "" },
        ],
        choices: { aiStatus: "unknown", sharingStatus: "unknown" },
      },
    });
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("keeps stale local work exportable; failed explicit reload never destroys it", async () => {
    h.save.mockResolvedValueOnce({ ok: false, code: "CONFLICT", currentRevision: 4 });
    open();
    await changeNote();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/A newer saved revision exists/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Export current draft fixture" }));
    expect(JSON.stringify(h.exported)).toContain("Current unsaved observation");
    expect(JSON.stringify(h.exported)).toContain("current unsaved edits");
    h.load.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
    fireEvent.click(screen.getByRole("button", { name: "Review / reload saved draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reload saved draft" }));
    await screen.findByText("Reload failed. Your current local draft remains here.");
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Current unsaved observation");
    saved.document!.answers[0]!.note = "Newer server observation";
    saved.revision = 4;
    fireEvent.click(screen.getByRole("button", { name: "Review / reload saved draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reload saved draft" }));
    await screen.findByText("Saved draft reloaded.");
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Newer server observation");
  });
  it("requires a saved revision and reviewed completion, then shows a terminal receipt", async () => {
    open();
    await changeNote();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I conducted this conversation/ }));
    expect(screen.getByRole("button", { name: "Complete interview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\./);
    expect(
      screen.getByRole("checkbox", { name: /I conducted this conversation/ }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /I conducted this conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
    expect(h.complete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    await screen.findByRole("heading", { name: "Interview completion receipt" });
    expect(h.complete).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: project.id, draftId: saved.id, expectedRevision: 4 },
    });
    expect(h.refresh).toHaveBeenCalledWith("interviews", "contacts");
    expect(screen.queryByLabelText("Conversation notes")).not.toBeInTheDocument();
  });
  it("never starts a new session from a completed-create replay receipt", async () => {
    saved = {
      ...saved,
      status: "completed",
      document: null,
      completedAt: "2026-10-18T16:00:00Z",
      interviewId: "c1640000-0000-4000-8000-000000000005",
    };
    open();
    await screen.findByRole("heading", { name: "Interview completion receipt" });
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("retries uncertain completion against the same saved revision and accepts the existing receipt", async () => {
    saved.document!.currentQuestion = saved.questions.length;
    h.complete.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" }).mockResolvedValueOnce({
      ok: true,
      interviewId: "c1640000-0000-4000-8000-000000000005",
      replayed: true,
      completedRevision: 3,
    });
    open();
    fireEvent.click(await screen.findByRole("checkbox", { name: /I conducted this conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    await screen.findByText(/The result could not be confirmed/);
    expect(screen.getByRole("heading", { name: "Review what you heard" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    await screen.findByText("This interview was already completed. No second record was created.");
    expect(h.complete.mock.calls[0]![0]).toEqual(h.complete.mock.calls[1]![0]);
    expect(h.save).not.toHaveBeenCalled();
  });
  it("unknown permission disables note entry; clearing explicitly saves all choices withdrawn", async () => {
    saved.document!.choices.noteStatus = "unknown";
    open();
    expect(await screen.findByLabelText("Conversation notes")).toBeDisabled();
    fireEvent.click(screen.getByText("Note, AI and sharing choices"));
    fireEvent.change(screen.getByLabelText("Permission to keep notes"), {
      target: { value: "granted" },
    });
    await changeNote("Sensitive temporary note");
    fireEvent.click(screen.getByRole("button", { name: "Clear notes and save withdrawal" }));
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Clear notes and withdraw" }));
    await screen.findByText(/Draft saved\./);
    expect(h.save.mock.calls[0]![0].data.document).toMatchObject({
      choices: { noteStatus: "withdrawn", aiStatus: "withdrawn", sharingStatus: "withdrawn" },
      answers: saved.questions.map((q) => ({ q, note: "", quote: "" })),
      tags: [],
    });
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("");
    expect(screen.getByLabelText("Conversation notes")).toBeDisabled();
  });
  it("unlinks a deleted contact explicitly without changing the local notes", async () => {
    h.contacts = [];
    open();
    await changeNote();
    fireEvent.click(screen.getByRole("button", { name: "Unlink unavailable person" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\./);
    expect(h.save.mock.calls[0]![0].data.contactId).toBeNull();
    expect(saved.document!.answers[0]!.note).toBe("Current unsaved observation");
  });
  it("uses an explicit leave confirmation and lets the user keep local work", async () => {
    const done = open();
    await changeNote();
    fireEvent.click(screen.getByRole("button", { name: "Back to preparation" }));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Conversation notes")).toHaveValue("Current unsaved observation");
    fireEvent.click(screen.getByRole("button", { name: "Back to preparation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(done).toHaveBeenCalledOnce();
  });
});
