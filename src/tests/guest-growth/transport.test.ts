import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const h = vi.hoisted(() => ({
  request: new Request("https://growth.invalid/join", {
    method: "POST",
    headers: { origin: "https://growth.invalid" },
  }),
  cookies: new Map<string, string>(),
  headers: vi.fn(),
  rpc: vi.fn(),
  result: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => h.request,
  getCookie: (name: string) => h.cookies.get(name),
  setCookie: (name: string, value: string) => h.cookies.set(name, value),
  setResponseHeader: h.headers,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { runGuestGrowth } from "@/lib/guest-growth/server";
import { issueCsrf } from "@/lib/guest-spaces/security.server";
import {
  guestGrowthAuthorityReceiptSchema,
  GUEST_GROWTH_AUTHORITY_BYTES,
  growthRecordHash,
} from "@/lib/guest-growth/transport";
import { guestViewSchema } from "@/lib/guest-spaces/contracts";
import { jsonBytes } from "@/lib/marketing-plan";
import { records, view, scope, id } from "./fixture";
const authority = {
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
const record = records()[0]!;
const header = (({ document: _document, ...value }) => value)(record);
let csrf: string;
const session = "c".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  h.cookies.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-key-for-transport-test");
  vi.stubEnv("SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("NODE_ENV", "test");
  h.request = new Request("https://growth.invalid/join", {
    method: "POST",
    headers: { origin: "https://growth.invalid", "sec-fetch-site": "same-origin" },
  });
  h.cookies.set("__Host-firstten_guest", session);
  csrf = issueCsrf();
  h.result.mockImplementation((name: string) =>
    name === "get_guest_growth_authority"
      ? { error: null, data: { ok: true, data: authority } }
      : { error: null, data: { ok: true, data: record } },
  );
  h.rpc.mockImplementation((name: string, args: unknown) => ({
    abortSignal: async () => h.result(name, args),
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const load = () => runGuestGrowth("load", { csrf, artifactId: record.id, revision: 2 });
it.each([undefined, "https://evil.invalid"])(
  "rejects missing/foreign origin before RPC (%s)",
  async (origin) => {
    h.request = new Request("https://growth.invalid/join", {
      method: "POST",
      headers: origin ? { origin } : {},
    });
    expect(await load()).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(h.rpc).not.toHaveBeenCalled();
  },
);
it("requires a session-bound CSRF token and real guest cookie", async () => {
  expect(await runGuestGrowth("load", { csrf: "b".repeat(64), artifactId: record.id })).toEqual({
    ok: false,
    code: "FORBIDDEN",
  });
  expect(h.rpc).not.toHaveBeenCalled();
  h.cookies.delete("__Host-firstten_guest");
  csrf = issueCsrf();
  expect(await load()).toEqual({ ok: false, code: "NOT_FOUND" });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("rejects oversized transport, forged authority and unknown input fields before RPC", async () => {
  h.request = new Request("https://growth.invalid/join", {
    method: "POST",
    headers: { origin: "https://growth.invalid", "content-length": "65537" },
  });
  expect(await load()).toEqual({ ok: false, code: "INVALID_INPUT" });
  h.request = new Request("https://growth.invalid/join", {
    method: "POST",
    headers: { origin: "https://growth.invalid" },
  });
  expect(
    await runGuestGrowth("load", { csrf, artifactId: record.id, principalId: view.principalId }),
  ).toEqual({ ok: false, code: "INVALID_INPUT" });
  expect(await runGuestGrowth("load", { csrf, artifactId: "😀".repeat(20000) })).toEqual({
    ok: false,
    code: "INVALID_INPUT",
  });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("uses the cookie only for fixed RPC identity and checks current authority again before returning", async () => {
  expect(await load()).toEqual({ ok: true, data: record });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual([
    "get_guest_growth_authority",
    "load_guest_growth_artifact",
    "get_guest_growth_authority",
  ]);
  expect(h.rpc.mock.calls[1]![1]).toEqual({
    p_session: session,
    p_artifact_id: record.id,
    p_revision: 2,
  });
  expect(h.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store");
});
it.each([
  { ...record, classId: id(999) },
  { ...record, teamId: id(999) },
  { ...record, authorPrincipalId: id(999) },
  { ...record, revision: 1 },
  { ...record, id: id(999) },
  { ...record, kind: "experiment" },
  { ...record, document: { ...record.document, rawNotes: ["private"] } },
])("refuses foreign, substituted and unknown-field records %#", async (value) => {
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: { ok: true, data: name === "get_guest_growth_authority" ? authority : value },
  }));
  expect(await load()).toEqual({ ok: false, code: "UNAVAILABLE" });
});
it("fails closed if an RPC is absent or returns an oversized/unrecognized error payload", async () => {
  h.result.mockImplementation((name: string) =>
    name === "get_guest_growth_authority"
      ? { error: null, data: { ok: true, data: authority } }
      : { error: { message: "missing RPC private secret" }, data: null },
  );
  expect(await load()).toEqual({ ok: false, code: "UNAVAILABLE" });
  h.result.mockImplementation((name: string) => ({
    error: null,
    data:
      name === "get_guest_growth_authority"
        ? { ok: true, data: authority }
        : { ok: false, code: "CONFLICT", privateNotes: "x".repeat(100000) },
  }));
  expect(await load()).toEqual({ ok: false, code: "UNAVAILABLE" });
});
it("withholds output when scope or deadline changes after the source read", async () => {
  let reads = 0;
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? ++reads === 1
            ? authority
            : { ...authority, principalId: id(999) }
          : record,
    },
  }));
  expect(await load()).toEqual({ ok: false, code: "CHANGED" });
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? { ...authority, accessExpiresAt: "2000-01-01T00:00:00Z" }
          : record,
    },
  }));
  expect(await load()).toEqual({ ok: false, code: "NOT_FOUND" });
});
it("validates list filters and header uniqueness and immutable history scope", async () => {
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : { items: [header, header], nextCursor: null },
    },
  }));
  expect(await runGuestGrowth("list", { csrf })).toEqual({ ok: false, code: "UNAVAILABLE" });
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority" ? authority : { items: [header], nextCursor: null },
    },
  }));
  expect(await runGuestGrowth("list", { csrf, kind: "experiment" })).toEqual({
    ok: false,
    code: "UNAVAILABLE",
  });
  expect(await runGuestGrowth("list", { csrf, kind: "learning" })).toEqual({
    ok: true,
    data: { items: [header], nextCursor: null },
  });
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : {
              artifactId: record.id,
              versions: [header, { ...header, revision: 1, audience: "team_shared" }],
            },
    },
  }));
  expect(await runGuestGrowth("history", { csrf, artifactId: record.id })).toEqual({
    ok: false,
    code: "UNAVAILABLE",
  });
});
it("passes stable CAS/retry IDs unchanged and preserves original acknowledged versus current revision", async () => {
  const input = {
    csrf,
    artifactId: record.id,
    audience: "principal_private",
    expectedRevision: 1,
    mutationId: id(998),
    sharedAudienceConfirmed: false,
    document: record.document,
  };
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : { record, savedRevision: 2, replayed: false },
    },
  }));
  expect(await runGuestGrowth("save", input)).toEqual({
    ok: true,
    data: { record, savedRevision: 2, replayed: false },
  });
  const args = h.rpc.mock.calls.find((c) => c[0] === "save_guest_growth_artifact")![1];
  expect(args).toMatchObject({
    p_expected_revision: 1,
    p_mutation_id: id(998),
    p_document: record.document,
    p_session: session,
  });
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : { record: { ...record, revision: 3 }, savedRevision: 2, replayed: true },
    },
  }));
  expect(await runGuestGrowth("save", input)).toEqual({
    ok: true,
    data: { record: { ...record, revision: 3 }, savedRevision: 2, replayed: true },
  });
  expect(h.rpc.mock.calls.filter((c) => c[0] === "save_guest_growth_artifact")[1]![1]).toEqual(
    args,
  );
});
it("refuses a same-revision substituted save body", async () => {
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? authority
          : {
              record: { ...record, document: { ...record.document, title: "changed" } },
              savedRevision: 2,
              replayed: false,
            },
    },
  }));
  expect(
    await runGuestGrowth("save", {
      csrf,
      artifactId: record.id,
      audience: "principal_private",
      expectedRevision: 1,
      mutationId: id(998),
      sharedAudienceConfirmed: false,
      document: record.document,
    }),
  ).toEqual({ ok: false, code: "UNAVAILABLE" });
});
async function proof() {
  return {
    csrf,
    scope: {
      classId: scope.classId,
      teamId: scope.teamId,
      principalId: scope.principalId,
      accessExpiresAt: scope.accessExpiresAt,
      contextHash: await growthRecordHash({
        classId: scope.classId,
        teamId: scope.teamId,
        principalId: scope.principalId,
        accessExpiresAt: scope.accessExpiresAt,
        className: scope.className,
        teamAlias: scope.teamAlias,
        principalAlias: scope.principalAlias,
      }),
    },
    sources: [
      {
        state: "saved",
        artifactId: record.id,
        revision: record.revision,
        kind: record.kind,
        audience: record.audience,
        authorPrincipalId: record.authorPrincipalId,
        recordHash: await growthRecordHash(record),
      },
    ],
  };
}
it("authorizes the exact retained hash without dereferencing linked bodies or transmitting draft text", async () => {
  const input = await proof();
  expect(await runGuestGrowth("authorize", input)).toEqual({ ok: true });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual([
    "get_guest_growth_authority",
    "load_guest_growth_artifact",
    "get_guest_growth_authority",
  ]);
  expect(JSON.stringify(input)).not.toContain(record.document.title);
  expect(
    await runGuestGrowth("authorize", {
      ...input,
      sources: [{ state: "draft", localDraftId: id(997), kind: "learning" }],
    }),
  ).toEqual({ ok: true });
});
it("rejects stale PDF scope, duplicate proofs, wrong retained hashes and unsaved-text fields", async () => {
  const input = await proof();
  expect(
    await runGuestGrowth("authorize", {
      ...input,
      scope: { ...input.scope, principalId: id(999) },
    }),
  ).toEqual({ ok: false, code: "CHANGED" });
  expect(
    await runGuestGrowth("authorize", { ...input, sources: [input.sources[0], input.sources[0]] }),
  ).toEqual({ ok: false, code: "INVALID_INPUT" });
  expect(
    await runGuestGrowth("authorize", {
      ...input,
      sources: [{ ...input.sources[0], recordHash: "0".repeat(64) }],
    }),
  ).toEqual({ ok: false, code: "CHANGED" });
  expect(
    await runGuestGrowth("authorize", {
      ...input,
      sources: [
        { state: "draft", localDraftId: id(997), kind: "learning", document: record.document },
      ],
    }),
  ).toEqual({ ok: false, code: "INVALID_INPUT" });
});
it("withholds a PDF if printed team metadata changes while exact source reads are in flight", async () => {
  const input = await proof();
  let reads = 0;
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_growth_authority"
          ? ++reads === 1
            ? authority
            : { ...authority, teamAlias: "Changed team label" }
          : record,
    },
  }));
  expect(await runGuestGrowth("authorize", input)).toEqual({ ok: false, code: "CHANGED" });
});

