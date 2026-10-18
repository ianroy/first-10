import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => {
  process.env["OPENROUTER_API_KEY"] = "synthetic-evaluation-key";
  return {
    identity: vi.fn(),
    key: vi.fn(),
    route: vi.fn(),
    budget: vi.fn(),
    claim: vi.fn(),
    settle: vi.fn(),
    cancel: vi.fn(),
    unknown: vi.fn(),
    provider: vi.fn(),
    write: vi.fn(),
  };
});
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/ai/evaluation.server", () => ({
  verifyEvaluationIdentity: h.identity,
  preflightEvaluationKey: h.key,
  verifyEvaluationRoute: h.route,
}));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: vi.fn() }));
vi.mock("@/lib/prompts/provenance.server", () => ({
  prepareProvenanceWriter: async () => h.write,
}));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.provider }));
import { generateAI } from "@/lib/ai.functions";
import { budgetRoute, gatewayBilling } from "@/tests/ai-004/fixtures";
import { envelope, validated } from "@/tests/ai-007/fixtures";
const projectId = envelope().projectId,
  userId = "fa030000-0000-4000-8000-000000000003",
  operationId = "fa030000-0000-4000-8000-000000000004",
  attemptId = "fa030000-0000-4000-8000-000000000005";
let changePermission = false,
  loads = 0;
function run(withEvaluation = true, withOrigin = false) {
  const project = { id: projectId, user_id: userId };
  const q = { select: () => q, eq: () => q, single: async () => ({ data: project, error: null }) };
  return (generateAI as unknown as (opts: unknown) => Promise<unknown>)({
    data: {
      kind: "questions",
      projectId,
      operationId,
      withEvaluation: withEvaluation || undefined,
      withOrigin,
    },
    context: {
      userId,
      supabase: {
        from: () => q,
        rpc: () => ({
          abortSignal: async () => {
            const value = envelope("questions");
            if (changePermission && loads++ > 0)
              (value.project.content as { name: string }).name = "changed";
            return { data: { ok: true, data: value }, error: null };
          },
        }),
      },
    },
  });
}
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-evaluation-key");
  changePermission = false;
  loads = 0;
  h.identity.mockResolvedValue(undefined);
  h.key.mockResolvedValue(undefined);
  h.route.mockReturnValue(undefined);
  h.claim.mockResolvedValue({ attemptId });
  h.settle.mockResolvedValue({});
  h.cancel.mockResolvedValue({});
  h.unknown.mockResolvedValue({});
  h.budget.mockResolvedValue({
    route: budgetRoute,
    claim: h.claim,
    settle: h.settle,
    cancelBeforeDispatch: h.cancel,
    markUnknown: h.unknown,
  });
  h.provider.mockResolvedValue({
    ...gatewayBilling,
    finishReason: "stop",
    latencyMs: 17,
    data: validated("questions"),
  });
  h.write.mockResolvedValue("fa030000-0000-4000-8000-000000000006");
});
describe("actual generateAI evaluation branch", () => {
  it("returns the validated wrapper and measured receipt only after settlement and provenance", async () => {
    const result = (await run()) as {
      draft: unknown;
      grounding: unknown;
      evaluation: Record<string, unknown>;
    };
    expect(result.draft).toEqual(validated("questions").draft);
    expect(result.grounding).toEqual(validated("questions").grounding);
    expect(result.evaluation).toMatchObject({
      operationId,
      attemptId,
      routeVersion: 1,
      model: gatewayBilling.actualModel,
      finishReason: "stop",
      latencyMs: 17,
    });
    expect(h.identity).toHaveBeenCalledTimes(2);
    expect(h.key).toHaveBeenCalledOnce();
    expect(h.settle.mock.invocationCallOrder[0]).toBeLessThan(h.write.mock.invocationCallOrder[0]!);
  });
  it("preserves default and withOrigin product responses and avoids evaluation-only key access", async () => {
    expect(await run(false)).toEqual(validated("questions").draft);
    expect(await run(false, true)).toEqual({
      data: validated("questions").draft,
      originId: "fa030000-0000-4000-8000-000000000006",
    });
    expect(h.key).not.toHaveBeenCalled();
    expect(h.identity).not.toHaveBeenCalled();
  });
  it.each(["identity", "route", "key"] as const)(
    "denies %s before provider dispatch",
    async (key) => {
      if (key !== "route") h[key].mockRejectedValueOnce(new Error("denied"));
      if (key === "route")
        h.route.mockImplementationOnce(() => {
          throw new Error("denied");
        });
      await expect(run()).rejects.toThrow("denied");
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.claim).not.toHaveBeenCalled();
    },
  );
  it("does not let ordinary requests bypass the evaluation key cap on eval-only routes", async () => {
    h.budget.mockResolvedValue({
      route: { ...budgetRoute, purpose: "eval_only" },
      claim: h.claim,
      settle: h.settle,
      cancelBeforeDispatch: h.cancel,
      markUnknown: h.unknown,
    });
    await expect(run(false)).rejects.toThrow("bounded synthetic");
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.cancel).toHaveBeenCalledOnce();
  });
  it("retains the hold and never dispatches on a lost claim acknowledgement", async () => {
    h.claim.mockRejectedValue(new Error("claim uncertain"));
    await expect(run()).rejects.toThrow("claim uncertain");
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("settles billed invalid output and withholds the result without another call", async () => {
    h.provider.mockRejectedValue(
      Object.assign(new Error("invalid output"), { metadata: gatewayBilling }),
    );
    await expect(run()).rejects.toThrow("invalid output");
    expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({ outputValid: false }));
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.write).not.toHaveBeenCalled();
  });
  it("retains unknown billing and refuses absent actual finish or latency metadata", async () => {
    h.provider.mockResolvedValue({ ...gatewayBilling, data: validated("questions") });
    await expect(run()).rejects.toThrow();
    expect(h.settle).toHaveBeenCalledOnce();
  });
  it("cancels before dispatch on permission drift instead of reassembling an approved evaluation", async () => {
    changePermission = true;
    await expect(run()).rejects.toThrow("changed");
    expect(h.cancel).toHaveBeenCalledOnce();
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
});
