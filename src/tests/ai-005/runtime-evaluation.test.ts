import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const h = vi.hoisted(() => ({
  viewer: vi.fn(),
  readiness: vi.fn(),
  prepare: vi.fn(),
  claim: vi.fn(),
  settle: vi.fn(),
  unknown: vi.fn(),
  cancel: vi.fn(),
  gateway: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://fictional.invalid", { headers: { authorization: "Bearer fictional" } }),
}));
vi.mock("@/lib/ai/readiness-access.server", () => ({ requireAIReadinessViewer: h.viewer }));
vi.mock("@/lib/ai/readiness.server", () => ({ inspectRuntimeAIKey: h.readiness }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.gateway }));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.prepare,
}));
import {
  runRuntimeEvaluation,
  runtimeEvaluationPolicy,
  verifyRuntimeEvaluationRoute,
} from "@/lib/ai/runtime-evaluation.server";
import {
  getRuntimeEvaluationCase,
  runtimeEvaluationBindings,
} from "@/lib/ai/runtime-evaluation-plan";
import {
  runtimeCaseIdSchema,
  runtimeCaseOperationId,
  type RuntimeCaseId,
} from "@/lib/ai/runtime-evaluation-contract";
import { aiRequestSchema } from "@/lib/ai/contracts";
import { budgetRoute } from "@/tests/ai-004/fixtures";
import { LIVE_AI_CANDIDATE as candidate } from "@/lib/ai/model-policy";
import { providerBudgetParameters, reservedMicro } from "@/lib/ai/budget-contract";
const actor = "f1d00000-0000-4000-8000-000000000001";
const project = "f1d00000-0000-4000-8000-000000000010";
const workspace = "00000000-0000-4000-8000-000000000001";
const sb = {
  from: vi.fn(() => {
    throw new Error("Raw private read forbidden");
  }),
} as unknown as SupabaseClient<Database>;
const baseline = JSON.parse(readFileSync("evals/offline-baseline.v6.json", "utf8")) as {
  cases: { id: string; output: unknown }[];
};
const route = {
  ...budgetRoute,
  purpose: "eval_only" as const,
  model: candidate.model,
  provider_slug: candidate.providerSlug,
  response_providers: [candidate.responseProvider],
  input_token_ceiling: candidate.inputTokenCeiling,
  output_token_ceiling: candidate.billableOutputTokenCeiling,
  prompt_micro_per_million: candidate.promptMicroPerMillion,
  completion_micro_per_million: candidate.completionMicroPerMillion,
  eval_user_id: actor,
  eval_project_id: project,
  eval_context_sha256: runtimeEvaluationBindings().cases.map((c) => c.contextSha256),
};
const input = (caseId: RuntimeCaseId = runtimeCaseIdSchema.options[0]) => ({
  supabase: sb,
  userId: actor,
  projectId: project,
  caseId,
  operationId: runtimeCaseOperationId(caseId),
});
const billing = {
  requestedModel: candidate.model,
  actualModel: candidate.model,
  provider: "Google",
  generationId: "gen-fictional-v7",
  attempts: 1,
  latencyMs: 1200,
  usage: { cost: 0.001, prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "fictional-runtime-only");
  runtimeEvaluationPolicy.expectedWorkspaceId = workspace;
  h.viewer.mockResolvedValue({ kind: "fictional_presenter", userId: actor });
  h.readiness.mockResolvedValue({
    status: "verified",
    workspaceId: workspace,
    managementKey: false,
    remainingUsd: 2,
  });
  h.prepare.mockImplementation(async (scope) => ({
    route: { ...route, kind: scope.kind },
    claim: h.claim,
    settle: h.settle,
    markUnknown: h.unknown,
    cancelBeforeDispatch: h.cancel,
  }));
  h.gateway.mockImplementation(async (options) => ({
    ...billing,
    data: options.outputValidator(
      baseline.cases.find((c) => c.id === options.kind + "-typical-v6")!.output,
    ),
  }));
});
afterEach(() => {
  runtimeEvaluationPolicy.expectedWorkspaceId = null;
  vi.unstubAllEnvs();
});
describe("fixed runtime evaluation boundary", () => {
  it("ships closed and requires a matching serving workspace before reserving or dispatching", async () => {
    runtimeEvaluationPolicy.expectedWorkspaceId = null;
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.gateway).not.toHaveBeenCalled();
    expect(h.readiness).not.toHaveBeenCalled();
  });
  it.each([
    { status: "unavailable" },
    { status: "verified", workspaceId: "foreign", remainingUsd: 2 },
    { status: "verified", workspaceId: workspace, managementKey: true, remainingUsd: 2 },
    { status: "verified", workspaceId: workspace, remainingUsd: 0.360447 },
  ])("withholds dispatch for unsuitable serving key metadata: %j", async (metadata) => {
    h.readiness.mockResolvedValue(metadata);
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.gateway).not.toHaveBeenCalled();
  });
  it("rejects arbitrary operation IDs and real platform-admin authority without the exact presenter", async () => {
    await expect(
      runRuntimeEvaluation({ ...input(), operationId: crypto.randomUUID() }),
    ).rejects.toThrow();
    expect(h.viewer).not.toHaveBeenCalled();
    h.viewer.mockResolvedValue({ kind: "platform_admin", userId: actor });
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it.each(runtimeCaseIdSchema.options)(
    "uses only the authored sources and exact contract for %s",
    async (caseId) => {
      const fixed = getRuntimeEvaluationCase(caseId);
      h.gateway.mockImplementation(async (options) => ({
        ...billing,
        data: options.outputValidator(
          baseline.cases.find((c) => c.id === caseId.replace(/v7$/, "v6"))!.output,
        ),
      }));
      const result = await runRuntimeEvaluation(input(caseId));
      expect(result).toMatchObject({
        caseId,
        fictional: true,
        contextSha256: fixed.binding.contextSha256,
        operationId: runtimeCaseOperationId(caseId),
        costUsd: 0.001,
      });
      expect(h.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ context: fixed.assembled, kind: fixed.kind }),
      );
      expect(h.prepare.mock.calls[0]![0]).not.toHaveProperty("contextFence");
      expect(h.gateway).toHaveBeenCalledWith(
        expect.objectContaining({
          system: fixed.assembled.system,
          user: fixed.assembled.user,
          schema: fixed.contract.schema,
          kind: fixed.kind,
        }),
      );
      expect(h.claim).toHaveBeenCalledOnce();
      expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({ outputValid: true }));
      expect(h.viewer).toHaveBeenCalledTimes(3);
      expect(sb.from).not.toHaveBeenCalled();
      expect(h.cancel).not.toHaveBeenCalled();
    },
  );
  it("does not dispatch or refund on lost claim acknowledgement", async () => {
    h.claim.mockRejectedValue(new Error("lost acknowledgement"));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.gateway).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("cancels a pre-dispatch reservation if fresh authorization changes", async () => {
    h.viewer
      .mockResolvedValueOnce({ kind: "fictional_presenter", userId: actor })
      .mockRejectedValue(new Error("revoked"));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.cancel).toHaveBeenCalledOnce();
    expect(h.claim).not.toHaveBeenCalled();
  });
  it("withholds a billed response after recipient revocation without cancelling its charge", async () => {
    h.viewer
      .mockResolvedValueOnce({ kind: "fictional_presenter", userId: actor })
      .mockResolvedValueOnce({ kind: "fictional_presenter", userId: actor })
      .mockRejectedValue(new Error("revoked"));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.settle).toHaveBeenCalledOnce();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("holds ambiguous spend and never automatically retries", async () => {
    h.gateway.mockRejectedValue(new Error("network loss"));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.unknown).toHaveBeenCalledOnce();
    expect(h.gateway).toHaveBeenCalledOnce();
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("settles billed invalid output with outputValid false and withholds it", async () => {
    h.gateway.mockRejectedValue(Object.assign(new Error("invalid"), { metadata: billing }));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.settle).toHaveBeenCalledWith(
      expect.objectContaining({ outputValid: false, costUsd: 0.001 }),
    );
    expect(h.unknown).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("never returns output on an unacknowledged settlement", async () => {
    h.settle.mockRejectedValue(new Error("lost acknowledgement"));
    await expect(runRuntimeEvaluation(input())).rejects.toThrow();
    expect(h.gateway).toHaveBeenCalledOnce();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it("rejects broader routes and changed model, tier, price or token ceiling", () => {
    for (const patch of [
      { purpose: "product" },
      { model: "google/gemini-2.5-flash-lite" },
      { provider_slug: "google-vertex/global/flex" },
      { response_providers: ["Google", "Other"] },
      { input_token_ceiling: 1000 },
      { output_token_ceiling: 4000 },
      { prompt_micro_per_million: 250001 },
      { completion_micro_per_million: 1500001 },
    ])
      expect(() =>
        verifyRuntimeEvaluationRoute({ ...route, ...patch } as typeof route, "questions"),
      ).toThrow();
  });
  it("reserves all billable output while requesting 4000 tokens with no provider fallback or data collection", () => {
    expect(reservedMicro(route)).toBe(360448);
    expect(reservedMicro(route) * 8).toBeLessThan(4_000_000);
    expect(providerBudgetParameters(route)).toMatchObject({
      max_tokens: 4000,
      reasoning: { effort: "minimal", exclude: true },
      provider: {
        only: ["google-vertex/global"],
        allow_fallbacks: false,
        data_collection: "deny",
        zdr: true,
        max_price: { prompt: 0.25, completion: 1.5 },
      },
    });
  });
  it("uses eight stable operation identities and rejects editable context or mixed response flags", () => {
    expect(new Set(runtimeCaseIdSchema.options.map(runtimeCaseOperationId)).size).toBe(8);
    const request = {
      kind: "runtime_evaluation",
      projectId: project,
      operationId: runtimeCaseOperationId(runtimeCaseIdSchema.options[0]),
      evaluationCaseId: runtimeCaseIdSchema.options[0],
    };
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
    for (const patch of [
      { evaluationCaseId: undefined },
      { context: "private" },
      { withOrigin: true },
      { withEvaluation: true },
      { kind: "questions" },
    ])
      expect(aiRequestSchema.safeParse({ ...request, ...patch }).success).toBe(false);
  });
});
