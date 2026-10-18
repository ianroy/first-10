import { z } from "zod";
import { hasLikelySecret } from "@/lib/discovery";
import { jsonBytes } from "@/lib/marketing-plan";
import { secretSchema } from "@/lib/guest-spaces/contracts";
import {
  guestActivityFailureSchema,
  guestActivityResult,
  guestAudienceSchema,
} from "@/lib/guest-activities/contracts";
const text = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => Array.from(v).length <= max)
    .describe(`text:${max}`);
const uuid = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase())
  .describe("uuid");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !v.startsWith("0000") &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().startsWith(v),
  )
  .describe("day");
const instant = z
  .string()
  .datetime()
  .max(35)
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/)
  .describe("instant");
const count = z.number().int().min(0).max(1000000).nullable();
export const guestChannelSchema = z
  .object({
    id: uuid,
    name: text(120),
    medium: z.enum(["physical", "digital"]),
    place: text(500),
    observation: text(2000),
    fitReason: text(1000),
    access: z.enum([
      "unknown",
      "needs_permission",
      "requested",
      "allowed",
      "not_required",
      "denied",
    ]),
    rules: text(1500),
    sourceNote: text(1500),
    checkedOn: day.nullable(),
    estimatedMinutes: count,
    unknowns: text(1000),
  })
  .strict();
export const guestContentSchema = z
  .object({
    id: uuid,
    channelId: uuid,
    format: z.enum([
      "community_post",
      "organizer_email",
      "dm",
      "social_caption",
      "flyer",
      "demo_script",
    ]),
    hook: text(1000),
    truthfulSupport: text(2000),
    body: text(6000),
    builderDisclosure: text(1000),
    callToAction: text(1000),
    destination: text(1000),
    firstUsefulAction: text(1000),
    review: z
      .object({
        truthful: z.boolean(),
        builderDisclosed: z.boolean(),
        accessChecked: z.boolean(),
        destinationChecked: z.boolean(),
      })
      .strict(),
    walkthrough: z
      .object({
        mode: z.enum(["unknown", "self", "peer"]),
        understoodAudience: text(1000),
        actionObserved: text(1500),
        hesitation: text(1000),
        revision: text(1500),
      })
      .strict(),
  })
  .strict();
export const guestOutreachSchema = z
  .object({
    id: uuid,
    channelId: uuid,
    recipientRole: text(200),
    purpose: z.enum(["permission", "interview", "product_test", "follow_up"]),
    subject: text(300),
    body: text(4000),
    respectfulExit: text(1000),
    status: z.enum(["draft", "reviewed", "manually_sent", "replied", "declined"]),
    observation: text(1500),
  })
  .strict();
export const guestTaskSchema = z
  .object({
    id: uuid,
    title: text(200),
    ownerAlias: text(120),
    dueOn: day.nullable(),
    prerequisite: text(1000),
    doneMeans: text(1000),
    status: z.enum(["todo", "doing", "done", "blocked"]),
    completionNote: text(1500),
  })
  .strict();
export const guestMeasurementSchema = z
  .object({
    id: uuid,
    channelId: uuid,
    assetId: uuid.nullable(),
    metric: z.enum(["relevant_reach", "visits", "useful_action", "return", "referral"]),
    cohort: z.enum(["peer_test", "classmate", "external", "automated", "mixed_unknown"]),
    from: day,
    to: day,
    unit: z.enum(["unique_people", "sessions", "events"]),
    count,
    source: text(1500),
    recordedOn: day,
    limitations: text(2000),
  })
  .strict();
