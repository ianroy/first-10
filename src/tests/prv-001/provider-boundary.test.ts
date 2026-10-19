import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  budget: vi.fn(),
  claim: vi.fn(),
  cancel: vi.fn(),
  settle: vi.fn(),
  unknown: vi.fn(),
  request: vi.fn(),
  write: vi.fn(),
  prepare: vi.fn(),
  demo: vi.fn(),
  rpc: vi.fn(),
  tables: [] as string[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.request }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: h.demo }));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
import { budgetRoute, gatewayBilling } from "@/tests/ai-004/fixtures";
import { envelope, validated } from "@/tests/ai-007/fixtures";
import type { ExistingKind } from "@/lib/prompts/private-v1";
import { generateAI } from "@/lib/ai.functions";
const projectId = "fa170000-0000-4000-8000-000000000001";
const safe = envelope();
const sb = {
  rpc: h.rpc,
  from: (table: string) => {
    h.tables.push(table);
    if (table !== "projects") throw Error("Raw table read forbidden");
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({
        data: {
          id: projectId,
          user_id: "actor",
          name: "RAW_NAME",
          description: "WITHDRAWN_RAW_PROJECT",
        },
        error: null,
      }),
    };
    return q;
  },
};
const invoke = (kind: string) =>
  (generateAI as unknown as (args: unknown) => Promise<unknown>)({
    data: { kind, projectId, operationId: "fa140000-0000-4000-8000-000000000111" },
    context: { supabase: sb, userId: "actor" },
  });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.clearAllMocks();
  h.budget.mockResolvedValue({
    route: budgetRoute,
    claim: h.claim,
    cancelBeforeDispatch: h.cancel,
    settle: h.settle,
    markUnknown: h.unknown,
  });
  h.claim.mockResolvedValue({ route: budgetRoute });
  h.settle.mockResolvedValue({ state: "settled", resultAllowed: true });
  h.tables = [];
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue("receipt");
  h.request.mockImplementation(async (options) => ({
    ...gatewayBilling,
    data: validated(options.kind),
  }));
  h.rpc.mockImplementation((_name, args) => ({
    abortSignal: async () => ({
      data: { ok: true, data: envelope(args.p_kind as ExistingKind) },
      error: null,
    }),
  }));
});
describe("PRV001 provider boundary", () => {
  it.each(["questions", "synthesis", "stage2", "stage3"])(
    "denies %s without processing permission before any provider call",
    async (kind) => {
      h.rpc.mockReturnValue({
        abortSignal: async () => ({
          data: { ok: false, code: "PROCESSING_PERMISSION_REQUIRED" },
          error: null,
        }),
      });
      await expect(invoke(kind)).rejects.toThrow("AI processing is not enabled");
      expect(h.request).not.toHaveBeenCalled();
      expect(h.write).not.toHaveBeenCalled();
      expect(h.tables).toEqual(["projects"]);
    },
  );
  it.each(["questions", "synthesis", "stage2", "stage3"])(
    "uses only permission-scoped projections for %s",
    async (kind) => {
      await invoke(kind);
      const args = h.request.mock.calls[0]?.[0];
      expect(args.key === "synthetic-fixture-key").toBe(true);
      expect(args.user).toContain("Approved description");
      expect(args.user).not.toContain("WITHDRAWN_RAW_PROJECT");
      expect(args.user).toContain('"permission":1');
      expect(args.user).not.toContain("WITHDRAWN_NOTE");
      expect(h.rpc).toHaveBeenCalledWith("get_ai_processing_context_v2", {
        p_project_id: projectId,
        p_kind: kind,
      });
      expect(h.tables).toEqual(["projects", "projects"]);
      if (kind === "questions") expect(args.user).not.toContain("ALLOWED_NOTE");
      else expect(args.user).toContain("ALLOWED_NOTE");
    },
  );
  it("rechecks permission on the next call rather than reusing cached source context", async () => {
    await invoke("synthesis");
    h.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: { ok: false, code: "PROCESSING_PERMISSION_REQUIRED" },
        error: null,
      }),
    });
    await expect(invoke("synthesis")).rejects.toThrow("AI processing is not enabled");
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    { data: null, error: { message: "WITHDRAWN_NOTE" } },
    { data: { ok: true, data: { ...safe, privateNotes: "WITHDRAWN_NOTE" } }, error: null },
    {
      data: { ok: true, data: { ...safe, interviews: [{ answers: "WITHDRAWN_NOTE", tags: [] }] } },
      error: null,
    },
  ])("fails closed for unavailable or malformed context, with no raw fallback", async (result) => {
    h.rpc.mockReturnValue({ abortSignal: async () => result });
    await expect(invoke("synthesis")).rejects.toThrow();
    expect(h.request).not.toHaveBeenCalled();
    expect(h.tables).toEqual(["projects"]);
  });
  it("leaves the fixed fictional marketing practice boundary separate", async () => {
    h.demo.mockResolvedValue({ fixture: true });
    await expect(invoke("marketing_demo")).rejects.toThrow("older fictional practice is paused");
    expect(h.demo).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
