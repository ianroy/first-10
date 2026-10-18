import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  actor: "fa190000-0000-4000-8000-000000000001",
  owner: "fa190000-0000-4000-8000-000000000001",
  archived: false,
  getUser: vi.fn(),
  rpc: vi.fn(),
  admin: vi.fn(),
  website: vi.fn(),
  github: vi.fn(),
  token: "Bearer synthetic-context-session",
  length: "0",
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (v: unknown) => unknown) => ({
        handler: (fn: (v: unknown) => unknown) => async (args: { data: unknown }) =>
          fn({
            data: validate(args.data),
            context: {
              userId: h.actor,
              supabase: {
                auth: { getUser: h.getUser },
                rpc: h.rpc,
                from: () => {
                  const q = {
                    select: () => q,
                    eq: () => q,
                    single: async () => ({
                      data: {
                        id: "fa190000-0000-4000-8000-000000000010",
                        user_id: h.owner,
                        archived_at: h.archived ? "2026-10-18T00:00:00Z" : null,
                      },
                      error: null,
                    }),
                  };
                  return q;
                },
              },
            },
          }),
      }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://app.example.org/", {
      headers: { authorization: h.token, "content-length": h.length },
    }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.admin } }));
vi.mock("@/lib/context/extract.server", async (original) => ({
  ...(await original<typeof import("@/lib/context/extract.server")>()),
  retrieveWebsite: h.website,
}));
vi.mock("@/lib/context/github.server", () => ({ retrieveGithub: h.github }));
import {
  retrievePublicContext,
  loadPublicContext,
  reviewPublicContext,
  withdrawPublicContext,
  probePublicContextCapabilities,
} from "@/lib/context.functions";
import { sha256 } from "@/lib/context/extract.server";
const projectId = "fa190000-0000-4000-8000-000000000010",
  operationId = "fa190000-0000-4000-8000-000000000101",
  attemptId = "fa190000-0000-4000-8000-000000000102";
