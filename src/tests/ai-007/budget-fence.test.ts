import { describe, expect, it, vi } from "vitest";
import { budgetInputBinding, createBudgetSession, type BudgetInput } from "@/lib/ai/budget.server";
import { envelope, projectId } from "./fixtures";
import { assembleAIContextV2 } from "@/lib/prompts/context-v2";
import { budgetRoute } from "@/tests/ai-004/fixtures";
import { reservedMicro } from "@/lib/ai/budget-contract";
const operationId = "fa170000-0000-4000-8000-000000000555";
function setup() {
  const context = assembleAIContextV2(envelope("questions"), projectId, "questions");
  const manifest = context.packed.manifest(budgetInputBinding(context.assembled).contextSha256);
  const input: BudgetInput = {
    operationId,
    userId: projectId,
    projectId,
    kind: "questions",
    context: context.assembled,
    contextFence: manifest,
  };
  const receipt = {
    operationId,
    state: "reserved",
    route: budgetRoute,
    reservedMicro: reservedMicro(budgetRoute),
    chargeMicro: reservedMicro(budgetRoute),
    resultAllowed: false,
  };
  const rpc = vi
    .fn()
    .mockReturnValueOnce({ abortSignal: async () => ({ data: receipt, error: null }) })
    .mockReturnValue({
      abortSignal: async () => ({
        data: { ...receipt, state: "in_flight", dispatch: true },
        error: null,
      }),
    });
  return { input, rpc, manifest };
}
describe("AI007 trusted fenced budget adapter", () => {
  it("claims with the exact mandatory source manifest and never the legacy claim API", async () => {
    const { input, rpc, manifest } = setup();
    const session = await createBudgetSession({ rpc } as never, input);
    await session.claim();
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "reserve_ai_usage",
      "claim_ai_usage_with_context",
    ]);
    expect(rpc.mock.calls[1]![1]).toEqual({
      p_operation_id: operationId,
      p_attempt_id: expect.any(String),
      p_manifest: manifest,
    });
    await expect(session.claim()).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects a mismatched canonical context hash before reserving", async () => {
    const { input, rpc } = setup();
    input.contextFence = { ...input.contextFence!, contextHash: "0".repeat(64) };
    await expect(createBudgetSession({ rpc } as never, input)).rejects.toMatchObject({
      code: "CONTEXT_BINDING_MISMATCH",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("a failed or lost fence acknowledgment cannot fall back to a legacy dispatch", async () => {
    const { input, rpc } = setup();
    const session = await createBudgetSession({ rpc } as never, input);
    rpc.mockReturnValue({
      abortSignal: async () => ({ data: null, error: { message: "Context permission changed" } }),
    });
    await expect(session.claim()).rejects.toMatchObject({ code: "ACCOUNTING_UNCONFIRMED" });
    await expect(session.claim()).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
    await expect(session.cancelBeforeDispatch()).rejects.toMatchObject({ code: "CANNOT_CANCEL" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
