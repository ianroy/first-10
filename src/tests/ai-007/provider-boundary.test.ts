import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  budget: vi.fn(),
  claim: vi.fn(),
  settle: vi.fn(),
  cancel: vi.fn(),
  unknown: vi.fn(),
  write: vi.fn(),
  fetch: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (f: unknown) => f }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({
  prepareProvenanceWriter: async () => h.write,
}));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
import { generateAI } from "@/lib/ai.functions";
import { budgetRoute, gatewayBilling } from "@/tests/ai-004/fixtures";
import { envelope, projectId, wrapper } from "./fixtures";
const actor = "fa170000-0000-4000-8000-000000000099";
const op = "fa170000-0000-4000-8000-000000000098";
const invoke = () =>
  (generateAI as unknown as (args: unknown) => Promise<unknown>)({
    data: { kind: "synthesis", projectId, operationId: op },
    context: {
      userId: actor,
      supabase: {
        rpc: h.rpc,
        from: (table: string) => {
          if (table !== "projects") throw Error("Raw child read forbidden");
          const q = {
            select: () => q,
            eq: () => q,
            single: async () => ({
              data: {
                id: projectId,
                user_id: actor,
                archived_at: null,
                description: "EXCLUDED_RAW_PROJECT_SECRET",
              },
              error: null,
            }),
          };
          return q;
        },
      },
    },
  });
const valid = () =>
  wrapper("synthesis", { problems: [], objections: [], best_fit: [], quotes: [], changes: [] });
function provider(value: unknown) {
  return new Response(
    JSON.stringify({
      id: gatewayBilling.generationId,
      model: gatewayBilling.actualModel,
      provider: gatewayBilling.provider,
      usage: gatewayBilling.usage,
      choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }],
    }),
    { status: 200 },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.stubGlobal("fetch", h.fetch);
  h.rpc.mockReturnValue({
    abortSignal: async () => ({ data: { ok: true, data: envelope() }, error: null }),
  });
  h.budget.mockResolvedValue({
    route: { ...budgetRoute, kind: "synthesis" },
    claim: h.claim,
    settle: h.settle,
    cancelBeforeDispatch: h.cancel,
    markUnknown: h.unknown,
  });
  h.write.mockResolvedValue("receipt");
  h.fetch.mockResolvedValue(provider(valid()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("AI007 actual gateway boundary", () => {
  it("sends only bounded authorized records and supplies mandatory content-free dispatch identities", async () => {
    const output = await invoke();
    expect(output).toEqual(valid().draft);
    const options = h.fetch.mock.calls[0]![1];
    expect(options.headers.Authorization === "Bearer synthetic-fixture-key").toBe(true);
    const body = JSON.parse(options.body);
    expect(body.messages[1].content).toContain("ALLOWED_NOTE");
    expect(body.messages[1].content).not.toContain("EXCLUDED_RAW_PROJECT_SECRET");
    expect(body.messages[1].content).toContain('"permission":1');
    const fence = h.budget.mock.calls[0]![0].contextFence;
    expect(fence.sources[0].type).toBe("project");
    expect(fence.sources[0].recordId).toBe(projectId);
    expect(fence.sources).toHaveLength(2);
    expect(JSON.stringify(fence)).not.toContain("ALLOWED_NOTE");
    expect(h.claim).toHaveBeenCalledOnce();
    expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({ outputValid: true }));
    expect(h.write.mock.calls[0]![1]).toEqual(expect.objectContaining({ operationId: op }));
  });
  it("rejects invented quotations while settling known billed usage as invalid", async () => {
    const bad = valid();
    (bad.draft as { quotes: string[] }).quotes.push("fabricated");
    h.fetch.mockResolvedValue(provider(bad));
    await expect(invoke()).rejects.toThrow("expected format");
    expect(h.settle).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: gatewayBilling.usage.cost, outputValid: false }),
    );
    expect(h.write).not.toHaveBeenCalled();
    expect(h.unknown).not.toHaveBeenCalled();
  });
  it("does not dispatch after a source-version fence rejection or lost claim acknowledgment", async () => {
    h.claim.mockRejectedValue(new Error("Context permission or version changed"));
    await expect(invoke()).rejects.toThrow("version changed");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it("fails closed on unknown and withdrawn context with no provider request", async () => {
    h.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: { ok: false, code: "PROCESSING_PERMISSION_REQUIRED" },
        error: null,
      }),
    });
    await expect(invoke()).rejects.toThrow("processing is not enabled");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.budget).not.toHaveBeenCalled();
  });
});
