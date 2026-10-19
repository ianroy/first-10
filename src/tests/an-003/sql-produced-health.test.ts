import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { scheduledRetentionHealthSchema } from "../../lib/measurement-retention/contracts";
const path = process.env["FIRSTTEN_AN003_ACTUAL_HEALTH"];
it.skipIf(!path)("parses the actual audited SQL DTO with no raw identifiers or metadata", () => {
  const health = scheduledRetentionHealthSchema.parse(JSON.parse(readFileSync(path!, "utf8")));
  expect(health.collectionEnabled).toBe(false);
  expect(health.retentionReady).toBe(false);
  expect(health.retentionStatus).toBe("unscheduled");
  expect(health.expiredRowsCapped).toBe(10000);
  expect(health.countCapped).toBe(true);
});
