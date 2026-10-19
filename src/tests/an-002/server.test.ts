import { beforeEach, describe, expect, it, vi } from "vitest";
import { measurementRpc, measurementRetentionHealth } from "@/lib/events.server";
import {
  saveMeasurementPreferenceSchema,
  measurementResultSchema,
} from "@/lib/analytics-contracts";
const owner = "c2500000-0000-4000-8000-000000000001";
const preference = {
  ok: true,
  data: {
    choice: "unknown",
    revision: 0,
    policyVersion: 1,
    collectionEnabled: false,
    changedAt: null,
  },
};
const h = { getUser: vi.fn(), rpc: vi.fn(), abort: vi.fn() };
const client = { auth: { getUser: h.getUser }, rpc: h.rpc } as unknown as Parameters<
  typeof measurementRpc
>[0];
beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  h.abort.mockResolvedValue({ data: preference, error: null });
  h.rpc.mockReturnValue({ abortSignal: h.abort });
});
describe("optional measurement authority and private projection", () => {
  it("rechecks current identity before the owner-scoped RPC, never takes a target account", async () => {
    expect(
      await measurementRpc(
        client,
        "Bearer fictional",
        owner,
        "get_product_measurement_preference",
        {},
      ),
    ).toEqual(preference);
    expect(h.getUser).toHaveBeenCalledWith("fictional");
    expect(h.rpc).toHaveBeenCalledWith("get_product_measurement_preference", {});
  });
  it("denies mismatched or removed identities without calling the database", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    expect(
      await measurementRpc(
        client,
        "Bearer fictional",
        owner,
        "get_product_measurement_preference",
        {},
      ),
    ).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects secret-bearing unknown response fields and redacts transport failures", async () => {
    h.abort.mockResolvedValueOnce({
      data: { ...preference, rawNotes: "PRIVATE_SENTINEL" },
      error: null,
    });
    expect(
      await measurementRpc(
        client,
        "Bearer fictional",
        owner,
        "get_product_measurement_preference",
        {},
      ),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    h.abort.mockRejectedValueOnce(new Error("PRIVATE_SENTINEL"));
    expect(
      await measurementRpc(
        client,
        "Bearer fictional",
        owner,
        "get_product_measurement_preference",
        {},
      ),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("cannot smuggle identities, milestones or provider charges into a preference command", () => {
    const request = { choice: "granted", expectedRevision: 0, requestId: owner };
    expect(saveMeasurementPreferenceSchema.safeParse(request).success).toBe(true);
    for (const field of [
      "userId",
      "event_name",
      "chargeMicro",
      "notes",
      "population",
      "projectId",
    ]) {
      expect(
        saveMeasurementPreferenceSchema.safeParse({ ...request, [field]: "PRIVATE" }).success,
      ).toBe(false);
    }
  });
  it("missing authentication never forwards a caller-controlled token or content", async () => {
    expect(
      await measurementRpc(client, null, owner, "get_product_measurement_preference", {}),
    ).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("ordinary owner and presenter metadata cannot authorize retention health", async () => {
    h.getUser.mockResolvedValue({
      data: { user: { id: owner, app_metadata: { firstten_demo_admin: true } } },
      error: null,
    });
    h.abort.mockResolvedValue({ data: null, error: null });
    await expect(measurementRetentionHealth(client, "Bearer fictional", owner)).rejects.toThrow(
      "Admin access denied",
    );
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("get_platform_admin_authorization");
  });
  it("authorized health transport errors never expose raw exception payloads", async () => {
    h.abort
      .mockResolvedValueOnce({ data: { userId: owner }, error: null })
      .mockRejectedValueOnce(new Error("PRIVATE_DATABASE_SENTINEL"));
    await expect(measurementRetentionHealth(client, "Bearer fictional", owner)).rejects.toThrow(
      "Measurement health unavailable.",
    );
  });
  it("strict result types preserve unknown, disabled and unconfirmed outcomes", () => {
    expect(measurementResultSchema.parse(preference)).toEqual(preference);
    expect(
      measurementResultSchema.safeParse({ ok: true, data: { ...preference.data, choice: "yes" } })
        .success,
    ).toBe(false);
  });
});
