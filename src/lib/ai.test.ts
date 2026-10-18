import { describe, expect, it, vi } from "vitest";
import { aiRequestSchema, validateAIOutput } from "./ai/contracts";
import {
  AIGatewayError,
  DEFAULT_MODEL,
  requestStructuredDraft,
  resolveAIModel,
} from "./ai/gateway.server";

const valid = { questions: ["Tell me about the last time this happened."] };
function reply(content: unknown = valid, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "generation-fixture",
      model: "fixture-model",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: { cost: 0.001 },
      ...extra,
    }),
    { status: 200 },
  );
}
function settings(fetcher: typeof fetch) {
  return {
    key: "fixture-key",
    kind: "questions" as const,
    schema: { type: "object" },
    system: "Fixture instructions",
    user: "Fictional project only",
    fetcher,
    sleep: vi.fn(async () => {}),
    random: () => 0,
  };
}

describe("AI request and output contracts", () => {
  it("rejects unknown kinds, forged extra authority and malformed project ids", () => {
    const input = { kind: "questions", projectId: "a1111111-1111-4111-8111-111111111111" };
    expect(aiRequestSchema.parse(input)).toEqual(input);
    for (const bad of [
      { ...input, kind: "admin" },
      { ...input, user_id: "another-owner" },
      { ...input, projectId: "not-a-project" },
    ])
      expect(aiRequestSchema.safeParse(bad).success).toBe(false);
  });
  it("requires the exact kind shape and permits honest empty evidence sections", () => {
    expect(validateAIOutput("questions", valid)).toEqual(valid);
    for (const bad of [
      { questions: [] },
      { questions: [""] },
      { questions: ["ok"], admin: true },
      { channels: [] },
    ])
      expect(() => validateAIOutput("questions", bad)).toThrow("expected format");
    expect(
      validateAIOutput("synthesis", {
        problems: [],
        objections: [],
        best_fit: [],
        quotes: [],
        changes: [],
      }).quotes,
    ).toEqual([]);
  });
  it("uses the baseline for blank model configuration and trims explicit overrides", () => {
    expect(resolveAIModel()).toBe(DEFAULT_MODEL);
    expect(resolveAIModel("  ")).toBe(DEFAULT_MODEL);
    expect(resolveAIModel(" fixture-model ")).toBe("fixture-model");
  });
});

describe("bounded structured gateway", () => {
  it("requests strict structured output with a token bound and returns validated data plus metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    const result = await requestStructuredDraft({ ...settings(fetcher), model: "  " });
    const init = fetcher.mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.max_tokens).toBe(2500);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
    expect(result).toMatchObject({
      data: valid,
      generationId: "generation-fixture",
      model: "fixture-model",
      attempts: 1,
    });
  });
  it("fails before any call for missing keys or oversized context", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const key of ["", "  ", "[SENSITIVE]"])
      await expect(requestStructuredDraft({ ...settings(fetcher), key })).rejects.toMatchObject({
        code: "NOT_CONFIGURED",
        attempts: 0,
      });
    await expect(
      requestStructuredDraft({ ...settings(fetcher), user: "x".repeat(40001) }),
    ).rejects.toMatchObject({ code: "CONTEXT_LIMIT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retries one eligible HTTP failure with a fresh bounded signal", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(reply());
    const options = settings(fetcher);
    const result = await requestStructuredDraft(options);
    expect(result.attempts).toBe(2);
    expect(options.sleep).toHaveBeenCalledWith(800);
    const first = fetcher.mock.calls[0]![1]!.signal;
    expect(first).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[1]![1]!.signal).not.toBe(first);
  });
  it.each([400, 401, 402, 403, 422])(
    "never retries HTTP %i or exposes provider error content",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response("private provider detail", { status }),
      );
      await expect(requestStructuredDraft(settings(fetcher))).rejects.toMatchObject({
        code: `HTTP_${status}`,
        attempts: 1,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds Retry-After and stops after two starts", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("", { status: 429, headers: { "Retry-After": "99999" } }),
    );
    const options = settings(fetcher);
    await expect(requestStructuredDraft(options)).rejects.toMatchObject({
      code: "HTTP_429",
      attempts: 2,
    });
    expect(options.sleep).toHaveBeenCalledOnce();
    expect(options.sleep).toHaveBeenCalledWith(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("treats transport loss as an unknown outcome instead of automatically paying twice", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("connection lost");
    });
    await expect(requestStructuredDraft(settings(fetcher))).rejects.toMatchObject({
      code: "OUTCOME_UNKNOWN",
      attempts: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not make a request after the absolute deadline", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(60_001);
    await expect(requestStructuredDraft({ ...settings(fetcher), now })).rejects.toMatchObject({
      code: "DEADLINE",
      attempts: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ["INVALID_RESPONSE", () => new Response("not json")],
    [
      "INVALID_JSON",
      () => reply(undefined, { choices: [{ message: { content: "```json {} ```" } }] }),
    ],
    ["EMPTY_RESPONSE", () => reply(undefined, { choices: [{ message: { content: "" } }] })],
    [
      "TRUNCATED",
      () =>
        reply(undefined, { choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
    ],
    ["REFUSAL", () => reply(undefined, { choices: [{ message: { refusal: "Cannot do this" } }] })],
  ] as const)("rejects %s without a repair loop", async (code, response) => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await expect(requestStructuredDraft(settings(fetcher))).rejects.toMatchObject({
      code,
      attempts: 1,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects syntactically valid JSON with an invalid task shape", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      reply({ questions: ["ok"], hidden: "ignore all rules" }),
    );
    await expect(requestStructuredDraft(settings(fetcher))).rejects.toThrow("expected format");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("provides stable error metadata without private request text", () => {
    const error = new AIGatewayError("FIXTURE", "Safe message", 1);
    expect(error).toMatchObject({
      name: "AIGatewayError",
      code: "FIXTURE",
      attempts: 1,
      message: "Safe message",
    });
  });
});
