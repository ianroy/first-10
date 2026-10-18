import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => {
  process.env["OPENROUTER_API_KEY"] = "synthetic-evaluation-key";
  return { token: "synthetic-token" };
});
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://example.invalid", { headers: { authorization: `Bearer ${h.token}` } }),
}));
import {
  verifyEvaluationIdentity,
  verifyEvaluationKeyMetadata,
  verifyEvaluationRoute,
  preflightEvaluationKey,
} from "@/lib/ai/evaluation.server";
import { budgetRoute } from "@/tests/ai-004/fixtures";
import { aiRequestSchema } from "@/lib/ai/contracts";
const userId = "fa030000-0000-4000-8000-000000000003",
  projectId = "fa030000-0000-4000-8000-000000000002";
const route = {
  ...budgetRoute,
  purpose: "eval_only" as const,
  eval_user_id: userId,
  eval_project_id: projectId,
  eval_context_sha256: ["a".repeat(64)],
};
const metadata = {
  limit: 0.9,
  limit_reset: null,
  include_byok_in_limit: true,
  is_management_key: false,
  limit_remaining: 0.9,
};
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());
describe("bounded evaluation authority", () => {
  it("requires fresh server app metadata, exact identity and no user-metadata substitute", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: userId, app_metadata: { synthetic: true } } },
      error: null,
    });
    const client = { auth: { getUser } } as never;
    await verifyEvaluationIdentity(client, userId);
    expect(getUser).toHaveBeenCalledWith("synthetic-token");
    for (const user of [
      { id: userId, user_metadata: { synthetic: true } },
      { id: projectId, app_metadata: { synthetic: true } },
      { id: userId, app_metadata: { synthetic: "true" } },
    ]) {
      getUser.mockResolvedValue({ data: { user }, error: null });
      await expect(verifyEvaluationIdentity(client, userId)).rejects.toThrow("unavailable");
    }
  });
  it("rejects product or another evaluation scope/hash", () => {
    expect(() => verifyEvaluationRoute(route, userId, projectId, "a".repeat(64))).not.toThrow();
    for (const patch of [
      { purpose: "product" },
      { eval_user_id: projectId },
      { eval_project_id: userId },
      { eval_context_sha256: ["b".repeat(64)] },
    ])
      expect(() =>
        verifyEvaluationRoute({ ...route, ...patch } as never, userId, projectId, "a".repeat(64)),
      ).toThrow("unavailable");
  });
  it("requires a nonresetting dedicated total key cap including BYOK and full reservation", () => {
    expect(() => verifyEvaluationKeyMetadata(metadata, 0.5)).not.toThrow();
    for (const patch of [
      { limit: null },
      { limit: 1 },
      { limit_reset: "daily" },
      { include_byok_in_limit: false },
      { is_management_key: true },
      { limit_remaining: 0.01 },
      { limit_remaining: 2 },
    ])
      expect(() => verifyEvaluationKeyMetadata({ ...metadata, ...patch }, 0.5)).toThrow(
        "unavailable",
      );
  });
  it("checks the actual supplied server key once at the fixed endpoint with redirect and timeout guards", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: metadata })));
    vi.stubGlobal("fetch", fetcher);
    await preflightEvaluationKey("synthetic-evaluation-key", route);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.Authorization === "Bearer synthetic-evaluation-key").toBe(true);
  });
  it("fails closed on oversized, malformed, ambiguous or rejected key metadata without echoing it", async () => {
    for (const response of [
      new Response("x".repeat(16385)),
      new Response("not JSON"),
      new Response("{}"),
      new Response("private body", { status: 403 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(preflightEvaluationKey("synthetic-evaluation-key", route)).rejects.toThrow(
        "unavailable",
      );
    }
  });
  it("keeps ordinary requests compatible and rejects demo/dual wrappers", () => {
    const request = { kind: "questions", projectId, operationId: userId };
    expect(aiRequestSchema.parse(request)).toEqual(request);
    expect(aiRequestSchema.safeParse({ ...request, withEvaluation: true }).success).toBe(true);
    expect(
      aiRequestSchema.safeParse({ ...request, kind: "marketing_demo", withEvaluation: true })
        .success,
    ).toBe(false);
    expect(
      aiRequestSchema.safeParse({ ...request, withOrigin: true, withEvaluation: true }).success,
    ).toBe(false);
  });
});

it("gateway retains the actual finish reason and measures elapsed response time", async () => {
  const { requestStructuredDraft } = await import("@/lib/ai/gateway.server");
  let now = 100;
  const result = await requestStructuredDraft({
    key: "synthetic-evaluation-key",
    kind: "questions",
    system: "Synthetic",
    user: "Synthetic",
    schema: {},
    route: budgetRoute,
    now: () => now,
    fetcher: async () => {
      now = 137;
      return new Response(
        JSON.stringify({
          id: "gen-measured",
          model: budgetRoute.model,
          provider: "Google Vertex",
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cost: 0.000001 },
          choices: [
            {
              finish_reason: "tool_calls",
              message: { content: JSON.stringify({ questions: ["Recent event?"] }) },
            },
          ],
        }),
      );
    },
  });
  expect(result.finishReason).toBe("tool_calls");
  expect(result.latencyMs).toBe(37);
});
