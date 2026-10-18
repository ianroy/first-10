import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/render-page";
const h = vi.hoisted(() => ({
  client: null as unknown as FakeSupabase & { rpc: ReturnType<typeof vi.fn> },
  gen: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("@/lib/ai.functions", () => ({ generateAI: h.gen }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: vi.fn() } }));
import { Route as Interview } from "@/routes/_authenticated/interview";
import { Route as Learnings } from "@/routes/_authenticated/learnings";
import { Route as Outreach } from "@/routes/_authenticated/outreach";
const id = "fa028000-0000-4000-8000-000000000001";
const project = {
  id: "p1",
  user_id: "user-1",
  name: "Fictional saved-origin fixture",
  stage: 3,
  questions: [],
  survey: [],
  questions_origin_id: null,
  survey_origin_id: null,
  checklist: {},
  created_at: "2026-10-01T00:00:00Z",
};
const summary = {
  problems: ["Uncertain attendance"],
  objections: ["Existing routine works"],
  best_fit: [],
  quotes: [],
  changes: [],
};
const origin = {
  requestId: id,
  kind: "questions",
  promptId: "first-ten.questions",
  promptVersion: 1,
  schemaId: "first-ten.questions.output",
  schemaVersion: 1,
  requestedModel: "requested-model",
  actualModel: null,
  provider: null,
  costUsd: null,
  createdAt: "2026-10-18T13:00:00+00:00",
};
const page = (route: { options: { component?: unknown } }) =>
  route.options.component as Parameters<typeof renderPage>[0];
function client(tables: Parameters<typeof createFakeSupabase>[0]) {
  h.client = {
    ...createFakeSupabase(tables),
    rpc: vi.fn().mockImplementation(async (name) => ({
      data: name === "get_ai_generation_origin" ? origin : null,
      error: null,
    })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("generation receipts survive save and subsequent editing", () => {
  it("reuses the same intent when regenerating saved questions after an uncertain response", async () => {
    sessionStorage.clear();
    client({ projects: [{ ...project, questions: ["Keep the current question"] }] });
    h.gen.mockRejectedValue(new Error("Response uncertain"));
    renderPage(page(Interview), "/interview");
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Response uncertain"));
    const first = h.gen.mock.calls[0]![0].data;
    expect(first).toMatchObject({
      kind: "questions",
      projectId: "p1",
      operationId: expect.any(String),
      withOrigin: true,
    });
    expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(screen.getByLabelText("Question 1")).toHaveValue("Keep the current question");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(2));
    expect(h.gen.mock.calls[1]![0].data.operationId).toBe(first.operationId);
    expect(h.client.calls).toHaveLength(0);
  });
  it("stores the generated question receipt with human-edited questions and reads it after remount", async () => {
    client({ projects: [project] });
    h.gen.mockResolvedValue({ originId: id, data: { questions: ["Recent example?"] } });
    renderPage(page(Interview), "/interview");
    fireEvent.click(await screen.findByRole("button", { name: "Write my interview questions" }));
    const input = await screen.findByLabelText("Question 1");
    fireEvent.change(input, { target: { value: "Tell me about the last occasion." } });
    fireEvent.click(screen.getByRole("button", { name: "Save questions" }));
    await waitFor(() =>
      expect(h.client.calls).toContainEqual({
        table: "projects",
        op: "update",
        payload: { questions: ["Tell me about the last occasion."], questions_origin_id: id },
      }),
    );
    expect(h.gen).toHaveBeenCalledWith({
      data: {
        kind: "questions",
        projectId: "p1",
        operationId: expect.any(String),
        withOrigin: true,
      },
    });
    cleanup();
    client({
      projects: [
        { ...project, questions: ["Tell me about the last occasion."], questions_origin_id: id },
      ],
    });
    renderPage(page(Interview), "/interview");
    expect(await screen.findByLabelText("Question 1")).toHaveValue(
      "Tell me about the last occasion.",
    );
    fireEvent.click(await screen.findByText("AI draft origin"));
    expect(await screen.findByText("requested-model")).toBeVisible();
    expect(screen.getByText(/Current wording may include your edits/)).toBeVisible();
    expect(screen.getAllByText("Not reported")).toHaveLength(3);
  });
  it("does not save a generated question response with a missing receipt", async () => {
    client({ projects: [project] });
    h.gen.mockResolvedValue({ questions: ["Missing source"] });
    renderPage(page(Interview), "/interview");
    fireEvent.click(await screen.findByRole("button", { name: "Write my interview questions" }));
    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith(expect.stringContaining("origin is missing")),
    );
    expect(h.client.calls).toHaveLength(0);
    expect(screen.queryByLabelText("Question 1")).not.toBeInTheDocument();
  });
  it("persists a newly generated synthesis receipt and preserves it on later acceptance", async () => {
    client({
      projects: [project],
      interviews: Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        project_id: "p1",
        completed: true,
      })),
    });
    h.gen.mockResolvedValue({ originId: id, data: summary });
    renderPage(page(Learnings), "/learnings");
    fireEvent.click(await screen.findByRole("button", { name: "Summarize my interviews" }));
    await waitFor(() =>
      expect(h.client.calls).toContainEqual(
        expect.objectContaining({
          table: "learnings",
          op: "insert",
          payload: expect.objectContaining({
            data: summary,
            generation_origin_id: id,
            accepted: false,
          }),
        }),
      ),
    );
    cleanup();
    client({
      projects: [project],
      learnings: [
        {
          id: "l1",
          project_id: "p1",
          kind: "synthesis",
          stage: 1,
          accepted: false,
          data: summary,
          generation_origin_id: id,
        },
      ],
    });
    renderPage(page(Learnings), "/learnings");
    fireEvent.change(await screen.findByLabelText("Top problems"), {
      target: { value: "Human-reviewed interpretation" },
    });
    const buttons = await screen.findAllByRole("button");
    const accept = buttons.find((b) => /Accept/.test(b.textContent ?? ""));
    expect(accept).toBeDefined();
    fireEvent.click(accept!);
    await waitFor(() =>
      expect(h.client.calls).toContainEqual(
        expect.objectContaining({
          table: "learnings",
          op: "update",
          payload: expect.objectContaining({
            accepted: true,
            data: expect.objectContaining({ problems: ["Human-reviewed interpretation"] }),
          }),
        }),
      ),
    );
    expect(h.client.calls.find((c) => c.table === "learnings")?.payload).not.toHaveProperty(
      "generation_origin_id",
    );
  });
  it.each([2, 3])("saves stage %i as one atomic receipt-bound operation", async (stage) => {
    client({ projects: [{ ...project, stage }], outreach: [] });
    const data =
      stage === 2
        ? {
            channels: [{ title: "Campus", body: "Ask the organizer first" }],
            drafts: [{ title: "Invite", body: "Unsent invitation" }],
            survey: ["What happened?"],
          }
        : {
            channels: [],
            referral_asks: ["Ask for a suitable introduction"],
            onboarding_questions: ["Where did you stop?"],
          };
    h.gen.mockResolvedValue({ originId: id, data });
    renderPage(page(Outreach), "/outreach");
    fireEvent.click(
      await screen.findByRole("button", {
        name: stage === 2 ? "Create my outreach plan" : "Create my growth plan",
      }),
    );
    await waitFor(() =>
      expect(h.client.rpc).toHaveBeenCalledWith(
        "save_generated_outreach",
        expect.objectContaining({ p_project_id: "p1", p_stage: stage, p_origin_id: id }),
      ),
    );
    expect(h.client.calls).toHaveLength(0); // No delete/insert/update sequence in the browser.
    const call = h.client.rpc.mock.calls.find((c) => c[0] === "save_generated_outreach");
    if (stage === 2) expect(call?.[1].p_survey).toEqual(["What happened?"]);
    else expect(call?.[1]).not.toHaveProperty("p_survey");
  });
  it("reports atomic save failure without deleting the previous outreach plan", async () => {
    client({
      projects: [{ ...project, stage: 2 }],
      outreach: [
        {
          id: "o1",
          project_id: "p1",
          stage: 2,
          kind: "draft",
          title: "Saved invitation",
          body: "Preserve this reviewed text",
          generation_origin_id: null,
        },
      ],
    });
    h.client.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DATABASE FAILURE" } });
    h.gen.mockResolvedValue({ originId: id, data: { channels: [], drafts: [], survey: [] } });
    renderPage(page(Outreach), "/outreach");
    const body = await screen.findByLabelText("Saved invitation");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate plan (replaces drafts)" }));
    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith(
        "The new outreach plan could not be saved. Your previous saved plan is unchanged.",
      ),
    );
    expect(body).toHaveValue("Preserve this reviewed text");
    expect(h.client.calls).toHaveLength(0);
  });
});
