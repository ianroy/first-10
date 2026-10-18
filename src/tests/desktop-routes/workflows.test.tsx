import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/render-page";

const h = vi.hoisted(() => ({
  supabase: null as unknown as FakeSupabase,
  generate: vi.fn(),
  capture: vi.fn(),
  draftList: vi.fn(),
  draftCreate: vi.fn(),
  draftLoad: vi.fn(),
  draftSave: vi.fn(),
  draftComplete: vi.fn(),
  getConsent: vi.fn(),
  setConsent: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.supabase;
  },
}));
vi.mock("@/lib/ai.functions", () => ({ generateAI: h.generate }));
vi.mock("@/lib/consent.functions", () => ({
  saveInterviewWithConsent: h.capture,
  getProcessingConsent: h.getConsent,
  setProcessingConsent: h.setConsent,
}));
vi.mock("@/lib/interview-drafts.functions", () => ({
  listInterviewDrafts: h.draftList,
  createInterviewDraft: h.draftCreate,
  loadInterviewDraft: h.draftLoad,
  saveInterviewDraft: h.draftSave,
  completeInterviewDraft: h.draftComplete,
}));
import { Route as Contacts } from "@/routes/_authenticated/contacts";
import { Route as Learnings } from "@/routes/_authenticated/learnings";
import { Route as Interview } from "@/routes/_authenticated/interview";
import { Route as Outreach } from "@/routes/_authenticated/outreach";

const project = {
  id: "p1",
  user_id: "user-1",
  name: "Fictional StudyLoop",
  description: "Classroom fixture",
  audience: "Study groups",
  problem: "Uncertain attendance",
  link: "",
  stage: 2,
  questions: ["What happened last time?", "How did you handle it?"],
  survey: ["What happened when you tried it?"],
  checklist: {},
  created_at: "2026-10-01T00:00:00Z",
};
const contact = {
  id: "c1",
  project_id: "p1",
  first_name: "Avery",
  relation: "Club",
  why: "Organizes a study group",
  stage: 2,
  status: "contacted",
  source: "club",
  created_at: "2026-10-01T00:00:00Z",
};
const page = (route: { options: { component?: unknown } }) =>
  route.options.component as Parameters<typeof renderPage>[0];
beforeEach(() => {
  h.generate.mockClear();
  h.draftList.mockReset().mockResolvedValue({ ok: true, drafts: [] });
  h.draftCreate.mockReset();
  h.draftLoad.mockReset();
  h.draftSave.mockReset();
  h.draftComplete.mockReset();
  h.capture.mockReset().mockResolvedValue({ interviewId: "saved-interview", replayed: false });
  h.getConsent.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    noteStatus: "unknown",
    aiStatus: "unknown",
    sharingStatus: "unknown",
    revision: 0,
    policyVersion: 1,
    evidenceInvalidated: false,
    reportedAt: null,
  }));
});
afterEach(cleanup);

