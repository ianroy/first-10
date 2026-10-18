import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  firstThinking: vi.fn(),
  request: vi.fn(),
  token: "Bearer fixture-token",
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://fixture.test", { headers: { authorization: h.token } }),
}));
vi.mock("@/lib/ai/gateway.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gateway.server")>()),
  requestStructuredDraft: h.request,
}));
import { generateFictionalMarketingPractice } from "@/lib/ai/demo-marketing.server";
const owner = "f1d00000-0000-4000-8000-000000000001";
const version = "first-ten-babson-2026-10-18-v1";
const metadata = { firstten_demo_admin: true, synthetic: true, firstten_demo_fixture: version };
const project = () =>
  ({
    id: "f1d00000-0000-4000-8000-000000000010",
    user_id: owner,
    description: "DO_NOT_TRANSMIT_PRIVATE_NOTES",
    audience: "DO_NOT_TRANSMIT_PRIVATE_AUDIENCE",
    checklist: { demo: { fictional: true, fixtureVersion: version } },
  }) as unknown as Project;
const context = (p = project()) => ({
  supabase: {
    auth: { getUser: h.getUser },
    rpc: h.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: h.firstThinking }) }) }),
    }),
  } as unknown as SupabaseClient<Database>,
  userId: owner,
  project: p,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  h.token = "Bearer fixture-token";
  h.getUser.mockResolvedValue({
    data: { user: { id: owner, app_metadata: metadata } },
    error: null,
  });
  h.firstThinking.mockResolvedValue({
    data: { completed_at: "2026-10-18T11:22:37.000Z" },
    error: null,
  });
  h.rpc.mockResolvedValue({
    data: { ok: true, reservedCents: 2, remainingCents: 98 },
    error: null,
  });
  h.request.mockResolvedValue({
    data: { body: "Fictional practice" },
    model: "google/gemini-2.5-flash-lite",
    provider: "Google Vertex",
    usage: { cost: 0.0003 },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("fixed fictional economical AI practice", () => {
  it("enforces student-first completion on the server before any paid reservation", async () => {
    h.firstThinking.mockResolvedValue({ data: { completed_at: null }, error: null });
    await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("first thinking");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { firstten_demo_admin: "true", synthetic: true, firstten_demo_fixture: version },
    { ...metadata, synthetic: false },
    { ...metadata, firstten_demo_fixture: "wrong" },
  ])(
    "rejects missing or forged trusted markers before reserve/provider: %j",
    async (app_metadata) => {
      h.getUser.mockResolvedValue({
        data: { user: { id: owner, app_metadata, user_metadata: metadata } },
        error: null,
      });
      await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("access denied");
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.request).not.toHaveBeenCalled();
    },
  );
  it("freshly verifies token and fictional project marker rather than accepting a profile flag", async () => {
    const p = project();
    p.checklist = { demo: { fictional: false, fixtureVersion: version } };
    await expect(generateFictionalMarketingPractice(context(p))).rejects.toThrow("access denied");
    expect(h.getUser).toHaveBeenCalledWith("fixture-token");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on reservation denial or unavailable configuration without a provider request", async () => {
    h.rpc.mockResolvedValue({ data: { ok: false, code: "BUDGET_EXHAUSTED" }, error: null });
    await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("allowance");
    expect(h.request).not.toHaveBeenCalled();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("unavailable");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
  it("reserves before calling the one gateway and never sends free-text project fields", async () => {
    const result = await generateFictionalMarketingPractice(context());
    expect(h.rpc).toHaveBeenCalledWith("reserve_demo_ai", {
      p_project_id: project().id,
      p_request_id: expect.any(String),
    });
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.request.mock.invocationCallOrder[0]!);
    const options = h.request.mock.calls[0]![0];
    expect(options).toMatchObject({ kind: "marketing_demo", policy: "synthetic-marketing-v1" });
    expect(JSON.stringify(options)).not.toContain("DO_NOT_TRANSMIT");
    expect(result.metadata).toMatchObject({
      costUsd: 0.0003,
      reservedCents: 2,
      remainingCents: 98,
      fictional: true,
      promptVersion: "fictional-marketing-v1",
    });
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("rejects unconfirmed provider/model and never retries or refunds ambiguous calls", async () => {
    h.request.mockResolvedValueOnce({
      data: {},
      model: "expensive-model",
      provider: "Other",
      usage: { cost: 0.0003 },
    });
    await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("unavailable");
    expect(h.request).toHaveBeenCalledOnce();
    expect(h.rpc).toHaveBeenCalledOnce();
  });
  it("accepts the official Google display name for the exclusively pinned Vertex route", async () => {
    h.request.mockResolvedValueOnce({
      data: { body: "Draft" },
      model: "google/gemini-2.5-flash-lite",
      provider: "Google",
      usage: { cost: 0.0003 },
    });
    expect((await generateFictionalMarketingPractice(context())).metadata.provider).toBe("Google");
  });
  it("rejects Google AI Studio despite the shared model name", async () => {
    h.request.mockResolvedValueOnce({
      data: { body: "Draft" },
      model: "google/gemini-2.5-flash-lite",
      provider: "Google AI Studio",
      usage: { cost: 0.0003 },
    });
    await expect(generateFictionalMarketingPractice(context())).rejects.toThrow("unavailable");
  });
  it("keeps unavailable cost unknown instead of treating it as free", async () => {
    h.request.mockResolvedValueOnce({
      data: { body: "Draft" },
      model: "google/gemini-2.5-flash-lite",
      provider: "Google Vertex",
      usage: {},
    });
    expect((await generateFictionalMarketingPractice(context())).metadata.costUsd).toBeNull();
  });
});