it("does not fetch valid large unrelated class assignment bodies while resolving growth authority", async () => {
  const large = {
    ...view,
    instructions: "\u0000".repeat(4000),
    assignments: Array.from({ length: 50 }, (_, i) => ({
      id: id(2000 + i),
      classId: view.classId,
      title: `Assignment ${i}`,
      instructions: "\u0000".repeat(8000),
      dueAt: null,
      state: "published",
      revision: 1,
      updatedAt: "2026-10-18T00:00:00Z",
    })),
  };
  expect(guestViewSchema.safeParse(large).success).toBe(true);
  expect(jsonBytes({ ok: true, data: large })).toBeGreaterThan(2400000);
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: {
      ok: true,
      data:
        name === "get_guest_session"
          ? large
          : name === "get_guest_growth_authority"
            ? authority
            : record,
    },
  }));
  expect(await load()).toEqual({ ok: true, data: record });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual([
    "get_guest_growth_authority",
    "load_guest_growth_artifact",
    "get_guest_growth_authority",
  ]);
});
it("accepts the projection's worst-case escaped labels within its declared bounded size", async () => {
  const value = {
    ...authority,
    className: "\u0000".repeat(120),
    teamAlias: "\u0000".repeat(80),
    principalAlias: "\u0000".repeat(80),
    classRevision: Number.MAX_SAFE_INTEGER,
    teamGeneration: Number.MAX_SAFE_INTEGER,
    principalGeneration: Number.MAX_SAFE_INTEGER,
  };
  const raw = { ok: true, data: value };
  expect(guestGrowthAuthorityReceiptSchema.safeParse(raw).success).toBe(true);
  expect(jsonBytes(raw)).toBeLessThan(GUEST_GROWTH_AUTHORITY_BYTES);
  h.result.mockImplementation((name: string) => ({
    error: null,
    data: name === "get_guest_growth_authority" ? raw : { ok: true, data: record },
  }));
  expect(await load()).toEqual({ ok: true, data: record });
});
it.each(["classRevision", "teamGeneration", "principalGeneration"] as const)(
  "withholds output when real authority %s changes during a read",
  async (field) => {
    let reads = 0;
    h.result.mockImplementation((name: string) => ({
      error: null,
      data: {
        ok: true,
        data:
          name === "get_guest_growth_authority"
            ? ++reads === 1
              ? authority
              : { ...authority, [field]: 2 }
            : record,
      },
    }));
    expect(await load()).toEqual({ ok: false, code: "CHANGED" });
  },
);
it("rejects authority extras and explicit denial before reading any growth source", async () => {
  h.result.mockResolvedValue({
    error: null,
    data: { ok: true, data: { ...authority, assignments: [] } },
  });
  expect(await load()).toEqual({ ok: false, code: "UNAVAILABLE" });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["get_guest_growth_authority"]);
  h.rpc.mockClear();
  h.result.mockResolvedValue({ error: null, data: { ok: false, code: "NOT_FOUND" } });
  expect(await load()).toEqual({ ok: false, code: "NOT_FOUND" });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["get_guest_growth_authority"]);
});
it("fails closed for draft-only PDF authority when the new projection RPC is missing, with no full-session fallback", async () => {
  h.result.mockResolvedValue({ error: { message: "RPC not installed" }, data: null });
  const input = await proof();
  expect(
    await runGuestGrowth("authorize", {
      ...input,
      sources: [{ state: "draft", localDraftId: id(444), kind: "learning" }],
    }),
  ).toEqual({ ok: false, code: "UNAVAILABLE" });
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(["get_guest_growth_authority"]);
});
