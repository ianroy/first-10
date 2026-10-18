import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  header: "Bearer fixture",
  getUser: vi.fn(),
  rpc: vi.fn(),
  abort: vi.fn(),
  setHeader: vi.fn(),
  context: {} as unknown,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (parse: (v: unknown) => unknown) => ({
        handler: (fn: (v: unknown) => unknown) => (args: { data: unknown }) =>
          fn({ ...args, data: parse(args.data), context: h.context }),
      }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://fixture.invalid/draft", { headers: { authorization: h.header } }),
  setResponseHeader: h.setHeader,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import {
  createInterviewDraft,
  loadInterviewDraft,
  listInterviewDrafts,
  saveInterviewDraft,
  completeInterviewDraft,
} from "@/lib/interview-drafts.functions";
import {
  emptyInterviewDraft,
  interviewDraftDocumentSchema,
  interviewDraftRecordSchema,
  createDraftSchema,
} from "@/lib/interview-drafts";
const owner = "f1640000-0000-4000-8000-000000000001",
  project = "f1640000-0000-4000-8000-000000000002",
  draftId = "f1640000-0000-4000-8000-000000000003",
  iv = "f1640000-0000-4000-8000-000000000004",
  stamp = "2026-10-18T12:00:00+00:00";
const scope = { projectId: project, draftId };
const doc = emptyInterviewDraft([" Élodie: what happened last time? "]);
const record = {
  id: draftId,
  projectId: project,
  contactId: null,
  revision: 1,
  status: "active",
  questions: doc.answers.map((a) => a.q),
  originId: null,
  createdAt: stamp,
  savedAt: stamp,
  completedAt: null,
  interviewId: null,
  document: doc,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.header = "Bearer fixture";
  h.context = { userId: owner, supabase: { auth: { getUser: h.getUser }, rpc: h.rpc } };
  h.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  h.abort.mockResolvedValue({ data: { ok: true, draft: record }, error: null });
  h.rpc.mockReturnValue({ abortSignal: h.abort });
});
afterEach(() => vi.useRealTimers());
describe("private interview draft contracts and transport", () => {
  it("starts unknown and preserves exact Unicode question whitespace", () => {
    expect(doc.choices).toEqual({
      noteStatus: "unknown",
      aiStatus: "unknown",
      sharingStatus: "unknown",
    });
    expect(doc.answers[0]!.q).toBe(" Élodie: what happened last time? ");
    expect(interviewDraftDocumentSchema.parse(doc)).toEqual(doc);
  });
  it.each(["unknown", "declined", "withdrawn"] as const)(
    "blocks persisted notes without granted note permission: %s",
    (status) => {
      const d = structuredClone(doc);
      d.choices.noteStatus = status;
      d.answers[0]!.note = "Do not persist without permission";
      expect(interviewDraftDocumentSchema.safeParse(d).success).toBe(false);
      d.answers[0]!.note = "";
      expect(interviewDraftDocumentSchema.safeParse(d).success).toBe(true);
    },
  );
  it("rejects extra authorization fields, oversized answers and invalid progress", () => {
    expect(
      createDraftSchema.safeParse({
        ...scope,
        contactId: null,
        expectedQuestions: ["Q"],
        expectedOriginId: null,
        noteStatus: "unknown",
        userId: owner,
      }).success,
    ).toBe(false);
    expect(interviewDraftDocumentSchema.safeParse({ ...doc, currentQuestion: 2 }).success).toBe(
      false,
    );
    const d = structuredClone(doc);
    d.answers[0]!.note = "x".repeat(6001);
    d.choices.noteStatus = "granted";
    expect(interviewDraftDocumentSchema.safeParse(d).success).toBe(false);
  });
  it("rejects active/complete lifecycle contradictions and altered question snapshots", () => {
    expect(interviewDraftRecordSchema.safeParse(record).success).toBe(true);
    expect(
      interviewDraftRecordSchema.safeParse({ ...record, questions: ["Changed"] }).success,
    ).toBe(false);
    expect(interviewDraftRecordSchema.safeParse({ ...record, status: "completed" }).success).toBe(
      false,
    );
    expect(
      interviewDraftRecordSchema.safeParse({
        ...record,
        status: "completed",
        document: null,
        interviewId: iv,
        completedAt: stamp,
      }).success,
    ).toBe(true);
  });
  it("freshly verifies identity, uses no-store and passes an abort signal to the private load RPC", async () => {
    expect(await loadInterviewDraft({ data: scope })).toEqual({ ok: true, draft: record });
    expect(h.getUser).toHaveBeenCalledWith("fixture");
    expect(h.rpc).toHaveBeenCalledWith("load_interview_draft", {
      p_project_id: project,
      p_draft_id: draftId,
    });
    expect(h.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(h.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it.each(["", "Basic fixture", "Bearer two tokens"])(
    "denies malformed authorization %s before database access",
    async (header) => {
      h.header = header;
      expect(await loadInterviewDraft({ data: scope })).toMatchObject({
        ok: false,
        code: "UNAUTHENTICATED",
      });
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects a stale identity even when middleware supplied an owner", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    expect(await loadInterviewDraft({ data: scope })).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("bounds stalled fresh authentication without starting a mutation", async () => {
    vi.useFakeTimers();
    h.getUser.mockImplementation(() => new Promise(() => {}));
    const pending = loadInterviewDraft({ data: scope });
    await vi.advanceTimersByTimeAsync(15001);
    expect(await pending).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("creates with explicit saved source comparison and permits completed replay only as a receipt", async () => {
    const completed = {
      ...record,
      status: "completed",
      document: null,
      interviewId: iv,
      completedAt: stamp,
    };
    h.abort.mockResolvedValue({ data: { ok: true, draft: completed }, error: null });
    expect(
      await createInterviewDraft({
        data: {
          ...scope,
          contactId: null,
          expectedQuestions: record.questions,
          expectedOriginId: null,
          noteStatus: "unknown",
        },
      }),
    ).toEqual({ ok: true, draft: completed });
    expect(h.rpc).toHaveBeenCalledWith(
      "create_interview_draft",
      expect.objectContaining({
        p_expected_questions: record.questions,
        p_expected_origin_id: null,
        p_note_status: "unknown",
      }),
    );
  });
  it("saves only explicit scope, revision, stable mutation and current document", async () => {
    await saveInterviewDraft({
      data: { ...scope, expectedRevision: 1, mutationId: iv, contactId: null, document: doc },
    });
    expect(h.rpc).toHaveBeenCalledWith("save_interview_draft", {
      p_project_id: project,
      p_draft_id: draftId,
      p_expected_revision: 1,
      p_mutation_id: iv,
      p_contact_id: null,
      p_document: doc,
    });
  });
  it("completion carries only the reviewed revision, never caller answers or a new capture request ID", async () => {
    h.abort.mockResolvedValue({
      data: { ok: true, interviewId: iv, replayed: true, completedRevision: 2 },
      error: null,
    });
    expect(await completeInterviewDraft({ data: { ...scope, expectedRevision: 2 } })).toMatchObject(
      { ok: true, replayed: true },
    );
    expect(h.rpc).toHaveBeenCalledWith("complete_interview_draft", {
      p_project_id: project,
      p_draft_id: draftId,
      p_expected_revision: 2,
    });
  });
  it("list output rejects leaked private note payloads and transport errors remain redacted", async () => {
    h.abort.mockResolvedValue({
      data: {
        ok: true,
        drafts: [
          {
            id: draftId,
            contactId: null,
            revision: 1,
            savedAt: stamp,
            questionCount: 1,
            answeredCount: 0,
            note: "PRIVATE",
          },
        ],
      },
      error: null,
    });
    expect(await listInterviewDrafts({ data: { projectId: project } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    h.abort.mockRejectedValue(new Error("PRIVATE_DATABASE_ERROR"));
    expect(await loadInterviewDraft({ data: scope })).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
});
