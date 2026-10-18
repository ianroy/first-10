import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  request: new Request("https://firstten.invalid/join", {
    method: "POST",
    headers: { origin: "https://firstten.invalid" },
  }),
  cookies: new Map<string, string>(),
  headers: vi.fn(),
  rpc: vi.fn(),
  response: vi.fn(),
  context: {
    userId: "fc080000-0000-4000-8000-000000000001",
    supabase: { auth: { getUser: vi.fn() }, rpc: vi.fn() },
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => h.request,
  getCookie: (name: string) => h.cookies.get(name),
  setCookie: (name: string, value: string) => h.cookies.set(name, value),
  setResponseHeader: h.headers,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      inputValidator: () => chain,
      middleware: () => chain,
      handler: (f: (args: unknown) => unknown) => (args: { data: unknown }) =>
        f({ ...args, context: h.context }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { issueCsrf } from "@/lib/guest-spaces/security.server";
import { createEmptyGuestLearning } from "@/lib/guest-activities/contracts";
import {
  listGuestActivities,
  loadGuestActivity,
  saveGuestActivity,
  previewGuestSubmission,
  confirmGuestSubmission,
  getGuestSubmission,
  listGuestSubmissions,
  withdrawGuestSubmission,
} from "@/lib/guest-activities/functions";
import {
  getTeacherGuestSubmission,
  listTeacherGuestSubmissions,
} from "@/lib/guest-activities/teacher.functions";
const id = "fc080000-0000-4000-8000-000000000001";
const session = "b".repeat(64);
let csrf: string;
beforeEach(() => {
  vi.clearAllMocks();
  h.cookies.clear();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-service-only-key");
  vi.stubEnv("SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("NODE_ENV", "test");
  h.request = new Request("https://firstten.invalid/join", {
    method: "POST",
    headers: {
      origin: "https://firstten.invalid",
      "sec-fetch-site": "same-origin",
      authorization: "Bearer fictional-account-token",
    },
  });
  h.cookies.set("__Host-firstten_guest", session);
  csrf = issueCsrf();
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.context.supabase.rpc.mockReturnValue({ abortSignal: h.response });
  h.context.supabase.auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  h.response.mockResolvedValue({ data: { ok: false, code: "NOT_FOUND" }, error: null });
});
describe("guest fixed-operation cookie transport", () => {
  it.each([
    ["list", () => listGuestActivities({ data: { csrf } }), "list_guest_learning_activities"],
    [
      "load",
      () => loadGuestActivity({ data: { csrf, activityId: id } }),
      "load_guest_learning_activity",
    ],
    [
      "save",
      () =>
        saveGuestActivity({
          data: {
            csrf,
            activityId: id,
            audience: "principal_private",
            expectedRevision: 0,
            mutationId: id,
            sharedAudienceConfirmed: false,
            document: createEmptyGuestLearning(),
          },
        }),
      "save_guest_learning_activity",
    ],
    [
      "preview",
      () =>
        previewGuestSubmission({
          data: {
            csrf,
            activityId: id,
            assignmentId: id,
            threadId: id,
            requestId: id,
            audience: "teacher",
            selections: [{ kind: "discovery", recordId: id, field: "problem" }],
            redactions: [],
            reflection: {
              title: "Fictional review",
              interpretation: "",
              uncertainty: "",
              decision: "",
              nextAction: "",
            },
          },
        }),
      "preview_guest_learning_submission",
    ],
    [
      "confirm",
      () =>
        confirmGuestSubmission({
          data: { csrf, previewId: id, previewHash: "a".repeat(64), requestId: id },
        }),
      "confirm_guest_learning_submission",
    ],
    [
      "read",
      () => getGuestSubmission({ data: { csrf, snapshotId: id, mode: "author" } }),
      "get_guest_learning_submission",
    ],
    [
      "list copies",
      () => listGuestSubmissions({ data: { csrf, mode: "team" } }),
      "list_guest_learning_submissions",
    ],
    [
      "withdraw",
      () => withdrawGuestSubmission({ data: { csrf, snapshotId: id, requestId: id } }),
      "withdraw_guest_learning_submission",
    ],
  ] as const)("%s uses only the fixed operation and HttpOnly session", async (_name, run, rpc) => {
    expect(await run()).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(h.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ p_session: session }));
    const args = h.rpc.mock.calls[0]![1];
    expect(args).not.toHaveProperty("csrf");
    expect(args).not.toHaveProperty("userId");
    expect(args).not.toHaveProperty("projectId");
    expect(JSON.stringify(args)).not.toContain(csrf);
    expect(h.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it.each([
    {},
    { origin: "https://attacker.invalid" },
    { origin: "https://firstten.invalid", "sec-fetch-site": "cross-site" },
  ])("rejects wrong/missing origins without any RPC", async (headers) => {
    h.request = new Request("https://firstten.invalid/join", { method: "POST", headers });
    expect(await listGuestActivities({ data: { csrf } })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing session even with signed entry CSRF", async () => {
    h.cookies.delete("__Host-firstten_guest");
    csrf = issueCsrf();
    expect(await listGuestActivities({ data: { csrf } })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("binds CSRF to the current session and rejects a replay after identity recovery", async () => {
    h.cookies.set("__Host-firstten_guest", "c".repeat(64));
    expect(await listGuestActivities({ data: { csrf } })).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects forged principal/owner additions", async () => {
    expect(await listGuestActivities({ data: { csrf, principalId: id } as never })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects declared oversized bodies before database work", async () => {
    h.request = new Request("https://firstten.invalid/join", {
      method: "POST",
      headers: { origin: "https://firstten.invalid", "content-length": "307201" },
    });
    expect(await listGuestActivities({ data: { csrf } })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects unexpectedly broad response DTOs", async () => {
    h.response.mockResolvedValue({
      error: null,
      data: { ok: true, data: [], privateNotes: "Should never return" },
    });
    expect(await listGuestActivities({ data: { csrf } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("returns failure rather than raw database/provider messages", async () => {
    h.response.mockResolvedValue({ error: { message: "private database data" }, data: null });
    expect(await listGuestActivities({ data: { csrf } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("accepts a properly bounded success list and never calls AI", async () => {
    h.response.mockResolvedValue({ data: { ok: true, data: [] }, error: null });
    expect(await listGuestActivities({ data: { csrf } })).toEqual({ ok: true, data: [] });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
describe("teacher guest-snapshot bearer authority", () => {
  it("rechecks current bearer identity before an authenticated guest snapshot read", async () => {
    await getTeacherGuestSubmission({ data: { classId: id, snapshotId: id } });
    expect(h.context.supabase.auth.getUser).toHaveBeenCalledWith("fictional-account-token");
    expect(h.context.supabase.rpc).toHaveBeenCalledWith("get_teacher_guest_learning_submission", {
      p_class_id: id,
      p_snapshot_id: id,
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("never accepts stale/fresh identity mismatch", async () => {
    h.context.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "fc080000-0000-4000-8000-000000000002" } },
      error: null,
    });
    expect(await listTeacherGuestSubmissions({ data: { classId: id } })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(h.context.supabase.rpc).not.toHaveBeenCalled();
  });
  it("requires a concrete class and cannot fall back to all private work", async () => {
    expect(await listTeacherGuestSubmissions({ data: {} as never })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.context.supabase.rpc).not.toHaveBeenCalled();
  });
});
