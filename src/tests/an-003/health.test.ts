import { describe, expect, it, vi } from "vitest";
import { scheduledRetentionHealthSchema } from "../../lib/measurement-retention/contracts";
import { scheduledMeasurementRetentionHealth } from "../../lib/measurement-retention/health.server";
import type { PlatformAdminClient } from "../../lib/admin-auth.server";
const id = "c2600000-0000-4000-8000-000000000001";
const health = {
  producerVersion: "owner-retention-v1",
  collectionEnabled: false,
  retentionStatus: "unscheduled",
  retentionReady: false,
  jobConfigured: false,
  jobActive: false,
  lastScheduledStart: null,
  lastScheduledEnd: null,
  lastAttemptAt: null,
  lastDrainedAt: null,
  expiredRowsCapped: 0,
  countCapped: false,
  oldestExpiredAt: null,
  historyExpiredRowsCapped: 0,
  historyCountCapped: false,
  historyOldestFinishedAt: null,
};
function client(data: unknown = health, granted = true) {
  const rpc = vi.fn((name: string) => ({
    abortSignal: vi.fn().mockResolvedValue({
      data: name === "get_platform_admin_authorization" ? (granted ? { userId: id } : null) : data,
      error: null,
    }),
  }));
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id } }, error: null });
  return { client: { auth: { getUser }, rpc } as unknown as PlatformAdminClient, rpc, getUser };
}
describe("scheduled retention delivery", () => {
  it("distinguishes disabled collection from unverified cleanup", () =>
    expect(scheduledRetentionHealthSchema.parse(health).retentionStatus).toBe("unscheduled"));
  it("rejects raw data, uncapped counts and fabricated healthy claims", () => {
    for (const data of [
      { ...health, notes: "private" },
      { ...health, expiredRowsCapped: 10001 },
      { ...health, countCapped: true },
      { ...health, retentionReady: true, retentionStatus: "healthy" },
    ])
      expect(scheduledRetentionHealthSchema.safeParse(data).success).toBe(false);
  });
  it("rechecks fresh identity and grant before each audited v2 RPC", async () => {
    const c = client();
    await scheduledMeasurementRetentionHealth(c.client, "Bearer synthetic", id);
    await scheduledMeasurementRetentionHealth(c.client, "Bearer synthetic", id);
    expect(c.getUser).toHaveBeenCalledTimes(2);
    expect(c.rpc.mock.calls.map((x) => x[0])).toEqual([
      "get_platform_admin_authorization",
      "get_product_measurement_retention_health_v2",
      "get_platform_admin_authorization",
      "get_product_measurement_retention_health_v2",
    ]);
  });
  it("denies withdrawn grant before health and strips diagnostic leakage", async () => {
    const c = client(health, false);
    await expect(
      scheduledMeasurementRetentionHealth(c.client, "Bearer synthetic", id),
    ).rejects.toThrow("Scheduled measurement health unavailable.");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    const malformed = client({ ...health, rawSecret: "private" });
    await expect(
      scheduledMeasurementRetentionHealth(malformed.client, "Bearer synthetic", id),
    ).rejects.toThrow("Scheduled measurement health unavailable.");
  });
  it("rejects missing bearer and malformed request without privileged health", async () => {
    const c = client();
    await expect(scheduledMeasurementRetentionHealth(c.client, null, id)).rejects.toThrow();
    await expect(
      scheduledMeasurementRetentionHealth(c.client, "Bearer synthetic", "bad"),
    ).rejects.toThrow();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
