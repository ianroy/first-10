import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { contactId, draftRecord, project } from "./fixtures";
const h = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/interview-drafts.functions", () => ({
  listInterviewDrafts: h.list,
  createInterviewDraft: h.create,
}));
vi.mock("@/lib/data", () => ({
  useContacts: () => ({
    data: [
      {
        id: "c1640000-0000-4000-8000-000000000003",
        first_name: "Élodie",
        stage: 3,
        status: "paying",
      },
    ],
    error: null,
  }),
}));
vi.mock("@/components/AppShell", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
import { InterviewDraftList } from "@/components/interview-drafts/InterviewDraftList";
beforeEach(() => {
  h.list.mockReset().mockResolvedValue({ ok: true, drafts: [] });
  h.create.mockReset().mockResolvedValue({ ok: true, draft: draftRecord() });
});
afterEach(cleanup);
it("resumes a saved snapshot even when current preparation is absent or being edited", async () => {
  const d = draftRecord(),
    onResume = vi.fn();
  h.list.mockResolvedValue({
    ok: true,
    drafts: [
      { id: d.id, contactId, revision: 3, savedAt: d.savedAt, questionCount: 2, answeredCount: 1 },
    ],
  });
  render(<InterviewDraftList project={project} canStart={false} onResume={onResume} />);
  fireEvent.click(await screen.findByRole("button", { name: "Resume draft 1" }));
  expect(onResume).toHaveBeenCalledWith(d.id);
  expect(h.create).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Begin" })).not.toBeInTheDocument();
});
it("allows manual unknown-permission starts and retries an uncertain creation using the same draft identity", async () => {
  const onResume = vi.fn();
  h.create.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" });
  render(<InterviewDraftList project={project} canStart onResume={onResume} />);
  await screen.findByText("No incomplete drafts saved for this idea yet.");
  fireEvent.change(screen.getByLabelText("Person for this conversation"), {
    target: { value: "manual" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Begin" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Begin" }));
  await waitFor(() => expect(onResume).toHaveBeenCalledWith(draftRecord().id));
  expect(h.create.mock.calls[0]![0]).toEqual(h.create.mock.calls[1]![0]);
  expect(h.create.mock.calls[0]![0].data).toMatchObject({
    projectId: project.id,
    contactId: null,
    noteStatus: "unknown",
    expectedQuestions: project.questions,
    expectedOriginId: null,
  });
});
it("permits a later-stage contact and explicit note report without pretending the contact was interviewed", async () => {
  render(<InterviewDraftList project={project} canStart onResume={vi.fn()} />);
  await screen.findByText("No incomplete drafts saved for this idea yet.");
  expect(screen.getByRole("option", { name: "Élodie · Stage 3 · paying" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Person for this conversation"), {
    target: { value: contactId },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /I asked if it’s okay to take notes/ }));
  fireEvent.click(screen.getByRole("button", { name: "Begin" }));
  await waitFor(() =>
    expect(h.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId, noteStatus: "granted" }),
    }),
  );
});
it("fails closed on unavailable list instead of starting duplicates from a blank screen", async () => {
  h.list.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
  render(<InterviewDraftList project={project} canStart onResume={vi.fn()} />);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Person for this conversation"), {
    target: { value: "manual" },
  });
  expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
  expect(h.create).not.toHaveBeenCalled();
});
