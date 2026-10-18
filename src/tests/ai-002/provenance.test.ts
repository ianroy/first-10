import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const h = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), token: "Bearer fixture-token" }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://fixture.test", { headers: { authorization: h.token } }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { generationRecord, prepareProvenanceWriter } from "@/lib/prompts/provenance.server";
import { getPrivateContract } from "@/lib/prompts/private-v1";
const owner = "f1000000-0000-4000-8000-000000000001";
const project = "f2000000-0000-4000-8000-000000000001";
const scope = () => ({
  supabase: { auth: { getUser: h.getUser } } as unknown as SupabaseClient<Database>,
  userId: owner,
  projectId: project,
  projectOwnerId: owner,
  contract: getPrivateContract("synthesis"),
});
const result = () => ({
  requestedModel: "anthropic/claude-sonnet-4.5",
  actualModel: null,
  generationId: null,
  provider: null,
  usage: null,
  attempts: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  h.token = "Bearer fixture-token";
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service");
  vi.stubEnv("SUPABASE_URL", "https://fixture.test");
  h.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  h.rpc.mockImplementation((_name, { p_record }) => ({
    abortSignal: async () => ({ data: p_record.request_id, error: null }),
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe("server-owned generation metadata", () => {
  it("allowlists metadata and never copies prompt, input, output or raw usage fields", () => {
    const record = generationRecord({ ...scope(), requestId: "fixture-request" }, {
      ...result(),
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28,
        cost: 0,
        input: "PRIVATE",
        output: "PRIVATE",
        provider_extra: "PRIVATE",
      },
      data: "PRIVATE",
      system: "PRIVATE",
    } as Parameters<typeof generationRecord>[1]);
    expect(record).toMatchObject({
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
      cost_usd: 0,
      actual_model: null,
      requested_provider: null,
      actual_provider: null,
    });
    expect(JSON.stringify(record)).not.toContain("PRIVATE");
    expect(Object.keys(record)).toHaveLength(18);
  });
  it("keeps missing, negative, infinite and fractional token counts unknown", () => {
    const record = generationRecord(
      { ...scope(), requestId: "fixture" },
      {
        ...result(),
        usage: { prompt_tokens: -1, completion_tokens: 2.5, total_tokens: Infinity, cost: "0.01" },
      },
    );
    expect([
      record.prompt_tokens,
      record.completion_tokens,
      record.total_tokens,
      record.cost_usd,
    ]).toEqual([null, null, null, null]);
  });
  it("freshly verifies bearer identity and writes only service RPC metadata", async () => {
    const write = await prepareProvenanceWriter(scope());
    expect(h.getUser).toHaveBeenCalledWith("fixture-token");
    expect(h.rpc).not.toHaveBeenCalled();
    const id = await write(result());
    expect(id).toBe(h.rpc.mock.calls[0]?.[1].p_record.request_id);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0]?.[0]).toBe("record_ai_generation");
    expect(h.rpc.mock.calls[0]?.[1].p_record).toMatchObject({
      user_id: owner,
      project_id: project,
      kind: "synthesis",
      prompt_version: 1,
      schema_version: 1,
    });
  });
  it.each(["foreign owner", "revoked user", "missing bearer", "missing service"])(
    "fails before paid generation when %s",
    async (scenario) => {
      const input = scope();
      if (scenario === "foreign owner") input.projectOwnerId = "other-owner";
      if (scenario === "revoked user")
        h.getUser.mockResolvedValue({ data: { user: null }, error: new Error("PRIVATE") });
      if (scenario === "missing bearer") h.token = "";
      if (scenario === "missing service") vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      await expect(prepareProvenanceWriter(input)).rejects.toThrow();
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
  it("fails closed without leaking private database failures or retrying the write", async () => {
    h.rpc.mockReturnValue({
      abortSignal: async () => ({ data: null, error: { message: "PRIVATE" } }),
    });
    const write = await prepareProvenanceWriter(scope());
    await expect(write(result())).rejects.toThrow("could not be recorded");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
