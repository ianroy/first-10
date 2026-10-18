import { z } from "zod";
import { secretSchema } from "@/lib/guest-spaces/contracts";
import { guestActivityResult } from "@/lib/guest-activities/contracts";
import type { GuestMarketingRecord } from "../contracts";
const uuid = z.string().uuid();
const text = (n: number) => z.string().refine((v) => Array.from(v).length <= n);
const integer = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const instant = z.string().datetime({ offset: true });
export const HANDOFF_LIMITS = {
  publisherBytes: 2097152,
  classBytes: 16777216,
  payloadBytes: 40000,
  excerpts: 12,
} as const;
export const marketingSelectionSchema = z
  .object({
    kind: z.enum([
      "thinking",
      "audience",
      "resources",
      "test",
      "reflection",
      "channel",
      "content",
      "outreach",
      "task",
      "measurement",
    ]),
    recordId: uuid,
    excerpt: text(6000)
      .refine((v) => v.length > 0)
      .optional(),
  })
  .strict();
export const marketingReflectionSchema = z
  .object({
    title: text(120).refine((v) => Boolean(v.trim())),
    interpretation: text(3000),
    uncertainty: text(2000),
    decision: text(2000),
    nextAction: text(2000),
  })
  .strict();
export const marketingPayloadSchema = marketingReflectionSchema
  .extend({
    schemaVersion: z.literal(1),
    excerpts: z
      .array(
        z
          .object({
            key: z.string().regex(/^excerpt\.[1-9][0-9]?$/),
            label: text(120).refine((v) => v.length > 0),
            text: text(6000).refine((v) => v.length > 0),
            sourceKind: z.literal("guest_marketing"),
            evidenceLabel: z.literal(
              "Student-authored / student-reported; not verified customer evidence",
            ),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export const marketingChoiceSchema = z
  .object({ planId: uuid, choice: z.enum(["unknown", "granted", "withdrawn"]), revision: integer })
  .strict();
const scope = z.object({ csrf: secretSchema }).strict();
export const readMarketingChoiceSchema = scope.extend({ planId: uuid }).strict();
export const saveMarketingChoiceSchema = readMarketingChoiceSchema
  .extend({
    choice: z.enum(["unknown", "granted", "withdrawn"]),
    expectedRevision: integer,
    requestId: uuid,
  })
  .strict();
export const previewMarketingSchema = scope
  .extend({
    planId: uuid,
    expectedPlanRevision: integer.min(1),
    assignmentId: uuid,
    threadId: uuid,
    requestId: uuid,
    selections: z.array(marketingSelectionSchema).min(1).max(12),
    redactions: z.array(text(200).refine((v) => Boolean(v.trim()))).max(30),
    reflection: marketingReflectionSchema,
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.selections.map((s) => `${s.kind}:${s.recordId}`)).size !== v.selections.length)
      c.addIssue({ code: "custom", message: "Select each source once." });
  });
export const marketingPreviewSchema = z
  .object({
    id: uuid,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    threadId: uuid,
    expiresAt: instant,
    audience: z.literal("teacher"),
    payload: marketingPayloadSchema,
  })
  .strict();
export const confirmMarketingSchema = scope
  .extend({
    previewId: uuid,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: uuid,
    selectedCopyConfirmed: z.literal(true),
  })
  .strict();
export const marketingSubmissionHeaderSchema = z
  .object({
    id: uuid,
    threadId: uuid,
    classId: uuid,
    assignmentId: uuid,
    sourceType: z.literal("guest_marketing"),
    version: z.number().int().min(1).max(20),
    audience: z.literal("teacher"),
    authorLabel: text(80).refine((v) => v.length > 0),
    submittedAt: instant,
    grantState: z.enum(["active", "withdrawn"]),
    grantRevision: integer.min(1),
    recipientEligible: z.boolean(),
    title: text(120),
  })
  .strict();
export const marketingSubmissionViewSchema = marketingSubmissionHeaderSchema
  .extend({ payload: marketingPayloadSchema })
  .strict();
export type MarketingSubmissionView = z.infer<typeof marketingSubmissionViewSchema>;
export const marketingSubmissionPageSchema = z
  .object({ items: z.array(marketingSubmissionHeaderSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export const readMarketingSubmissionSchema = scope.extend({ snapshotId: uuid }).strict();
export const listMarketingSubmissionsSchema = scope.extend({ cursor: uuid.optional() }).strict();
export const withdrawMarketingSchema = readMarketingSubmissionSchema
  .extend({ requestId: uuid })
  .strict();
export { guestActivityResult };
export function marketingSelectionOptions(record: GuestMarketingRecord) {
  const id = record.id,
    d = record.document;
  return [
    ...(["thinking", "audience", "resources", "test", "reflection"] as const).map((kind) => ({
      key: kind,
      label:
        kind === "thinking" ? "Preserved first thinking" : kind[0]!.toUpperCase() + kind.slice(1),
      selection: { kind, recordId: id },
    })),
    ...(
      [
        ["channel", d.channels],
        ["content", d.content],
        ["outreach", d.outreach],
        ["task", d.test.tasks],
        ["measurement", d.measurements],
      ] as const
    ).flatMap(([kind, rows]) =>
      rows.map((r, i) => ({
        key: `${kind}:${r.id}`,
        label: `${kind[0]!.toUpperCase() + kind.slice(1)} ${i + 1}`,
        selection: { kind, recordId: r.id },
      })),
    ),
  ];
}