const input = {
  projectId,
  operationId,
  kind: "website" as const,
  url: "https://product.example.org/",
  paths: [],
  previewPermission: true as const,
};
const source = {
  url: input.url,
  title: "Public source",
  format: "plain_text",
  contentHash: "a".repeat(64),
  previewHash: sha256("Unverified author text"),
  text: "Unverified author text",
  bytes: 22,
  commitSha: null,
  path: null,
  blobSha: null,
};
const result = (data: unknown) => ({ abortSignal: async () => ({ data, error: null }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-context-service");
  vi.stubEnv("SUPABASE_URL", "https://synthetic.example.invalid");
  h.token = "Bearer synthetic-context-session";
  h.length = "0";
  h.owner = h.actor;
  h.archived = false;
  h.getUser.mockResolvedValue({ data: { user: { id: h.actor } }, error: null });
  h.rpc.mockReturnValue(result({ ok: true, previews: [], reviewed: [] }));
  h.admin.mockImplementation((name) =>
    result(
      name === "begin_public_context_retrieval"
        ? { ok: true, attemptId, leaseUntil: new Date(Date.now() + 30000).toISOString() }
        : { ok: true },
    ),
  );
  h.website.mockResolvedValue([source]);
  h.github.mockResolvedValue([source]);
});
afterEach(() => vi.unstubAllEnvs());
describe("CTX001 authenticated server boundary", () => {
  it("returns only synchronous runtime capabilities for a freshly verified active owner, without service access or network", async () => {
    const result = await probePublicContextCapabilities({ data: { projectId } });
    expect(result).toEqual({
      ok: true,
      nodeVersion: process.versions.node,
      nodeMajor: Number(process.versions.node.split(".")[0]),
      transportContract: "pinned-public-https-v1",
      apis: { dnsResolver: true, httpsRequest: true, blockList: true, isIP: true },
    });
    expect(h.getUser).toHaveBeenCalledWith("synthetic-context-session");
    expect(h.admin).not.toHaveBeenCalled();
    expect(h.website).not.toHaveBeenCalled();
    expect(h.github).not.toHaveBeenCalled();
  });
  it.each(["foreign owner", "revoked actor", "missing bearer", "archived project"])(
    "denies capability diagnostics for %s",
    async (scenario) => {
      if (scenario === "foreign owner") h.owner = "fa190000-0000-4000-8000-000000000999";
      if (scenario === "revoked actor")
        h.getUser.mockResolvedValue({ data: { user: null }, error: {} });
      if (scenario === "missing bearer") h.token = "";
      if (scenario === "archived project") h.archived = true;
      expect(await probePublicContextCapabilities({ data: { projectId } })).toEqual({
        ok: false,
        code: "UNAVAILABLE",
      });
      expect(h.admin).not.toHaveBeenCalled();
      expect(h.website).not.toHaveBeenCalled();
    },
  );
  it("freshly verifies owner, reserves one stable intent, retrieves once and submits only the validated source DTO", async () => {
    expect(await retrievePublicContext({ data: input })).toEqual({ ok: true });
    expect(h.getUser).toHaveBeenCalledWith("synthetic-context-session");
    expect(h.website).toHaveBeenCalledExactlyOnceWith(input.url);
    expect(h.admin.mock.calls.map((c) => c[0])).toEqual([
      "begin_public_context_retrieval",
      "complete_public_context_retrieval",
    ]);
    expect(h.admin.mock.calls[0]![1]).toMatchObject({
      p_actor: h.actor,
      p_project_id: projectId,
      p_operation_id: operationId,
    });
    expect(h.admin.mock.calls[1]![1]).toEqual({
      p_operation_id: operationId,
      p_attempt_id: attemptId,
      p_sources: [source],
    });
    expect(JSON.stringify(h.admin.mock.calls)).not.toContain("synthetic-context-service");
  });
  it.each(["foreign owner", "revoked actor", "missing bearer", "archived project"])(
    "denies retrieval before service reservation/network for %s",
    async (scenario) => {
      if (scenario === "foreign owner") h.owner = "fa190000-0000-4000-8000-000000000999";
      if (scenario === "revoked actor")
        h.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: "Private auth failure" },
        });
      if (scenario === "missing bearer") h.token = "";
      if (scenario === "archived project") h.archived = true;
      expect(await retrievePublicContext({ data: input })).toMatchObject({ ok: false });
      expect(h.admin).not.toHaveBeenCalled();
      expect(h.website).not.toHaveBeenCalled();
    },
  );
  it.each(["DISABLED", "RATE_LIMIT", "ALREADY_STARTED"])(
    "does not dispatch after %s",
    async (code) => {
      h.admin.mockReturnValue(result({ ok: false, code }));
      expect(await retrievePublicContext({ data: input })).toEqual({ ok: false, code });
      expect(h.website).not.toHaveBeenCalled();
      expect(h.admin).toHaveBeenCalledOnce();
    },
  );
  it("never dispatches or invents a lease acknowledgment when reservation response is lost", async () => {
    h.admin.mockReturnValue({
      abortSignal: async () => {
        throw Error("Unknown acknowledgment");
      },
    });
    expect(await retrievePublicContext({ data: input })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(h.website).not.toHaveBeenCalled();
    expect(h.admin).toHaveBeenCalledOnce();
  });
  it("rejects a completion after expiry without retrying retrieval or overwriting old records", async () => {
    h.admin.mockImplementation((name) =>
      result(
        name === "begin_public_context_retrieval"
          ? { ok: true, attemptId, leaseUntil: new Date(Date.now() + 30000).toISOString() }
          : name === "complete_public_context_retrieval"
            ? { ok: false, code: "EXPIRED" }
            : null,
      ),
    );
    expect(await retrievePublicContext({ data: input })).toEqual({ ok: false, code: "EXPIRED" });
    expect(h.website).toHaveBeenCalledOnce();
    expect(h.admin.mock.calls.map((c) => c[0])).toEqual([
      "begin_public_context_retrieval",
      "complete_public_context_retrieval",
      "fail_public_context_retrieval",
    ]);
  });
  it("fails closed for URL credentials, internal resources, missing preview permission or oversized requests", async () => {
    for (const url of [
      "https://127.0.0.1/",
      "https://user:secret@product.example.org/",
      "https://product.example.org/?token=x",
    ])
      expect(await retrievePublicContext({ data: { ...input, url } })).toMatchObject({ ok: false });
    expect(
      await retrievePublicContext({ data: { ...input, previewPermission: false } as never }),
    ).toEqual({ ok: false, code: "INVALID_INPUT" });
    h.length = "999999";
    expect(await retrievePublicContext({ data: input })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.website).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });
  it("freshly verifies bearer for owner read, review and withdrawal including archive recovery", async () => {
    h.archived = true;
    expect(await loadPublicContext({ data: { projectId } })).toEqual({
      ok: true,
      previews: [],
      reviewed: [],
    });
    expect(h.getUser).toHaveBeenCalledOnce();
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      await withdrawPublicContext({
        data: { projectId, sourceId: attemptId, expectedRevision: 1 },
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(
      await reviewPublicContext({
        data: {
          projectId,
          previewId: attemptId,
          expectedHash: "a".repeat(64),
          label: "Reviewed",
          excerpt: "text",
          storagePermission: true,
        },
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(h.rpc).toHaveBeenCalledOnce();
  });
});