describe("desktop workflow layout preserves actions and accessible inputs", () => {
  it("names contact fields, records the selected stage and updates a named contact status", async () => {
    h.supabase = createFakeSupabase({ projects: [project], contacts: [contact] });
    renderPage(page(Contacts), "/contacts");
    await screen.findByLabelText("First name");
    expect(screen.getByRole("button", { name: "Next 50" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Sam Example" } });
    fireEvent.change(screen.getByLabelText("How you know them or found them"), {
      target: { value: "Campus group" },
    });
    fireEvent.change(screen.getByLabelText("Why this person?"), {
      target: { value: "Recent organizer experience" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual(
        expect.objectContaining({
          table: "contacts",
          op: "insert",
          payload: expect.objectContaining({
            first_name: "Sam",
            stage: 2,
            why: "Recent organizer experience",
          }),
        }),
      ),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Status for Avery" }), {
      target: { value: "tried" },
    });
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual({
        table: "contacts",
        op: "update",
        payload: { status: "tried" },
      }),
    );
    expect(screen.getByRole("button", { name: "Remove Avery" })).toBeVisible();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("saves labeled summary edits without accepting them and keeps experiment labels accessible", async () => {
    h.supabase = createFakeSupabase({
      projects: [project],
      interviews: [],
      learnings: [
        {
          id: "l1",
          project_id: "p1",
          stage: 1,
          kind: "synthesis",
          accepted: false,
          data: {
            problems: ["Old interpretation"],
            objections: ["Existing chat works"],
            best_fit: ["Existing groups"],
            quotes: [],
            changes: [{ title: "Confirm attendance", body: "Try a small test" }],
          },
        },
      ],
    });
    renderPage(page(Learnings), "/learnings");
    const problems = await screen.findByLabelText("Top problems");
    fireEvent.change(problems, {
      target: { value: "Revised interpretation\nUncertainty remains" },
    });
    expect(screen.getByLabelText("Change 1")).toHaveValue("Confirm attendance");
    expect(screen.getByLabelText("Reason and next step")).toHaveValue("Try a small test");
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual(
        expect.objectContaining({
          table: "learnings",
          op: "update",
          payload: expect.objectContaining({
            accepted: false,
            data: expect.objectContaining({
              problems: ["Revised interpretation", "Uncertainty remains"],
            }),
          }),
        }),
      ),
    );
    expect(screen.getByLabelText("Hypothesis")).toBeVisible();
    expect(screen.getByLabelText("Change to test")).toBeVisible();
    expect(screen.getByLabelText("Result (optional for now)")).toBeVisible();
  });

  it("allows manually written questions while processing permission remains unknown", async () => {
    h.supabase = createFakeSupabase({
      projects: [{ ...project, questions: [] }],
      contacts: [],
      interviews: [],
    });
    renderPage(page(Interview), "/interview");
    fireEvent.click(await screen.findByRole("button", { name: "Write questions myself" }));
    fireEvent.change(screen.getByLabelText("Question 1"), {
      target: { value: "What happened the last time you arranged a meeting?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save questions" }));
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual(
        expect.objectContaining({
          table: "projects",
          op: "update",
          payload: expect.objectContaining({
            questions: ["What happened the last time you arranged a meeting?"],
            questions_origin_id: null,
          }),
        }),
      ),
    );
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("saves exact private draft notes separately before explicit reviewed completion", async () => {
    h.supabase = createFakeSupabase({
      projects: [{ ...project, stage: 1 }],
      contacts: [{ ...contact, stage: 1, status: "to_contact" }],
    });
    let record = {
      id: "draft-1",
      projectId: "p1",
      contactId: "c1",
      revision: 1,
      status: "active",
      questions: project.questions,
      originId: null,
      createdAt: "2026-10-18T15:00:00Z",
      savedAt: "2026-10-18T15:00:00Z",
      completedAt: null,
      interviewId: null,
      document: {
        schemaVersion: 1,
        policyVersion: 1,
        answers: project.questions.map((q) => ({ q, note: "", quote: "" })),
        choices: { noteStatus: "granted", aiStatus: "unknown", sharingStatus: "unknown" },
        tags: [],
        currentQuestion: 0,
      },
    };
    h.draftCreate.mockResolvedValue({ ok: true, draft: record });
    h.draftLoad.mockImplementation(async () => ({ ok: true, draft: structuredClone(record) }));
    h.draftSave.mockImplementation(async ({ data }) => {
      record = { ...record, revision: 2, document: data.document };
      return { ok: true, draft: structuredClone(record) };
    });
    h.draftComplete.mockResolvedValue({
      ok: true,
      interviewId: "saved-interview",
      replayed: false,
      completedRevision: 2,
    });
    renderPage(page(Interview), "/interview");
    expect(await screen.findByLabelText("Question 1")).toHaveValue(project.questions[0]);
    const begin = await screen.findByRole("button", { name: "Begin" });
    expect(begin).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Person for this conversation"), {
      target: { value: "c1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I asked if it’s okay to take notes/ }));
    fireEvent.click(begin);
    fireEvent.change(await screen.findByLabelText("Conversation notes"), {
      target: { value: "Fictional note for the fixture" },
    });
    fireEvent.change(screen.getByLabelText("Exact quote (optional)"), {
      target: { value: "Fictional exact words" },
    });
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.draftComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Complete interview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\. It is still incomplete/);
    expect(h.draftSave).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p1",
        draftId: "draft-1",
        contactId: "c1",
        expectedRevision: 1,
        mutationId: expect.any(String),
        document: expect.objectContaining({
          choices: { noteStatus: "granted", aiStatus: "unknown", sharingStatus: "unknown" },
          answers: [
            {
              q: project.questions[0],
              note: "Fictional note for the fixture",
              quote: "Fictional exact words",
            },
            { q: project.questions[1], note: "", quote: "" },
          ],
        }),
      }),
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I conducted this conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    await screen.findByRole("heading", { name: "Interview completion receipt" });
    expect(h.draftComplete).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: "p1", draftId: "draft-1", expectedRevision: 2 },
    });
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("keeps outreach body edits on blur and survey edits on explicit save", async () => {
    h.supabase = createFakeSupabase({
      projects: [project],
      outreach: [
        {
          id: "o1",
          project_id: "p1",
          stage: 2,
          kind: "draft",
          title: "Organizer message",
          body: "Original fictional draft",
        },
      ],
      contacts: [contact],
    });
    renderPage(page(Outreach), "/outreach");
    const body = await screen.findByLabelText("Organizer message");
    fireEvent.change(body, { target: { value: "Reviewed fictional draft" } });
    expect(h.supabase.calls.filter((c) => c.table === "outreach")).toHaveLength(0);
    fireEvent.blur(body);
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual({
        table: "outreach",
        op: "update",
        payload: { body: "Reviewed fictional draft" },
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback survey" }), {
      target: { value: "What happened last time?\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual({
        table: "projects",
        op: "update",
        payload: { survey: ["What happened last time?"] },
      }),
    );
    expect(screen.getByRole("button", { name: "Move Avery to Replied" })).toBeVisible();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("keeps stage-three numbers manual and saves the existing checklist shape", async () => {
    h.supabase = createFakeSupabase({
      projects: [
        {
          ...project,
          stage: 3,
          checklist: { kept: true, metrics: { signups: 10, active: 4, returning: 2 } },
        },
      ],
    });
    renderPage(page(Outreach), "/outreach");
    const returning = await screen.findByLabelText("Came back");
    fireEvent.change(returning, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save numbers" }));
    await waitFor(() =>
      expect(h.supabase.calls).toContainEqual({
        table: "projects",
        op: "update",
        payload: { checklist: { kept: true, metrics: { signups: 10, active: 4, returning: 3 } } },
      }),
    );
    expect(screen.getByText(/Manually entered counts, not automatic analytics/)).toBeVisible();
  });
});
