import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  budgetInputBinding,
  createBudgetSession,
  prepareAIBudget,
  type BudgetInput,
  type BudgetRpcClient,
} from "@/lib/ai/budget.server";
import {
  budgetRouteSchema,
  dollarsToMicro,
  providerBudgetParameters,
  reservedMicro,
  trustedUsageSchema,
} from "@/lib/ai/budget-contract";
const boundary = vi.hoisted(() => ({ request: vi.fn(), rpc: vi.fn(), imported: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: boundary.request }));
vi.mock("@/integrations/supabase/client.server", () => {
  boundary.imported();
  return { supabaseAdmin: { rpc: boundary.rpc } };
});
const id = "fa140000-0000-4000-8000-000000000001";
const route = {
  purpose: "product",
  eval_user_id: null,
  eval_project_id: null,
  eval_context_sha256: null,
  kind: "questions",
  version: 1,
  enabled: true,
  model: "google/gemini-2.5-flash-lite",
  provider_slug: "google-vertex",
  response_providers: ["Google Vertex"],
  input_token_ceiling: 10_000,
  output_token_ceiling: 1_000,
  input_byte_ceiling: 200_000,
  prompt_micro_per_million: 100_000,
  completion_micro_per_million: 400_000,
  bounds_review_sha256: "a".repeat(64),
  quality_review_sha256: "b".repeat(64),
  checked_at: "2026-10-18T00:00:00+00:00",
  expires_at: "2026-10-19T00:00:00+00:00",
  operator_reference: "test-only",
} as const;
const input: BudgetInput = {
  operationId: id,
  userId: id,
  projectId: id,
  kind: "questions",
  context: {
    system: "Authorized context",
    user: "私🙂",
    schema: {},
    promptId: "private-questions",
    promptVersion: 1,
    schemaId: "questions",
    schemaVersion: 1,
  },
};
function receipt(overrides: Record<string, unknown> = {}) {
  return {
    operationId: id,
    state: "reserved",
    reservedMicro: 1400,
    chargeMicro: 1400,
    resultAllowed: false,
    route,
    ...overrides,
  };
}
function client(responses: unknown[]) {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn(async () => ({ data: responses.shift(), error: null })),
  }));
  return { rpc } as unknown as BudgetRpcClient & { rpc: ReturnType<typeof vi.fn> };
}
const usage = {
  generationId: "gen-test-1",
  model: route.model,
  provider: "Google Vertex",
  costUsd: 0.0000011,
  promptTokens: 100,
  completionTokens: 10,
  outputValid: true,
};
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-fixture-service");
  vi.stubEnv("SUPABASE_URL", "https://synthetic.example.invalid");
  boundary.request.mockReturnValue(
    new Request("https://test.invalid", {
      headers: { authorization: "Bearer synthetic-fixture-session" },
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("budget contracts", () => {
  it("rounds a fraction of a microdollar up, never silently rounds it to free", () => {
    expect(dollarsToMicro(0.0000001)).toBe(1);
    expect(dollarsToMicro(0)).toBe(0);
    for (const invalid of [NaN, Infinity, -1, 1_000_001])
      expect(() => dollarsToMicro(invalid)).toThrow();
  });
  it("reserves the full endpoint input ceiling and bounded billable output using integer products", () => {
    const parsed = budgetRouteSchema.parse(route);
    expect(reservedMicro(parsed)).toBe(1400);
    expect(
      reservedMicro({
        ...parsed,
        input_token_ceiling: 1,
        output_token_ceiling: 1,
        prompt_micro_per_million: 1,
        completion_micro_per_million: 1,
      }),
    ).toBe(1);
  });
  it("uses per-million dollar max_price and a single exact model/provider without fallbacks", () => {
    expect(providerBudgetParameters(budgetRouteSchema.parse(route))).toEqual({
      model: route.model,
      max_tokens: 1000,
      provider: {
        only: ["google-vertex"],
        order: ["google-vertex"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
        max_price: { prompt: 0.1, completion: 0.4 },
      },
    });
  });
  it("binds literal authorized text, UTF8 byte size, schema and version identities", () => {
    const before = budgetInputBinding(input.context);
    expect(before.inputBytes).toBe(Buffer.byteLength(JSON.stringify(input.context), "utf8"));
    expect(before.inputBytes).toBeGreaterThan(JSON.stringify(input.context).length);
    expect(
      budgetInputBinding({
        ...input.context,
        schema: { type: "object", properties: { b: {}, a: {} } },
      }).contextSha256,
    ).toBe(
      budgetInputBinding({
        ...input.context,
        schema: { properties: { a: {}, b: {} }, type: "object" },
      }).contextSha256,
    );
    expect(() => budgetInputBinding({ ...input.context, schema: { extra: undefined } })).toThrow();
    for (const changed of [
      { ...input.context, user: "different" },
      { ...input.context, schemaVersion: 2 },
      { ...input.context, schema: { type: "object" } },
    ])
      expect(budgetInputBinding(changed).contextSha256).not.toBe(before.contextSha256);
  });
  it("rejects missing/nonfinite cost and forged arbitrary provider payload fields", () => {
    for (const costUsd of [undefined, null, NaN, -1, Infinity])
      expect(trustedUsageSchema.safeParse({ ...usage, costUsd }).success).toBe(false);
    expect(trustedUsageSchema.safeParse({ ...usage, output: "do not store" }).success).toBe(false);
    expect(budgetRouteSchema.safeParse({ ...route, model: "unreviewed/cheapest" }).success).toBe(
      false,
    );
  });
});
describe("single-dispatch accounting adapter", () => {
  it("permits exactly one acknowledged claim and settles only trusted metadata", async () => {
    const c = client([
      receipt(),
      receipt({ state: "in_flight", dispatch: true }),
      receipt({ state: "settled", chargeMicro: 2, resultAllowed: true }),
    ]);
    const s = await createBudgetSession(c, input);
    await s.claim();
    await expect(s.claim()).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
    await expect(s.cancelBeforeDispatch()).rejects.toMatchObject({ code: "CANNOT_CANCEL" });
    await expect(s.settle(usage)).resolves.toMatchObject({ chargeMicro: 2 });
    expect(c.rpc).toHaveBeenCalledTimes(3);
    const settlement = c.rpc.mock.calls[2]![1] as Record<string, unknown>;
    expect(Object.keys(settlement).sort()).toEqual([
      "p_attempt_id",
      "p_completion_tokens",
      "p_cost_usd",
      "p_generation_id",
      "p_model",
      "p_operation_id",
      "p_output_valid",
      "p_prompt_tokens",
      "p_provider",
    ]);
  });
  it("never dispatches/retries/cancels after a claim response is lost", async () => {
    const c = client([receipt()]);
    const s = await createBudgetSession(c, input);
    c.rpc.mockImplementationOnce(() => ({
      abortSignal: async () => {
        throw new Error("synthetic timeout");
      },
    }));
    await expect(s.claim()).rejects.toMatchObject({ code: "ACCOUNTING_UNCONFIRMED" });
    await expect(s.claim()).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
    await expect(s.cancelBeforeDispatch()).rejects.toMatchObject({ code: "CANNOT_CANCEL" });
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects duplicate DB claim acknowledgements and previously dispatched intents", async () => {
    const c = client([receipt(), receipt({ state: "in_flight", dispatch: false })]);
    await expect((await createBudgetSession(c, input)).claim()).rejects.toMatchObject({
      code: "NOT_DISPATCHABLE",
    });
    await expect(
      createBudgetSession(client([receipt({ state: "unknown" })]), input),
    ).rejects.toMatchObject({ code: "NOT_DISPATCHABLE" });
  });
  it("rejects wrong operation, scope, price and missing schema acknowledgements without generation", async () => {
    for (const malformed of [
      null,
      receipt({ operationId: "fa140000-0000-4000-8000-000000000002" }),
      receipt({ reservedMicro: 1 }),
      receipt({ route: { ...route, kind: "stage2" } }),
    ])
      await expect(createBudgetSession(client([malformed]), input)).rejects.toMatchObject({
        code: "ACCOUNTING_UNCONFIRMED",
      });
  });
  it("cancels only a known unclaimed reservation", async () => {
    const s = await createBudgetSession(
      client([receipt(), receipt({ state: "cancelled", chargeMicro: 0 })]),
      input,
    );
    await expect(s.cancelBeforeDispatch()).resolves.toMatchObject({ state: "cancelled" });
    await expect(s.settle(usage)).rejects.toMatchObject({ code: "NOT_CLAIMED" });
  });
  it("unknown output keeps the full hold and does not turn missing cost into zero", async () => {
    const c = client([
      receipt(),
      receipt({ state: "in_flight", dispatch: true }),
      receipt({ state: "unknown" }),
    ]);
    const s = await createBudgetSession(c, input);
    await s.claim();
    await expect(s.settle({ ...usage, costUsd: NaN })).rejects.toMatchObject({
      code: "USAGE_UNKNOWN",
    });
    await expect(s.markUnknown("malformed id")).resolves.toMatchObject({ chargeMicro: 1400 });
    expect(c.rpc.mock.calls[2]![1]).toMatchObject({ p_generation_id: null, p_action: "unknown" });
  });
  it("withholds output when settlement records a policy/price violation or invalid output", async () => {
    const s = await createBudgetSession(
      client([
        receipt(),
        receipt({ state: "in_flight", dispatch: true }),
        receipt({ state: "settled", chargeMicro: 9000 }),
      ]),
      input,
    );
    await s.claim();
    await expect(s.settle(usage)).rejects.toMatchObject({ code: "RESULT_WITHHELD" });
  });
});
describe("synthetic evaluation scope", () => {
  it("rejects malformed plan scope and hash lists", () => {
    expect(budgetRouteSchema.safeParse({ ...route, purpose: "eval_only" }).success).toBe(false);
    expect(
      budgetRouteSchema.safeParse({ ...route, eval_context_sha256: ["a".repeat(64)] }).success,
    ).toBe(false);
  });
  it("accepts only exact approved actor/project/context binding for an eval-only route", async () => {
    const scoped = {
      ...route,
      purpose: "eval_only",
      eval_user_id: id,
      eval_project_id: id,
      eval_context_sha256: [budgetInputBinding(input.context).contextSha256],
    };
    await expect(
      createBudgetSession(client([receipt({ route: scoped })]), input),
    ).resolves.toMatchObject({ route: { purpose: "eval_only" } });
    for (const changed of [
      { ...scoped, eval_user_id: "fa140000-0000-4000-8000-000000000099" },
      { ...scoped, eval_project_id: "fa140000-0000-4000-8000-000000000099" },
      { ...scoped, eval_context_sha256: ["f".repeat(64)] },
    ])
      await expect(
        createBudgetSession(client([receipt({ route: changed })]), input),
      ).rejects.toMatchObject({ code: "EVALUATION_SCOPE_DENIED" });
  });
});
describe("fresh caller authorization", () => {
  const scope = { ...input, projectOwnerId: id };
  it("rejects missing bearer, stale user, and owner mismatch before privileged RPC", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "fa140000-0000-4000-8000-000000000099" } },
      error: null,
    }));
    const supabase = { auth: { getUser } } as unknown as Parameters<
      typeof prepareAIBudget
    >[0]["supabase"];
    await expect(prepareAIBudget({ ...scope, supabase })).rejects.toMatchObject({
      code: "UNVERIFIED_OWNER",
    });
    await expect(
      prepareAIBudget({ ...scope, supabase, projectOwnerId: "foreign" }),
    ).rejects.toMatchObject({ code: "UNVERIFIED_OWNER" });
    boundary.request.mockReturnValue(new Request("https://test.invalid"));
    await expect(prepareAIBudget({ ...scope, supabase })).rejects.toMatchObject({
      code: "UNVERIFIED_OWNER",
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.imported).not.toHaveBeenCalled();
  });
});
