import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  prepare: vi.fn(),
  write: vi.fn(),
  request: vi.fn(),
  demo: vi.fn(),
  budget: vi.fn(),
  claim: vi.fn(),
  cancel: vi.fn(),
  settle: vi.fn(),
  unknown: vi.fn(),
  runtime: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.request }));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: h.demo }));
vi.mock("@/lib/ai/runtime-evaluation.server", () => ({ runRuntimeEvaluation: h.runtime }));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
import { budgetRoute, gatewayBilling } from "@/tests/ai-004/fixtures";
import { envelope, validated } from "@/tests/ai-007/fixtures";
import { generateAI } from "@/lib/ai.functions";
import { validateAIOutput } from "@/lib/ai/contracts";
import type { ExistingKind } from "@/lib/prompts/private-v1";
const outputs = {
  questions: { questions: ["Recent situation?"] },
  synthesis: { problems: [], objections: [], best_fit: [], quotes: [], changes: [] },
  stage2: { channels: [], drafts: [], survey: [] },
  stage3: { channels: [], referral_asks: [], onboarding_questions: [] },
};
const project = {
  id: "fa170000-0000-4000-8000-000000000001",
  user_id: "f1000000-0000-4000-8000-000000000001",
  name: "Fixture",
  description: "PRIVATE",
  audience: "Students",
  problem: "Planning",
};
const sb = {
  rpc: (_name: string, args: { p_kind: ExistingKind }) => ({
    abortSignal: async () => ({ data: { ok: true, data: envelope(args.p_kind) }, error: null }),
  }),
  from: (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: project, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: table === "interviews" ? [{ answers: { note: "PRIVATE" }, tags: [] }] : [],
          error: null,
        }).then(resolve),
    };
    return q;
  },
};
const invoke = (kind: string, withOrigin?: boolean) =>
  (generateAI as unknown as (args: unknown) => Promise<unknown>)({
    data: {
      kind,
      projectId: project.id,
      operationId: "fa140000-0000-4000-8000-000000000111",
      withOrigin,
    },
    context: { supabase: sb, userId: project.user_id },
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
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue("fa028000-0000-4000-8000-000000000001");
});
describe("generateAI legacy response compatibility", () => {
  it("dispatches fixed runtime cases before reading editable private project content", async () => {
    const from = vi.fn(() => {
      throw new Error("Raw content read forbidden");
    });
    h.runtime.mockResolvedValue({ fictional: true });
    const args = {
      data: {
        kind: "runtime_evaluation",
        projectId: project.id,
        operationId: "f1e70000-0000-4000-8000-000000000001",
        evaluationCaseId: "questions-typical-v7",
      },
      context: { supabase: { from }, userId: project.user_id },
    };
    await expect(
      (generateAI as unknown as (args: unknown) => Promise<unknown>)(args),
    ).resolves.toEqual({ fictional: true });
    expect(h.runtime).toHaveBeenCalledWith({
      supabase: args.context.supabase,
      userId: project.user_id,
      projectId: project.id,
      operationId: args.data.operationId,
      caseId: args.data.evaluationCaseId,
    });
    expect(from).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it.each(Object.keys(outputs) as ExistingKind[])(
    "records successful %s metadata before returning unchanged strict output",
    async (kind) => {
      const result = {
        data: validated(kind, outputs[kind]),
        ...gatewayBilling,
      };
      h.request.mockResolvedValue(result);
      expect(validateAIOutput(kind, await invoke(kind))).toEqual(outputs[kind]);
      expect(h.request.mock.calls[0]?.[0].key === "synthetic-fixture-key").toBe(true);
      expect(h.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: project.id,
          userId: project.user_id,
          projectOwnerId: project.user_id,
        }),
      );
      expect(h.write).toHaveBeenCalledWith(
        result,
        expect.objectContaining({
          operationId: "fa140000-0000-4000-8000-000000000111",
          grounding: result.data.receipt,
        }),
      );
      expect(h.request.mock.calls[0]?.[0].user).toContain("Approved description");
    },
  );
  it.each(Object.keys(outputs) as ExistingKind[])(
    "returns an opt-in receipt outside strict %s JSON",
    async (kind) => {
      h.request.mockResolvedValue({ ...gatewayBilling, data: validated(kind, outputs[kind]) });
      expect(await invoke(kind, true)).toEqual({
        data: outputs[kind],
        originId: "fa028000-0000-4000-8000-000000000001",
      });
      expect(h.write).toHaveBeenCalledTimes(1);
    },
  );
  it("never returns a successful draft when provenance cannot commit", async () => {
    h.request.mockResolvedValue({
      ...gatewayBilling,
      data: validated("questions", outputs.questions),
    });
    h.write.mockRejectedValue(new Error("Record failed"));
    await expect(invoke("questions")).rejects.toThrow("Record failed");
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it("does not persist a failed provider generation", async () => {
    h.request.mockRejectedValue(new Error("Provider failed"));
    await expect(invoke("questions")).rejects.toThrow("Provider failed");
    expect(h.write).not.toHaveBeenCalled();
  });
  it("keeps the retired fictional route closed when general generation is activated", async () => {
    await expect(invoke("marketing_demo")).rejects.toThrow("older fictional practice is paused");
    expect(h.demo).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });
});