const documentBase = z
  .object({
    schemaVersion: z.literal(1),
    title: text(120),
    thinking: z
      .object({
        observations: text(3000),
        reachableAudience: text(1500),
        usefulAction: text(1000),
        channelIdeas: text(2000),
        completedAt: instant.nullable(),
      })
      .strict(),
    audience: z
      .object({
        beachhead: text(1500),
        situation: text(1500),
        valueProposition: text(2000),
        assumptions: text(2000),
        sourceNotes: text(3000),
      })
      .strict(),
    channels: z.array(guestChannelSchema).max(12),
    primaryChannelId: uuid.nullable(),
    alternativeChannelId: uuid.nullable(),
    selectionReason: text(1500),
    content: z.array(guestContentSchema).max(20),
    outreach: z.array(guestOutreachSchema).max(20),
    resources: z
      .object({
        cashBudgetCents: z.literal(0),
        availableMinutes: count,
        existingResources: text(1500),
        limitations: text(1500),
        fallback: text(1500),
      })
      .strict(),
    test: z
      .object({
        hypothesis: text(2000),
        state: z.enum(["draft", "ready_to_review", "running", "reviewed"]),
        primaryMetric: z.enum(["relevant_reach", "visits", "useful_action", "return", "referral"]),
        baseline: count,
        target: count,
        unknowns: text(1500),
        measurementPlan: text(2000),
        repeatIf: text(1000),
        reviseIf: text(1000),
        stopIf: text(1000),
        startOn: day.nullable(),
        endOn: day.nullable(),
        reviewOn: day.nullable(),
        tasks: z.array(guestTaskSchema).max(30),
      })
      .strict(),
    measurements: z.array(guestMeasurementSchema).max(40),
    reflection: z
      .object({
        decision: z.enum(["unknown", "repeat", "revise", "stop"]),
        evidenceIds: z.array(uuid).max(40),
        learned: text(3000),
        uncertainty: text(2000),
        nextAction: text(2000),
      })
      .strict(),
  })
  .strict();
export const GUEST_MARKETING_LIMITS = {
  documentBytes: 262144,
  privatePlans: 3,
  teamPlans: 5,
  receipts: 2000,
} as const;
export const guestMarketingDocumentSchema = documentBase.superRefine((d, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (jsonBytes(d) > GUEST_MARKETING_LIMITS.documentBytes)
    fail("This plan is too large. Export or shorten it before saving.");
  const all = [...d.channels, ...d.content, ...d.outreach, ...d.test.tasks, ...d.measurements].map(
    (v) => v.id,
  );
  if (new Set(all).size !== all.length) fail("Plan identifiers must be unique.");
  const channels = new Set(d.channels.map((v) => v.id)),
    assets = new Map(d.content.map((v) => [v.id, v]));
  if ([d.primaryChannelId, d.alternativeChannelId].some((v) => v !== null && !channels.has(v)))
    fail("Select a channel in this plan.");
  if (d.primaryChannelId && d.primaryChannelId === d.alternativeChannelId)
    fail("Choose distinct primary and alternative channels.");
  if ([...d.content, ...d.outreach, ...d.measurements].some((v) => !channels.has(v.channelId)))
    fail("Use channels in this plan only.");
  if (
    d.measurements.some(
      (v) =>
        v.from > v.to || (v.assetId !== null && assets.get(v.assetId)?.channelId !== v.channelId),
    )
  )
    fail("Check measurement dates and channel/content scope.");
  if (d.reflection.evidenceIds.some((v) => !d.measurements.some((m) => m.id === v)))
    fail("Select measurements from this plan.");
  if (d.test.startOn && d.test.endOn && d.test.startOn > d.test.endOn)
    fail("Test end must follow its start.");
  if (
    d.thinking.completedAt &&
    (!d.thinking.observations ||
      !d.thinking.reachableAudience ||
      !d.thinking.usefulAction ||
      !d.thinking.channelIdeas)
  )
    fail("Record your own thinking before preserving it.");
  if (hasLikelySecret(JSON.stringify(d)))
    fail("Remove credentials or likely secrets before saving.");
});
export type GuestMarketingDocument = z.infer<typeof guestMarketingDocumentSchema>;
export function createGuestMarketing(): GuestMarketingDocument {
  return {
    schemaVersion: 1,
    title: "",
    thinking: {
      observations: "",
      reachableAudience: "",
      usefulAction: "",
      channelIdeas: "",
      completedAt: null,
    },
    audience: {
      beachhead: "",
      situation: "",
      valueProposition: "",
      assumptions: "",
      sourceNotes: "",
    },
    channels: [],
    primaryChannelId: null,
    alternativeChannelId: null,
    selectionReason: "",
    content: [],
    outreach: [],
    resources: {
      cashBudgetCents: 0,
      availableMinutes: null,
      existingResources: "",
      limitations: "",
      fallback: "",
    },
    test: {
      hypothesis: "",
      state: "draft",
      primaryMetric: "useful_action",
      baseline: null,
      target: null,
      unknowns: "",
      measurementPlan: "",
      repeatIf: "",
      reviseIf: "",
      stopIf: "",
      startOn: null,
      endOn: null,
      reviewOn: null,
      tasks: [],
    },
    measurements: [],
    reflection: {
      decision: "unknown",
      evidenceIds: [],
      learned: "",
      uncertainty: "",
      nextAction: "",
    },
  };
}
export function preservedMarketingError(
  before: GuestMarketingDocument,
  after: GuestMarketingDocument,
): string | null {
  return before.thinking.completedAt &&
    JSON.stringify(before.thinking) !== JSON.stringify(after.thinking)
    ? "Your first thinking is preserved. Refine the audience and later steps instead."
    : null;
}
export const guestMarketingRecordSchema = z
  .object({
    id: uuid,
    classId: uuid,
    teamId: uuid,
    authorPrincipalId: uuid,
    audience: guestAudienceSchema,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    savedAt: z.string().datetime({ offset: true }),
    document: guestMarketingDocumentSchema,
    aiEnabled: z.literal(false),
  })
  .strict();
