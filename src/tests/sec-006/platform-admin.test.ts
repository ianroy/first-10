import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePlatformAdmin, type PlatformAdminClient } from "@/lib/admin-auth.server";
import { auditPlatformAdminAction } from "@/lib/admin-audit.server";

const actor = "f6060000-0000-4000-8000-000000000001";
const other = "f6060000-0000-4000-8000-000000000002";
const requestId = "f6060000-0000-4000-8000-000000000010";
const receipt = "f6060000-0000-4000-8000-000000000011";
const getUser = vi.fn();
const rpc = vi.fn();
const abortSignal = vi.fn();
const client = { auth: { getUser }, rpc } as unknown as PlatformAdminClient;
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  abortSignal.mockResolvedValue({ data: { userId: actor }, error: null });
  rpc.mockReturnValue({ abortSignal });
});

describe("fresh database-backed platform admin boundary", () => {
  it.each([
    null,
    "",
    "Basic fixture",
    "Bearer two tokens",
    "Bearer a,b",
    `Bearer ${"a".repeat(16385)}`,
  ])("rejects invalid bearer before any identity/role call: %s", async (header) => {
    await expect(requirePlatformAdmin(client, header)).rejects.toThrow("Admin access denied.");
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("checks fresh user identity and only a fixed actor-bound role projection", async () => {
    await expect(requirePlatformAdmin(client, "Bearer fixture")).resolves.toEqual({
      userId: actor,
    });
    expect(getUser).toHaveBeenCalledWith("fixture");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_platform_admin_authorization");
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(getUser.mock.invocationCallOrder[0]!).toBeLessThan(rpc.mock.invocationCallOrder[0]!);
  });
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: actor } }, error: { message: "private auth error" } },
    { data: { user: { id: "not-a-user-id" } }, error: null },
  ])("fails before role call for an invalid/deleted identity", async (result) => {
    getUser.mockResolvedValue(result);
    await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
      "Admin access denied.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, false, true, { userId: other }, { userId: actor, rawNotes: "private" }, [actor]])(
    "denies missing, malformed or mismatched grant projection",
    async (data) => {
      abortSignal.mockResolvedValue({ data, error: null });
      await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
        "Admin access denied.",
      );
    },
  );
  it("does not trust user metadata or the separate presenter app marker", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: actor,
          app_metadata: { firstten_demo_admin: true, role: "admin" },
          user_metadata: { is_admin: true, platform_admin: true },
        },
      },
      error: null,
    });
    abortSignal.mockResolvedValue({ data: null, error: null });
    await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
      "Admin access denied.",
    );
  });
  it("rechecks a revoked role for the same bearer without cached success", async () => {
    await requirePlatformAdmin(client, "Bearer fixture");
    abortSignal.mockResolvedValue({ data: null, error: null });
    await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
      "Admin access denied.",
    );
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("redacts database and transport failure details", async () => {
    abortSignal.mockResolvedValue({
      data: { userId: actor },
      error: { message: "private table detail" },
    });
    await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
      /^Admin access denied\.$/,
    );
    getUser.mockRejectedValue(new Error("secret-token-in-upstream-url"));
    await expect(requirePlatformAdmin(client, "Bearer fixture")).rejects.toThrow(
      /^Admin access denied\.$/,
    );
  });
});

describe("bounded append-only aggregate audit boundary", () => {
  it.each(["operational_snapshot", "ai_usage_snapshot", "funnel_snapshot"] as const)(
    "records only fixed %s metadata",
    async (operation) => {
      abortSignal.mockResolvedValue({ data: receipt, error: null });
      await expect(
        auditPlatformAdminAction(client, { operation, outcome: "ready", requestId }),
      ).resolves.toBe(receipt);
      expect(rpc).toHaveBeenCalledExactlyOnceWith("record_platform_admin_action", {
        p_operation: operation,
        p_outcome: "ready",
        p_request_id: requestId,
      });
      expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    },
  );
  it("does not serialize arbitrary extra input into audit data", async () => {
    abortSignal.mockResolvedValue({ data: receipt, error: null });
    await auditPlatformAdminAction(client, {
      operation: "operational_snapshot",
      outcome: "partial",
      requestId,
      privateNotes: "DO NOT STORE",
    } as Parameters<typeof auditPlatformAdminAction>[1]);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("DO NOT STORE");
  });
  it.each([
    { operation: "read_interviews", outcome: "ready", requestId },
    { operation: "role_granted", outcome: "ready", requestId },
    { operation: "operational_snapshot", outcome: "private prose", requestId },
    { operation: "operational_snapshot", outcome: "ready", requestId: "invalid" },
  ])("rejects non-allowlisted values without an RPC", async (data) => {
    await expect(
      auditPlatformAdminAction(client, data as Parameters<typeof auditPlatformAdminAction>[1]),
    ).rejects.toThrow("Admin action could not be recorded.");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "revoked, private details" } },
    { data: "private query error", error: null },
    { data: { id: receipt, private: "text" }, error: null },
  ])("withholds aggregate release on audit failure or malformed receipt", async (result) => {
    abortSignal.mockResolvedValue(result);
    await expect(
      auditPlatformAdminAction(client, {
        operation: "operational_snapshot",
        outcome: "ready",
        requestId,
      }),
    ).rejects.toThrow(
      /^Admin action could not be recorded\. No aggregate response is available\.$/,
    );
  });
});
