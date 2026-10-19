import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const h = vi.hoisted(() => ({
  request: new Request("https://growth.invalid/join"),
  cookies: new Map<string, string>(),
  rpc: vi.fn(),
  result: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => h.request,
  getCookie: (n: string) => h.cookies.get(n),
  setCookie: (n: string, v: string) => h.cookies.set(n, v),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { executeHandoff } from "@/lib/guest-growth/handoff/server";
import {
  readGrowthChoiceSchema,
  growthChoiceSchema,
  guestActivityResult,
} from "@/lib/guest-growth/handoff/contracts";
import { issueCsrf } from "@/lib/guest-spaces/security.server";
import { records, view } from "../fixture";
const record = records()[0]!,
  authority = {
    classId: view.classId,
    teamId: view.teamId,
    principalId: view.principalId,
    className: view.className,
    teamAlias: view.teamAlias,
    principalAlias: view.principalAlias,
    accessExpiresAt: view.accessExpiresAt,
    classRevision: 1,
    teamGeneration: 1,
    principalGeneration: 1,
  };
let csrf: string;
beforeEach(() => {
  vi.clearAllMocks();
  h.cookies.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-test-only");
  vi.stubEnv("SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("NODE_ENV", "test");
  h.request = new Request("https://growth.invalid/join", {
    method: "POST",
    headers: { origin: "https://growth.invalid", "sec-fetch-site": "same-origin" },
  });
  h.cookies.set("__Host-firstten_guest", "c".repeat(64));
  csrf = issueCsrf();
  h.result.mockImplementation((n: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        n === "get_guest_growth_authority"
          ? authority
          : { sourceKind: "guest_growth", artifactId: record.id, choice: "unknown", revision: 0 },
    },
  }));
  h.rpc.mockImplementation((n: string, args: unknown) => ({
    abortSignal: async () => h.result(n, args),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const run = (v: unknown = { csrf, artifactId: record.id }) =>
  executeHandoff(
    v,
    readGrowthChoiceSchema,
    guestActivityResult(growthChoiceSchema),
    "get_guest_growth_sharing_choice",
    (d) => ({ p_artifact_id: d.artifactId }),
  );
it("uses only cookie scope and the tiny projection before/after a closed operation", async () => {
  expect((await run()).ok).toBe(true);
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual([
    "get_guest_growth_authority",
    "get_guest_growth_sharing_choice",
    "get_guest_growth_authority",
  ]);
  expect(
    h.rpc.mock.calls.every((c) => (c[1] as { p_session: string }).p_session === "c".repeat(64)),
  ).toBe(true);
  expect(h.rpc.mock.calls.some((c) => c[0] === "get_guest_session")).toBe(false);
});
it.each(["cookie", "csrf", "origin"])("denies missing %s without DB dispatch", async (mode) => {
  if (mode === "cookie") h.cookies.delete("__Host-firstten_guest");
  if (mode === "origin")
    h.request = new Request("https://growth.invalid/join", {
      method: "POST",
      headers: { origin: "https://foreign.invalid" },
    });
  const r = await run(
    mode === "csrf" ? { csrf: "a".repeat(64), artifactId: record.id } : undefined,
  );
  expect(r.ok).toBe(false);
  expect(h.rpc).not.toHaveBeenCalled();
});
it("does not accept browser principals, account IDs or raw-body fallbacks", async () => {
  expect((await run({ csrf, artifactId: record.id, userId: record.authorPrincipalId })).ok).toBe(
    false,
  );
  expect(h.rpc).not.toHaveBeenCalled();
});
it("denies a changed generation after the operation, even when displayed identity remains the same", async () => {
  let n = 0;
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? { ...authority, principalGeneration: ++n }
          : { sourceKind: "guest_growth", artifactId: record.id, choice: "unknown", revision: 0 },
    },
  }));
  expect(await run()).toEqual({ ok: false, code: "NOT_FOUND" });
});
it("denies full session and unknown projection fields instead of falling back", async () => {
  h.result.mockReturnValue({
    error: null,
    data: {
      ok: true,
      data: { ...authority, assignments: [{ instructions: "x".repeat(2_400_000) }] },
    },
  });
  expect(await run()).toEqual({ ok: false, code: "UNAVAILABLE" });
  expect(h.rpc).toHaveBeenCalledTimes(1);
});
it("rejects foreign record identity and malformed choice bodies", async () => {
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : {
              sourceKind: "guest_marketing",
              artifactId: record.id,
              choice: "granted",
              revision: 1,
            },
    },
  }));
  expect(await run()).toEqual({ ok: false, code: "UNAVAILABLE" });
});
it("fails closed for missing RPC and oversized error payloads", async () => {
  h.result.mockReturnValue({ error: { message: "missing RPC" }, data: null });
  expect(await run()).toEqual({ ok: false, code: "UNAVAILABLE" });
  h.result.mockReturnValue({
    error: null,
    data: { ok: false, code: "NOT_FOUND", private: "x".repeat(100000) },
  });
  expect(await run()).toEqual({ ok: false, code: "UNAVAILABLE" });
});
