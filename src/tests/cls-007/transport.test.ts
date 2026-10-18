import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  request: new Request("https://firstten.invalid/join", {
    method: "POST",
    headers: { origin: "https://firstten.invalid", "sec-fetch-site": "same-origin" },
  }),
  cookies: new Map<string, string>(),
  setCookie: vi.fn(),
  headers: vi.fn(),
  rpc: vi.fn(),
  response: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => h.request,
  getCookie: (name: string) => h.cookies.get(name),
  setCookie: (name: string, value: string, options: unknown) => {
    h.setCookie(name, value, options);
    h.cookies.set(name, value);
  },
  setResponseHeader: h.headers,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { bootstrapGuest, exchangeGuest, manageGuest } from "@/lib/guest-spaces/server";
import { admissionClientHash, sameOrigin, verifyCsrf } from "@/lib/guest-spaces/security.server";
const id = "fc070000-0000-4000-8000-000000000001";
const view = {
  classId: id,
  className: "Workshop",
  mode: "hackathon",
  instructions: "Test with real people",
  accessExpiresAt: "2026-11-18T12:00:00Z",
  retentionDays: 30,
  aiEnabled: false,
  teamId: id,
  teamAlias: "Team A",
  principalId: id,
  principalAlias: "Learner A",
  assignments: [],
};
const session = "c".repeat(64);
const raw = {
  ok: true,
  data: view,
  sessionToken: session,
  sessionExpiresAt: "2026-10-19T12:00:00Z",
  secrets: {
    principalRecovery: "d".repeat(64),
    teamReturn: "e".repeat(64),
    teamInvite: "f".repeat(64),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.cookies.clear();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-service-only-key");
  vi.stubEnv("SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("VERCEL", "0");
  vi.stubEnv("NODE_ENV", "test");
  h.request = new Request("https://firstten.invalid/join", {
    method: "POST",
    headers: { origin: "https://firstten.invalid", "sec-fetch-site": "same-origin" },
  });
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.response.mockResolvedValue({ error: null, data: raw });
});
async function csrf() {
  const result = await bootstrapGuest({});
  if (!result.ok) throw new Error("Fixture bootstrap failed");
  return result.csrf;
}
async function enter(token?: string) {
  token ??= await csrf();
  return exchangeGuest({
    kind: "entry",
    token: "a".repeat(64),
    teamAlias: "Team",
    principalAlias: "",
    csrf: token,
  });
}
describe("guest HTTP authorization", () => {
  it.each([
    { origin: "https://attacker.invalid" },
    {},
    { origin: "https://firstten.invalid", "sec-fetch-site": "cross-site" },
    { origin: "http://firstten.invalid" },
  ])(
    "rejects a public mutation outside exact same origin before cookies or RPC",
    async (headers) => {
      h.request = new Request("https://firstten.invalid/join", { method: "POST", headers });
      expect(await bootstrapGuest({})).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.setCookie).not.toHaveBeenCalled();
    },
  );
  it("requires POST and secure production transport, with localhost-only development cookie handling", async () => {
    expect(
      sameOrigin(
        new Request("https://firstten.invalid/join", {
          headers: { origin: "https://firstten.invalid" },
        }),
      ),
    ).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    h.request = new Request("http://localhost:3000/join", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(await bootstrapGuest({})).toEqual({ ok: false, code: "FORBIDDEN" });
    vi.stubEnv("NODE_ENV", "development");
    expect((await bootstrapGuest({})).ok).toBe(true);
    expect(h.setCookie).toHaveBeenCalledWith(
      "firstten_guest_csrf_dev",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: "strict", path: "/" }),
    );
  });
  it("uses hash-derived CSRF and sends raw session exclusively in a host-only HttpOnly cookie", async () => {
    const before = await csrf();
    const result = await enter(before);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(session);
    expect(h.setCookie).toHaveBeenCalledWith(
      "__Host-firstten_guest",
      session,
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict", path: "/" }),
    );
    const options = h.setCookie.mock.calls.find((call) => call[0] === "__Host-firstten_guest")?.[2];
    expect(options).not.toHaveProperty("domain");
    expect(verifyCsrf(before)).toBe(false);
    expect(h.rpc).toHaveBeenCalledWith(
      "exchange_guest_entry",
      expect.objectContaining({ p_kind: "entry", p_principal_alias: "" }),
    );
    expect(h.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(h.headers).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
  });
  it("rejects CSRF replay after session rotation before service dispatch", async () => {
    const old = await csrf();
    const result = await enter(old);
    expect(result.ok).toBe(true);
    h.rpc.mockClear();
    expect(
      await exchangeGuest({
        kind: "entry",
        token: "a".repeat(64),
        teamAlias: "",
        principalAlias: "",
        csrf: old,
      }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("requires server cookie and rejects role/principal/session smuggling", async () => {
    const token = await csrf();
    expect(
      await exchangeGuest({
        kind: "entry",
        token: "a".repeat(64),
        teamAlias: "",
        principalAlias: "",
        csrf: token,
        principalId: id,
      }),
    ).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await manageGuest({ operation: "team_invite", csrf: token })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("clears an explicitly expired/revoked database session instead of leaving a stale cookie", async () => {
    h.cookies.set("__Host-firstten_guest", session);
    h.response.mockResolvedValue({ error: null, data: { ok: false, code: "NOT_FOUND" } });
    const result = await bootstrapGuest({});
    expect(result).toMatchObject({ ok: true, data: null });
    expect(h.setCookie).toHaveBeenCalledWith(
      "__Host-firstten_guest",
      "",
      expect.objectContaining({ maxAge: 0, httpOnly: true, secure: true }),
    );
  });
  it("fails closed on secret-bearing or contradictory projections and normalizes private failures", async () => {
    const token = await csrf();
    h.response.mockResolvedValueOnce({
      error: null,
      data: { ...raw, data: { ...view, roster: [id] } },
    });
    expect(await enter(token)).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(h.setCookie.mock.calls.some((call) => call[0] === "__Host-firstten_guest")).toBe(false);
    h.response.mockRejectedValue(new Error("private query token secret"));
    expect(await enter(token)).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("ends only the current cookie session, returning a newly bound entry CSRF", async () => {
    const result = await enter();
    if (!result.ok) throw new Error("Fixture join");
    h.response.mockResolvedValue({ error: null, data: { ok: true } });
    expect(await manageGuest({ operation: "logout", csrf: result.csrf })).toMatchObject({
      ok: true,
      token: null,
    });
    expect(h.rpc).toHaveBeenLastCalledWith("manage_guest_session", {
      p_session: session,
      p_operation: "logout",
    });
    expect(h.setCookie).toHaveBeenCalledWith(
      "__Host-firstten_guest",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
  it("ignores arbitrary forwarded headers and shares an unknown-client bucket off Vercel", () => {
    const a = admissionClientHash(
      new Request("https://firstten.invalid", {
        headers: { "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "5.6.7.8" },
      }),
    );
    const b = admissionClientHash(
      new Request("https://firstten.invalid", { headers: { "x-forwarded-for": "9.9.9.9" } }),
    );
    expect(a).toBe(b);
    vi.stubEnv("VERCEL", "1");
    const trusted = admissionClientHash(
      new Request("https://firstten.invalid", {
        headers: { "x-vercel-forwarded-for": "5.6.7.8", "x-forwarded-for": "1.2.3.4" },
      }),
    );
    expect(trusted).not.toBe(a);
    expect(
      admissionClientHash(
        new Request("https://firstten.invalid", {
          headers: { "x-vercel-forwarded-for": "5.6.7.8", "x-forwarded-for": "9.9.9.9" },
        }),
      ),
    ).toBe(trusted);
  });
});
