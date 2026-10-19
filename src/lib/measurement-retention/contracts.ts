import { z } from "zod";
const timestamp = z.string().datetime({ offset: true }).nullable();
export const scheduledRetentionHealthSchema = z
  .object({
    producerVersion: z.literal("owner-retention-v1"),
    collectionEnabled: z.boolean(),
    retentionStatus: z.enum([
      "unscheduled",
      "inactive",
      "unverified",
      "failed",
      "backlog",
      "healthy",
      "overdue",
    ]),
    retentionReady: z.boolean(),
    jobConfigured: z.boolean(),
    jobActive: z.boolean(),
    lastScheduledStart: timestamp,
    lastScheduledEnd: timestamp,
    lastAttemptAt: timestamp,
    lastDrainedAt: timestamp,
    expiredRowsCapped: z.number().int().min(0).max(10000),
    countCapped: z.boolean(),
    oldestExpiredAt: timestamp,
    historyExpiredRowsCapped: z.number().int().min(0).max(500),
    historyCountCapped: z.boolean(),
    historyOldestFinishedAt: timestamp,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.retentionReady &&
      (data.retentionStatus !== "healthy" ||
        !data.jobConfigured ||
        !data.jobActive ||
        !data.lastScheduledStart ||
        !data.lastScheduledEnd ||
        !data.lastAttemptAt ||
        !data.lastDrainedAt ||
        data.expiredRowsCapped !== 0 ||
        data.historyExpiredRowsCapped !== 0 ||
        data.countCapped ||
        data.historyCountCapped)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inconsistent scheduled retention health",
      });
    }
    if (data.countCapped && data.expiredRowsCapped !== 10000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent capped count" });
    if (data.historyCountCapped && data.historyExpiredRowsCapped !== 500)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent history count" });
  });
export type ScheduledRetentionHealth = z.infer<typeof scheduledRetentionHealthSchema>;
