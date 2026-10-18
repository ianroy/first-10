import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  response: vi.fn(),
  getUser: vi.fn(),
  header: vi.fn(),
  headers: { authorization: "Bearer fixture.token.value" } as Record<string, string>,
  middlewareError: null as Error | null,
}));
vi.mock("@tanstack/react-start", () => ({
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
                supabase: { rpc: h.rpc, auth: { getUser: h.getUser } },
                userId: "f1000000-0000-4000-8000-000000000001",
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
import {
  getMemberProjectSummary,
  listProjectMembers,
  setProjectMember,
  revokeProjectMember,
} from "@/lib/membership.functions";
import { resolveProjectRole } from "@/lib/permissions/project-membership.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const projectId = "f2000000-0000-4000-8000-000000000001";
const targetUserId = "f1000000-0000-4000-8000-000000000003";
const requestId = "f6000000-0000-4000-8000-000000000001";
const valid = { projectId, targetUserId, role: "editor" as const, expectedRevision: 0, requestId };
const member = {
  id: requestId,
  projectId,
  userId: targetUserId,
  role: "editor",
  state: "active",
  revision: 1,
  createdAt: "2026-10-18T12:00:00+00:00",
  updatedAt: "2026-10-18T12:00:00+00:00",
};
const setUnknown = setProjectMember as unknown as (input: { data: unknown }) => Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  h.headers = { authorization: "Bearer fixture.token.value" };
  h.middlewareError = null;
  h.getUser.mockResolvedValue({
    data: { user: { id: "f1000000-0000-4000-8000-000000000001", app_metadata: { role: "admin" } } },
    error: null,
  });
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.response.mockResolvedValue({ data: { ok: true, data: member }, error: null });
});
it.each([
  {},
  null,
  { ...valid, role: "owner" },
  { ...valid, role: "admin" },
  { ...valid, role: "teacher" },
  { ...valid, actorId: targetUserId },
  { ...valid, includePrivate: true },
  { ...valid, targetUserId: "not-a-uuid" },
  { ...valid, expectedRevision: -1 },
  { ...valid, expectedRevision: 0.5 },
  { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER },
  { ...valid, requestId: "bad" },
])("strict input rejects privilege/schema forgery before I/O", async (data) => {
  expect(await setUnknown({ data })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(h.getUser).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
});
it("uses verified caller context, preserves intent and maps only bounded mutation fields", async () => {
  expect(await setProjectMember({ data: valid })).toEqual({ ok: true, data: member, requestId });
  expect(h.getUser).toHaveBeenCalledWith("fixture.token.value");
  expect(h.rpc).toHaveBeenCalledWith("set_project_member", {
    p_project_id: projectId,
    p_target_user_id: targetUserId,
    p_role: "editor",
    p_expected_revision: 0,
    p_request_id: requestId,
  });
  expect(h.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
});
it("rejects fresh authentication failure or identity mismatch even when old claims passed", async () => {
  for (const response of [
    { data: { user: null }, error: new Error("expired") },
    { data: { user: { id: targetUserId } }, error: null },
  ]) {
    h.getUser.mockResolvedValueOnce(response);
    expect(await setProjectMember({ data: valid })).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
  }
  expect(h.rpc).not.toHaveBeenCalled();
});
it("rejects missing bearer and oversized request before network access", async () => {
  h.headers = {};
  expect(await setProjectMember({ data: valid })).toMatchObject({
    ok: false,
    error: { code: "AUTH_REQUIRED" },
  });
  h.headers = { authorization: "Bearer fixture.token.value", "content-length": "9000" };
  expect(await setProjectMember({ data: valid })).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("returns safe errors without database message/PII and rejects expanded projections", async () => {
  for (const response of [
    { data: { ok: true, data: { ...member, email: "private@example.invalid" } }, error: null },
    { data: null, error: { message: "secret SQL detail" } },
    { data: { ok: false, code: "NOT_FOUND", email: "private@example.invalid" }, error: null },
  ]) {
    h.response.mockResolvedValueOnce(response);
    expect(await setProjectMember({ data: valid })).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
  }
});
it("retains the shared CAS error and same request id for deliberate reconciliation", async () => {
  h.response.mockResolvedValue({
    data: { ok: false, code: "REVISION_CONFLICT", currentRevision: 7 },
    error: null,
  });
  expect(await setProjectMember({ data: valid })).toEqual({
    ok: false,
    error: {
      code: "REVISION_CONFLICT",
      message: "Membership changed. Refresh before trying again.",
      retryable: false,
      currentRevision: 7,
    },
    requestId,
  });
});
it("returns exactly the six-field summary and fails closed if backend adds private content", async () => {
  const summary = {
    id: projectId,
    name: "Approved shared title",
    role: "viewer",
    archivedAt: null,
    updatedAt: member.updatedAt,
    membershipRevision: 2,
  };
  h.response.mockResolvedValueOnce({ data: { ok: true, data: summary }, error: null });
  expect(await getMemberProjectSummary({ data: { projectId } })).toMatchObject({
    ok: true,
    data: summary,
  });
  h.response.mockResolvedValueOnce({
    data: { ok: true, data: { ...summary, checklist: { private: true } } },
    error: null,
  });
  expect(await getMemberProjectSummary({ data: { projectId } })).toMatchObject({
    ok: false,
    error: { code: "UNAVAILABLE" },
  });
});
it("checks current membership on every read; revoked access does not reuse previous result", async () => {
  h.response
    .mockResolvedValueOnce({
      data: { ok: true, data: { items: [member], nextCursor: null } },
      error: null,
    })
    .mockResolvedValueOnce({ data: { ok: false, code: "NOT_FOUND" }, error: null });
  expect(await listProjectMembers({ data: { projectId } })).toMatchObject({
    ok: true,
    data: { items: [member] },
  });
  expect(await listProjectMembers({ data: { projectId } })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(h.getUser).toHaveBeenCalledTimes(2);
  expect(h.rpc).toHaveBeenCalledTimes(2);
});
it("revoke has no caller-chosen role and carries exact CAS scope", async () => {
  h.response.mockResolvedValueOnce({
    data: { ok: true, data: { ...member, state: "revoked", revision: 2 } },
    error: null,
  });
  expect(
    await revokeProjectMember({
      data: { projectId, targetUserId, expectedRevision: 1, requestId },
    }),
  ).toMatchObject({ ok: true, data: { state: "revoked", revision: 2 } });
  expect(h.rpc).toHaveBeenCalledWith("revoke_project_member", {
    p_project_id: projectId,
    p_target_user_id: targetUserId,
    p_expected_revision: 1,
    p_request_id: requestId,
  });
});
it("handles middleware and network failures without private diagnostics", async () => {
  h.middlewareError = new Error("Unauthorized: stale session");
  expect(await setProjectMember({ data: valid })).toMatchObject({
    ok: false,
    error: { code: "AUTH_REQUIRED" },
  });
  h.middlewareError = null;
  h.getUser.mockRejectedValueOnce(new Error("private diagnostics"));
  expect(await setProjectMember({ data: valid })).toMatchObject({
    ok: false,
    error: { code: "UNAVAILABLE" },
  });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("protected helper resolves database role instead of administrator metadata", async () => {
  const context = {
    supabase: { rpc: h.rpc, auth: { getUser: h.getUser } } as unknown as SupabaseClient<Database>,
    userId: "f1000000-0000-4000-8000-000000000001",
  };
  h.response.mockResolvedValueOnce({ data: "viewer", error: null });
  expect(await resolveProjectRole(context, projectId, "fixture.token.value")).toBe("viewer");
  h.response.mockResolvedValueOnce({ data: null, error: null });
  expect(await resolveProjectRole(context, projectId, "fixture.token.value")).toBeNull();
  h.getUser.mockResolvedValueOnce({ data: { user: { id: targetUserId } }, error: null });
  expect(await resolveProjectRole(context, projectId, "fixture.token.value")).toBeNull();
  expect(h.rpc).toHaveBeenCalledTimes(2);
});
