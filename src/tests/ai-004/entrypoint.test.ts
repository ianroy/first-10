import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  request: vi.fn(),
  prepare: vi.fn(),
  write: vi.fn(),
  budget: vi.fn(),
  claim: vi.fn(),
  cancel: vi.fn(),
  settle: vi.fn(),
  unknown: vi.fn(),
  project: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/gateway.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/gateway.server")>()),
  requestStructuredDraft: h.request,
}));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
import { generateAI } from "@/lib/ai.functions";
import { AIGatewayError } from "@/lib/ai/gateway.server";
import { budgetRoute, gatewayBilling } from "./fixtures";
const operationId = "fa140000-0000-4000-8000-000000000111";
const projectId = "fa140000-0000-4000-8000-000000000010";
const owner = "fa140000-0000-4000-8000-000000000001";
const project = { id: projectId, user_id: owner, archived_at: null };
const permitted = {
  project: {
    name: "Synthetic",
    description: "Approved fictional fixture",
    audience: "Fictional people",
    problem: "Untested",
  },
  interviews: [],
  learnings: [],
  contacts: [],
  excluded: { interviews: 1, contacts: 1, learnings: 1 },
};
const sb = {
  rpc: () => ({ abortSignal: h.context }),
  from: () => {
    const q = { select: () => q, eq: () => q, single: h.project };
    return q;
  },
};
const invoke = (id = operationId) =>
  (generateAI as unknown as (arg: unknown) => Promise<unknown>)({
    data: { kind: "questions", projectId, operationId: id, withOrigin: true },
    context: { supabase: sb, userId: owner },
  });
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.clearAllMocks();
  h.project.mockResolvedValue({ data: project, error: null });
  h.context.mockResolvedValue({ data: { ok: true, data: permitted }, error: null });
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue("origin-fixture");
  h.budget.mockResolvedValue({
    route: budgetRoute,
    claim: h.claim,
    cancelBeforeDispatch: h.cancel,
    settle: h.settle,
    markUnknown: h.unknown,
  });
  h.claim.mockResolvedValue({ route: budgetRoute });
  h.cancel.mockResolvedValue({ state: "cancelled" });
  h.settle.mockResolvedValue({ state: "settled", resultAllowed: true });
  h.unknown.mockResolvedValue({ state: "unknown" });
  h.request.mockResolvedValue({ ...gatewayBilling, data: { questions: ["Recent example?"] } });
});
afterEach(() => vi.unstubAllEnvs());
describe("generateAI atomic budget boundary", () => {
  it("binds the stable caller intent, rechecks context, settles before provenance and returns", async () => {
    await expect(invoke()).resolves.toEqual({
      data: { questions: ["Recent example?"] },
      originId: "origin-fixture",
    });
    // Boolean key check must precede any full argument diffs.
    expect(h.request.mock.calls[0]?.[0].key === "synthetic-fixture-key").toBe(true);
    expect(h.budget).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        userId: owner,
        projectId,
        context: expect.objectContaining({ promptVersion: 1, schemaVersion: 1 }),
      }),
    );
    expect(h.context).toHaveBeenCalledTimes(2);
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ route: budgetRoute }));
    expect(h.settle).toHaveBeenCalledWith({
      generationId: gatewayBilling.generationId,
      model: gatewayBilling.actualModel,
      provider: gatewayBilling.provider,
      costUsd: 0.0002,
      promptTokens: 100,
      completionTokens: 10,
      outputValid: true,
    });
    expect(h.settle.mock.invocationCallOrder[0]).toBeLessThan(h.write.mock.invocationCallOrder[0]!);
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.unknown).not.toHaveBeenCalled();
  });
  it("rejects late owner changes and cancels only the still-unclaimed reservation", async () => {
    h.project
      .mockResolvedValueOnce({ data: project, error: null })
      .mockResolvedValueOnce({ data: { ...project, user_id: "another-owner" }, error: null });
    await expect(invoke()).rejects.toThrow("Project access changed");
    expect(h.cancel).toHaveBeenCalledOnce();
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });
  it("rejects permission withdrawal or changed source binding immediately before claim", async () => {
    h.context
      .mockResolvedValueOnce({ data: { ok: true, data: permitted }, error: null })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            ...permitted,
            project: { ...permitted.project, description: "CHANGED_OR_REDACTED" },
          },
        },
        error: null,
      });
    await expect(invoke()).rejects.toThrow("processing choices or source material changed");
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
    expect(h.cancel).toHaveBeenCalledOnce();
  });
  it("never dispatches, cancels or automatically retries after a lost claim acknowledgement", async () => {
    h.claim.mockRejectedValueOnce(new Error("Accounting acknowledgement unavailable"));
    await expect(invoke()).rejects.toThrow("Accounting acknowledgement unavailable");
    expect(h.request).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.claim).toHaveBeenCalledOnce();
    h.budget.mockRejectedValueOnce(new Error("NOT_DISPATCHABLE"));
    await expect(invoke()).rejects.toThrow("NOT_DISPATCHABLE");
    expect(h.budget.mock.calls.map(([scope]) => scope.operationId)).toEqual([
      operationId,
      operationId,
    ]);
    expect(h.request).not.toHaveBeenCalled();
    expect(h.claim).toHaveBeenCalledOnce();
  });
  it("records billed invalid output with outputValid=false and returns no draft", async () => {
    h.request.mockRejectedValueOnce(
      new AIGatewayError("INVALID_SCHEMA", "Invalid AI draft", 1, gatewayBilling),
    );
    h.settle.mockRejectedValueOnce(new Error("RESULT_WITHHELD"));
    await expect(invoke()).rejects.toThrow("Invalid AI draft");
    expect(h.settle).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0.0002, outputValid: false }),
    );
    expect(h.unknown).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.request).toHaveBeenCalledOnce();
  });
  it.each([null, undefined, "0.0002", NaN])(
    "retains unknown usage rather than inventing a zero charge (%s)",
    async (cost) => {
      h.request.mockResolvedValueOnce({
        ...gatewayBilling,
        usage: { ...gatewayBilling.usage, cost },
        data: { questions: ["Q"] },
      });
      await expect(invoke()).rejects.toThrow("cost could not be confirmed");
      expect(h.unknown).toHaveBeenCalledWith(gatewayBilling.generationId);
      expect(h.settle).not.toHaveBeenCalled();
      expect(h.write).not.toHaveBeenCalled();
    },
  );
  it("holds a network outcome and never retries its generation", async () => {
    h.request.mockRejectedValueOnce(
      new AIGatewayError("OUTCOME_UNKNOWN", "Unknown provider outcome", 1),
    );
    await expect(invoke()).rejects.toThrow("Unknown provider outcome");
    expect(h.unknown).toHaveBeenCalledOnce();
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("withholds output after a settlement acknowledgement is lost without paying again", async () => {
    h.settle.mockRejectedValueOnce(new Error("Accounting unconfirmed"));
    await expect(invoke()).rejects.toThrow("Accounting unconfirmed");
    expect(h.write).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("passes the identical intent on a duplicate delivery rather than generating a new UUID", async () => {
    await invoke();
    h.budget.mockRejectedValueOnce(new Error("NOT_DISPATCHABLE"));
    await expect(invoke()).rejects.toThrow("NOT_DISPATCHABLE");
    expect(h.budget.mock.calls.map(([scope]) => scope.operationId)).toEqual([
      operationId,
      operationId,
    ]);
    expect(h.request).toHaveBeenCalledOnce();
  });
});