export type GuestMarketingRecord = z.infer<typeof guestMarketingRecordSchema>;
export const guestMarketingHeaderSchema = guestMarketingRecordSchema.omit({ document: true });
export const guestMarketingReceiptSchema = z
  .object({
    record: guestMarketingRecordSchema,
    savedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    replayed: z.boolean(),
  })
  .strict();
export const listGuestMarketingSchema = z.object({ csrf: secretSchema }).strict();
export const loadGuestMarketingSchema = listGuestMarketingSchema.extend({ planId: uuid }).strict();
export const saveGuestMarketingSchema = loadGuestMarketingSchema
  .extend({
    audience: guestAudienceSchema,
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    mutationId: uuid,
    sharedAudienceConfirmed: z.boolean(),
    document: guestMarketingDocumentSchema,
  })
  .strict()
  .superRefine((d, c) => {
    if (d.audience === "team_shared" && d.expectedRevision === 0 && !d.sharedAudienceConfirmed)
      c.addIssue({
        code: "custom",
        message: "Confirm the shared audience before creating this blank team plan.",
      });
  });
export type SaveGuestMarketingInput = z.infer<typeof saveGuestMarketingSchema>;
export { guestActivityFailureSchema, guestActivityResult };
/** Closed SQL shape derives from the same Zod object. Semantic reference checks run in both tiers. */
export function guestMarketingSqlShape(
  schema: z.ZodTypeAny = documentBase,
): Record<string, unknown> {
  const d = schema._def,
    tag = d.typeName as string,
    description = schema.description;
  if (tag === "ZodNullable") return { ...guestMarketingSqlShape(d.innerType), nullable: true };
  if (description?.startsWith("text:"))
    return { type: "string", maxLength: Number(description.slice(5)) };
  if (["uuid", "day", "instant"].includes(description ?? ""))
    return {
      type: "string",
      format: description,
      maxLength: description === "uuid" ? 36 : description === "day" ? 10 : 35,
    };
  if (tag === "ZodEffects") return guestMarketingSqlShape(d.schema);
  if (tag === "ZodObject")
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(d.shape()).map(([k, v]) => [k, guestMarketingSqlShape(v as z.ZodTypeAny)]),
      ),
    };
  if (tag === "ZodArray")
    return { type: "array", maxItems: d.maxLength.value, items: guestMarketingSqlShape(d.type) };
  if (tag === "ZodLiteral")
    return { type: typeof d.value === "number" ? "integer" : "string", const: d.value };
  if (tag === "ZodEnum") return { type: "string", enum: d.values };
  if (tag === "ZodBoolean") return { type: "boolean" };
  if (tag === "ZodNumber") return { type: "integer", minimum: 0, maximum: 1000000 };
  throw new Error("Unsupported guest marketing field");
}
