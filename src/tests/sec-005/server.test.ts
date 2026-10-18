import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  response: vi.fn(),
  getUser: vi.fn(),
  header: vi.fn(),
  headers: { authorization: "Bearer fixture.token.value" } as Record<string, string>,
  middlewareError: null as Error | null,
}));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: () => ({}) }),
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (value: unknown) => unknown) => ({
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
import {
  createInvitation,
  acceptInvitation,
  listInvitations,
  revokeInvitation,
} from "@/lib/invitations.functions";
import { takeInvitationFragment, createInvitationSchema } from "@/components/invitations/contracts";
const id = "f9500000-0000-4000-8000-000000000001";
const recipient = "f1000000-0000-4000-8000-000000000003";
const valid = {
  targetType: "project" as const,
  targetId: id,
  recipientId: recipient,
  role: "viewer" as const,
  requestId: id,
};
const metadata = {
  id,
  projectId: id,
  recipientId: recipient,
  role: "viewer",
  expiresAt: "2026-10-25T12:00:00+00:00",
  revokedAt: null,
  acceptedAt: null,
  createdAt: "2026-10-18T12:00:00+00:00",
};
const unknownCreate = createInvitation as unknown as (input: { data: unknown }) => Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  h.headers = { authorization: "Bearer fixture.token.value" };
  h.middlewareError = null;
  h.getUser.mockResolvedValue({
    error: null,
    data: { user: { id: "f1000000-0000-4000-8000-000000000001" } },
  });
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.response.mockResolvedValue({
    error: null,
    data: { ok: true, data: metadata, token: "a".repeat(64), replayed: false },
  });
});
describe("fixed invitation authorization and secret transport", () => {
  it("validates fresh identity and sends only fixed invitation fields", async () => {
    expect(await createInvitation({ data: valid })).toMatchObject({
      ok: true,
      token: "a".repeat(64),
    });
    expect(h.getUser).toHaveBeenCalledWith("fixture.token.value");
    expect(h.rpc).toHaveBeenCalledWith("create_project_invitation", {
      p_target_type: "project",
      p_project_id: id,
      p_recipient_id: recipient,
      p_role: "viewer",
      p_days: 7,
      p_request_id: id,
    });
    expect(h.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(h.header).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(h.header).toHaveBeenCalledWith("X-Robots-Tag", "noindex, nofollow");
  });
  it.each([
    { ...valid, role: "owner" },
    { ...valid, role: "admin" },
    { ...valid, role: "teacher" },
    { ...valid, actorId: recipient },
    { ...valid, expiresInDays: 31 },
    { ...valid, expiresInDays: 0 },
    { ...valid, token: "caller-secret" },
    { ...valid, targetType: "class", role: "teacher" },
  ])("rejects role/actor/secret smuggling before any RPC (%j)", async (data) => {
    expect(await unknownCreate({ data })).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("permits only the future student class shape and propagates disabled state", async () => {
    h.response.mockResolvedValue({ error: null, data: { ok: false, code: "FEATURE_DISABLED" } });
    expect(
      await createInvitation({ data: { ...valid, targetType: "class", role: "student" } }),
    ).toEqual({ ok: false, code: "FEATURE_DISABLED" });
    expect(
      createInvitationSchema.safeParse({ ...valid, targetType: "class", role: "editor" }).success,
    ).toBe(false);
  });
  it("does not invoke RPC for stale/deleted or changed identity", async () => {
    h.getUser.mockResolvedValue({ error: null, data: { user: { id: recipient } } });
    expect(await createInvitation({ data: valid })).toEqual({ ok: false, code: "AUTH_REQUIRED" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("retains create idempotence without reconstructing a plaintext token", async () => {
    h.response.mockResolvedValue({
      error: null,
      data: { ok: true, data: metadata, token: null, replayed: true },
    });
    expect(await createInvitation({ data: valid })).toMatchObject({
      ok: true,
      token: null,
      replayed: true,
    });
  });
  it.each([
    {
      ok: true,
      data: { ...metadata, tokenHash: "private" },
      token: "a".repeat(64),
      replayed: false,
    },
    { ok: true, data: { ...metadata, role: "admin" }, token: "a".repeat(64), replayed: false },
    { ok: true, data: metadata, token: "a".repeat(64), replayed: true },
    { ok: true, data: metadata, token: null, replayed: false },
  ])("fails closed on overbroad or contradictory output (%j)", async (data) => {
    h.response.mockResolvedValue({ error: null, data });
    expect(await createInvitation({ data: valid })).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("accepts a token without any caller-supplied role or recipient", async () => {
    h.response.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        data: { invitationId: id, projectId: id, role: "viewer", membershipRevision: 1 },
      },
    });
    expect(
      await acceptInvitation({ data: { targetType: "project", token: "a".repeat(64) } }),
    ).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("accept_project_invitation", {
      p_target_type: "project",
      p_token: "a".repeat(64),
    });
  });
  it("allows bounded owner listing and revocation independently of creation", async () => {
    h.response.mockResolvedValueOnce({
      error: null,
      data: { ok: true, data: { items: [metadata], nextCursor: null } },
    });
    expect(await listInvitations({ data: { projectId: id } })).toMatchObject({ ok: true });
    h.response.mockResolvedValueOnce({
      error: null,
      data: { ok: true, data: { ...metadata, revokedAt: "2026-10-18T12:01:00+00:00" } },
    });
    expect(
      await revokeInvitation({ data: { projectId: id, invitationId: id, requestId: id } }),
    ).toMatchObject({ ok: true });
  });
  it("normalizes middleware failures without exposing credentials or database details", async () => {
    h.middlewareError = new Error("Unauthorized: token details");
    expect(await createInvitation({ data: valid })).toEqual({ ok: false, code: "AUTH_REQUIRED" });
  });
  it("strips the fragment/query before a caller can start authentication", () => {
    const replaceState = vi.fn();
    expect(
      takeInvitationFragment(
        { hash: `#invite=${"a".repeat(64)}`, pathname: "/invite", search: "?tracking=unwanted" },
        { replaceState },
      ),
    ).toBe("a".repeat(64));
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/invite");
  });
  it.each(["#invite=bad", `#invite=${"a".repeat(64)}&role=owner`, "", "#token=secret"])(
    "rejects malformed fragments, never accepting a query secret (%s)",
    (hash) => {
      const replaceState = vi.fn();
      expect(
        takeInvitationFragment(
          { hash, pathname: "/invite", search: `?invite=${"a".repeat(64)}` },
          { replaceState },
        ),
      ).toBeNull();
      expect(replaceState).toHaveBeenCalledWith(null, "", "/invite");
    },
  );
});
