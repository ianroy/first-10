import { z } from "zod";

export const measurementChoice = z.enum(["unknown", "granted", "withdrawn"]);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const measurementPreferenceSchema = z
  .object({
    choice: measurementChoice,
    revision,
    policyVersion: z.literal(1),
    collectionEnabled: z.boolean(),
    changedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const saveMeasurementPreferenceSchema = z
  .object({
    choice: measurementChoice,
    expectedRevision: revision,
    requestId: z.string().uuid(),
  })
  .strict();
export const measurementFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum(["UNAUTHENTICATED", "INVALID_INPUT", "CONFLICT", "CAPACITY", "UNAVAILABLE"]),
  })
  .strict();
export const measurementResultSchema = z.union([
  measurementFailureSchema,
  z.object({ ok: z.literal(true), data: measurementPreferenceSchema }).strict(),
]);
export type MeasurementResult = z.infer<typeof measurementResultSchema>;
export type MeasurementPreference = z.infer<typeof measurementPreferenceSchema>;
export const retentionHealthSchema = z
  .object({
    collectionEnabled: z.boolean(),
    instrumentationStart: z.string().datetime({ offset: true }).nullable(),
    lastPurgeAt: z.string().datetime({ offset: true }).nullable(),
    expiredRows: z.number().int().nonnegative().safe(),
    oldestExpiredAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(["disabled", "healthy", "overdue"]),
    producerVersion: z.literal("owner-events-v1"),
  })
  .strict();
