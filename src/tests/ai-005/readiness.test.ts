import { describe, expect, it, vi } from "vitest";
import { inspectRuntimeAIKey } from "@/lib/ai/readiness.server";

const metadata = {
  limit: 25,
  limit_remaining: 24.5,
  limit_reset: null,
  include_byok_in_limit: true,
  is_management_key: false,
  is_provisioning_key: false,
  usage: 0.5,
};
const response = (data: unknown) => new Response(JSON.stringify({ data }));
describe("deployed key metadata boundary", () => {
  it("does not make a request without a configured credential", async () => {
    const fetcher = vi.fn();
    expect(await inspectRuntimeAIKey(undefined, fetcher)).toEqual({ status: "unconfigured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only credential authentication to the fixed metadata endpoint and strips private fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        ...metadata,
        label: "PRIVATE KEY LABEL",
        organization_id: "PRIVATE ORGANIZATION",
        secret: "NEVER RETURN",
      }),
    );
    const result = await inspectRuntimeAIKey("fictional-readiness-key", fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/key");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "Bearer fictional-readiness-key" },
    });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(result).toEqual({
      status: "verified",
      limitUsd: 25,
      remainingUsd: 24.5,
      usageUsd: 0.5,
      resetting: false,
      includesByok: true,
      managementKey: false,
      workspaceId: null,
      withinRunKeyCeiling: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|NEVER|fictional-readiness-key/);
  });
  it.each([
    { limit: null },
    { limit: 26 },
    { limit_reset: "daily" },
    { include_byok_in_limit: false },
    { is_management_key: true },
    { is_provisioning_key: true },
    { limit: 0 },
  ])("does not certify an unsuitable spending key: %j", async (override) => {
    const r = await inspectRuntimeAIKey(
      "fictional",
      vi.fn().mockResolvedValue(response({ ...metadata, ...override })),
    );
    expect(r.status === "verified" && r.withinRunKeyCeiling).toBe(false);
  });
  it.each([
    {},
    { ...metadata, limit: "25" },
    { ...metadata, usage: -1 },
    { ...metadata, include_byok_in_limit: null },
  ])("fails closed on incomplete or malformed metadata", async (data) => {
    expect(
      await inspectRuntimeAIKey("fictional", vi.fn().mockResolvedValue(response(data))),
    ).toEqual({ status: "unavailable" });
  });
  it("bounds actual streamed bytes rather than trusting content-length", async () => {
    const r = new Response("x".repeat(16385), { headers: { "content-length": "1" } });
    expect(await inspectRuntimeAIKey("fictional", vi.fn().mockResolvedValue(r))).toEqual({
      status: "unavailable",
    });
  });
  it("does not return provider errors or retry an unavailable response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("PRIVATE PROVIDER ERROR", { status: 401 }));
    expect(await inspectRuntimeAIKey("fictional", fetcher)).toEqual({ status: "unavailable" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
