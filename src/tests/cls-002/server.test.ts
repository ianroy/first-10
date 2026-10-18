import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  response: vi.fn(),
  getUser: vi.fn(),
  header: vi.fn(),
  headers: { authorization: "Bearer fixture.token" } as Record<string, string>,
  middlewareError: null as Error | null,
}));
const actor = "f1000000-0000-4000-8000-000000000001";
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: () => ({}) }),
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (v: unknown) => unknown) => ({
        handler:
          (fn: (arg: unknown) => unknown) =>
          async ({ data }: { data: unknown }) => {
            if (h.middlewareError) throw h.middlewareError;
            return fn({
              data: validate(data),
              context: {
                userId: "f1000000-0000-4000-8000-000000000001",
                supabase: { auth: { getUser: h.getUser }, rpc: h.rpc },
              },
            });
          },
      }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://fixture.invalid", { headers: h.headers }),
  setResponseHeader: h.header,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import * as api from "@/lib/submissions.functions";
const id = "c2120000-0000-4000-8000-000000000001",
  other = "c2120000-0000-4000-8000-000000000002";
const payload = {
  schemaVersion: 1,
  title: "Selected learning",
  interpretation: "Reported",
  uncertainty: "Unverified",
  decision: "Test",
  nextAction: "Interview",
  excerpts: [
    {
      key: "excerpt.1",
      label: "Own idea - problem",
      text: "Selected text",
      sourceKind: "project",
      evidenceLabel: "Owner-reported; selected and reviewed",
    },
  ],
};
const header = {
  id,
  threadId: id,
  classId: id,
  assignmentId: id,
  version: 1,
  sourceType: "account_project",
  audience: "teacher",
  authorLabel: "Learner alias",
  submittedAt: "2026-10-18T12:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: payload.title,
};
const view = { ...header, payload };
const spec = {
  source: { type: "account_project", projectId: other },
  classId: id,
  assignmentId: id,
  threadId: id,
  requestId: id,
  audience: "teacher",
  selections: [{ kind: "project", recordId: other, field: "problem" }],
  redactions: [],
  reflection: {
    title: payload.title,
    interpretation: "",
    uncertainty: "",
    decision: "",
    nextAction: "",
  },
};
const preview = {
  id,
  hash: "a".repeat(64),
  threadId: id,
  expiresAt: "2026-10-18T12:10:00Z",
  audience: "teacher",
  teacherVisibleFields: ["title", "excerpts"],
  payload,
};
const call = (fn: unknown, data: unknown) =>
  (fn as (v: { data: never }) => Promise<unknown>)({ data: data as never });
beforeEach(() => {
  vi.clearAllMocks();
  h.headers = { authorization: "Bearer fixture.token" };
  h.middlewareError = null;
  h.getUser.mockResolvedValue({ error: null, data: { user: { id: actor } } });
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.response.mockResolvedValue({ error: null, data: { ok: false, code: "NOT_FOUND" } });
});
describe("strict reviewed submissions server boundary", () => {
  it.each([
    [api.previewSubmission, spec, "preview_class_submission", { p_document: spec }, preview],
    [
      api.submitSnapshot,
      { previewId: id, previewHash: preview.hash, requestId: other },
      "confirm_class_submission",
      { p_preview_id: id, p_preview_hash: preview.hash, p_request_id: other },
      view,
    ],
    [
      api.getOwnSubmission,
      { snapshotId: id },
      "get_own_class_submission",
      { p_snapshot_id: id },
      view,
    ],
    [
      api.getTeacherSubmission,
      { classId: other, snapshotId: id },
      "get_teacher_class_submission",
      { p_class_id: other, p_snapshot_id: id },
      view,
    ],
    [
      api.listMySubmissions,
      {},
      "list_own_class_submissions",
      { p_class_id: null, p_cursor: null },
      { items: [header], nextCursor: null },
    ],
    [
      api.listTeacherSubmissions,
      { classId: id, assignmentId: other, cursor: other },
      "list_teacher_class_submissions",
      { p_class_id: id, p_assignment_id: other, p_cursor: other },
      { items: [header], nextCursor: null },
    ],
    [
      api.withdrawSubmission,
      { snapshotId: id, requestId: other },
      "withdraw_class_submission",
      { p_snapshot_id: id, p_request_id: other },
      { ...header, grantState: "withdrawn", grantRevision: 2 },
    ],
  ])("uses fresh actor and fixed RPC (%s)", async (fn, input, name, args, data) => {
    h.response.mockResolvedValue({ error: null, data: { ok: true, data } });
    expect(await call(fn, input)).toEqual({ ok: true, data });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
    expect(h.getUser).toHaveBeenCalledWith("fixture.token");
    expect(h.response).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it.each([
    { ...spec, actorId: actor },
    { ...spec, source: { type: "guest_team", projectId: other } },
    { ...spec, selections: [] },
    { ...spec, selections: Array(13).fill(spec.selections[0]) },
    { ...spec, reflection: { ...spec.reflection, privateNote: "hidden" } },
    { ...spec, redactions: ["x".repeat(201)] },
  ])("rejects forged or unbounded preview input", async (data) => {
    expect(await call(api.previewSubmission, data)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { id: other }])("denies missing/switched verified actor", async (user) => {
    h.getUser.mockResolvedValue({ error: null, data: { user } });
    expect(await api.getOwnSubmission({ data: { snapshotId: id } })).toEqual({
      ok: false,
      code: "AUTH_REQUIRED",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects absent auth and oversized requests", async () => {
    h.headers = {};
    expect(await api.getOwnSubmission({ data: { snapshotId: id } })).toEqual({
      ok: false,
      code: "AUTH_REQUIRED",
    });
    h.headers = { authorization: "Bearer fixture.token", "content-length": "65537" };
    expect(await api.getOwnSubmission({ data: { snapshotId: id } })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...view, authorId: actor },
    { ...view, projectId: other },
    { ...view, manifest: [] },
    { ...view, payload: { ...payload, rawNotes: "private" } },
    { ...view, payload: { ...payload, excerpts: [{ ...payload.excerpts[0], key: other }] } },
  ])("fails closed on extra private fields or source UUID presentation keys", async (data) => {
    h.response.mockResolvedValue({ error: null, data: { ok: true, data } });
    expect(await api.getTeacherSubmission({ data: { classId: id, snapshotId: id } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("preserves bounded denial and hides database exception contents", async () => {
    h.response.mockResolvedValue({ error: null, data: { ok: false, code: "CHANGED" } });
    expect(await api.getOwnSubmission({ data: { snapshotId: id } })).toEqual({
      ok: false,
      code: "CHANGED",
    });
    h.response.mockRejectedValue(new Error("secret SQL source text"));
    expect(await api.getOwnSubmission({ data: { snapshotId: id } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    h.middlewareError = new Error("Unauthorized: private");
    expect(await api.listMySubmissions({ data: {} })).toEqual({ ok: false, code: "AUTH_REQUIRED" });
  });
});
