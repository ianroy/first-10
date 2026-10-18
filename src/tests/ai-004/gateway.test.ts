import { describe, expect, it, vi } from "vitest";
import { AIGatewayError, requestStructuredDraft } from "@/lib/ai/gateway.server";
import { trustedGatewayUsage } from "@/lib/ai/budget.server";
import { budgetRoute, gatewayBilling } from "./fixtures";
const options = {
  key: "synthetic-fixture-key",
  kind: "questions" as const,
  schema: {},
  system: "Fixture",
  user: "Fixture",
  route: budgetRoute,
};
const envelope = (overrides: Record<string, unknown> = {}) => ({
  model: gatewayBilling.actualModel,
  provider: gatewayBilling.provider,
  id: gatewayBilling.generationId,
  usage: gatewayBilling.usage,
  choices: [
    {
      finish_reason: "stop",
      message: { content: JSON.stringify({ questions: ["Recent event?"] }) },
    },
  ],
  ...overrides,
});
describe("single-attempt budgeted gateway", () => {
  it("requires explicit reviewed route and ignores model overrides", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(envelope())));
    const { route: _route, ...unbudgeted } = options;
    await expect(requestStructuredDraft({ ...unbudgeted, fetcher })).rejects.toMatchObject({
      code: "BUDGET_POLICY_REQUIRED",
      attempts: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
    await requestStructuredDraft({ ...options, model: "unapproved/override", fetcher });
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe(budgetRoute.model);
    expect(body.max_tokens).toBe(budgetRoute.output_token_ceiling);
    expect(body.provider).toMatchObject({
      only: [budgetRoute.provider_slug],
      allow_fallbacks: false,
      require_parameters: true,
      zdr: true,
      data_collection: "deny",
      max_price: { prompt: 0.1, completion: 0.4 },
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("plugins");
  });
  it.each([401, 402, 429, 500, 503])(
    "never retries HTTP%s or exposes its response body",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response("PRIVATE_PROVIDER_ERROR_BODY", { status }),
      );
      const result = requestStructuredDraft({ ...options, fetcher });
      await expect(result).rejects.toMatchObject({
        code: `HTTP_${status}`,
        attempts: 1,
        metadata: null,
      });
      await expect(result).rejects.not.toThrow("PRIVATE_PROVIDER_ERROR_BODY");
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("never retries unknown network outcomes", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("PRIVATE_NETWORK_DETAILS");
    });
    await expect(requestStructuredDraft({ ...options, fetcher })).rejects.toMatchObject({
      code: "OUTCOME_UNKNOWN",
      attempts: 1,
      metadata: null,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    ["REFUSAL", { finish_reason: "stop", message: { refusal: "PRIVATE_REFUSAL", content: "" } }],
    ["TRUNCATED", { finish_reason: "length", message: { content: "PARTIAL_PRIVATE_TEXT" } }],
    ["EMPTY_RESPONSE", { finish_reason: "stop", message: { content: "" } }],
    ["INVALID_JSON", { finish_reason: "stop", message: { content: "PRIVATE_INVALID_JSON" } }],
    [
      "INVALID_SCHEMA",
      {
        finish_reason: "stop",
        message: { content: JSON.stringify({ privateExtraField: "PRIVATE_SOURCE_TEXT" }) },
      },
    ],
  ])("preserves known account usage for %s while withholding all content", async (code, choice) => {
    let failure: unknown;
    try {
      await requestStructuredDraft({
        ...options,
        fetcher: async () => new Response(JSON.stringify(envelope({ choices: [choice] }))),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AIGatewayError);
    const error = failure as AIGatewayError;
    expect(error.code).toBe(code);
    expect(trustedGatewayUsage(error.metadata, false)).toEqual({
      generationId: gatewayBilling.generationId,
      model: budgetRoute.model,
      provider: gatewayBilling.provider,
      costUsd: 0.0002,
      promptTokens: 100,
      completionTokens: 10,
      outputValid: false,
    });
    expect(JSON.stringify(error)).not.toContain("PRIVATE_");
  });
  it("does not invent actual model/cost/tokens from a valid output with incomplete metadata", async () => {
    const result = await requestStructuredDraft({
      ...options,
      fetcher: async () =>
        new Response(
          JSON.stringify(
            envelope({
              usage: { cost: "0.01", prompt_tokens: 100 },
              model: undefined,
              id: "bad-id",
            }),
          ),
        ),
    });
    expect(result.actualModel).toBeNull();
    expect(result.generationId).toBeNull();
    expect(result.usage.cost).toBeNull();
    expect(result.usage.completion_tokens).toBeNull();
    expect(trustedGatewayUsage(result, true)).toBeNull();
  });
});
