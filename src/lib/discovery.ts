import { z } from "zod";
import { isPublicMarketingUrl, jsonBytes } from "./marketing-plan";
export const DISCOVERY_LIMITS = {
  documentBytes: 196608,
  storedBytes: 262144,
  requestBytes: 294912,
} as const;
export const discoveryId = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
const text = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => Array.from(v).length <= max, `Use at most ${max} characters.`);
const instant = z.string().datetime().max(35);
const publicUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) =>
      isPublicMarketingUrl(v) &&
      !/[?&#](?:[^=&#]*(?:token|secret|password|api_key|authorization|signature|%)[^=&#]*)=/i.test(
        v,
      ),
    "Use a public URL without credentials or secret parameters.",
  );
export const DISCOVERY_SHAPE = {
  type: "object",
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    frame: {
      type: "object",
      properties: {
        problem: { type: "string", maxLength: 3000 },
        solution: { type: "string", maxLength: 3000 },
      },
    },
    hypothesisDraft: {
      type: "object",
      properties: {
        population: { type: "string", maxLength: 500 },
        situation: { type: "string", maxLength: 500 },
        prediction: { type: "string", maxLength: 1000 },
        disconfirming: { type: "string", maxLength: 1000 },
        timeWindow: { type: "string", maxLength: 500 },
        reason: { type: "string", maxLength: 1000 },
      },
    },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 36, format: "uuid" },
          createdAt: { type: "string", maxLength: 35, format: "instant" },
          population: { type: "string", maxLength: 500 },
          situation: { type: "string", maxLength: 500 },
          prediction: { type: "string", maxLength: 1000 },
          disconfirming: { type: "string", maxLength: 1000 },
          timeWindow: { type: "string", maxLength: 500 },
          reason: { type: "string", maxLength: 1000 },
        },
      },
      maxItems: 20,
    },
    selectedHypothesisId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 36, format: "uuid" },
          alias: { type: "string", maxLength: 120 },
          relationship: { type: "string", maxLength: 500 },
          relevance: { type: "string", maxLength: 1000 },
          contactId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          falsePositive: { type: "string", maxLength: 1000 },
          falseNegative: { type: "string", maxLength: 1000 },
          mitigation: { type: "string", maxLength: 1000 },
        },
      },
      maxItems: 5,
    },
    missingPerspectives: { type: "string", maxLength: 2000 },
    scriptDraft: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 120 },
        opening: { type: "string", maxLength: 1500 },
        questions: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 20 },
        closing: { type: "string", maxLength: 1500 },
      },
    },
    scripts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 36, format: "uuid" },
          createdAt: { type: "string", maxLength: 35, format: "instant" },
          hypothesisId: { type: "string", maxLength: 36, format: "uuid" },
          contextIds: {
            type: "array",
            items: { type: "string", maxLength: 36, format: "uuid" },
            maxItems: 20,
          },
          title: { type: "string", maxLength: 120 },
          opening: { type: "string", maxLength: 1500 },
          questions: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 20 },
          closing: { type: "string", maxLength: 1500 },
        },
      },
      maxItems: 20,
    },
    selectedScriptId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
    contexts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 36, format: "uuid" },
          kind: {
            type: "string",
            enum: ["website", "github", "product_text", "prompt", "model_output", "other"],
          },
          label: { type: "string", maxLength: 120 },
          url: { type: "string", maxLength: 2048, format: "url", nullable: true },
          text: { type: "string", maxLength: 6000 },
          capturedAt: { type: "string", maxLength: 35, format: "instant" },
          reviewedAt: { type: "string", maxLength: 35, format: "instant", nullable: true },
          permission: { type: "string", enum: ["own_or_permitted", "unknown"] },
          retrieval: { type: "string", enum: ["link_not_read", "pasted_text"] },
        },
      },
      maxItems: 20,
    },
    excludedContextIds: {
      type: "array",
      items: { type: "string", maxLength: 36, format: "uuid" },
      maxItems: 20,
    },
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 36, format: "uuid" },
          interviewId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          scriptId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          sourceCapturedAt: { type: "string", maxLength: 35, format: "instant", nullable: true },
          observation: { type: "string", maxLength: 4000 },
          quote: { type: "string", maxLength: 2000 },
          interpretation: { type: "string", maxLength: 2000 },
          counterevidence: { type: "string", maxLength: 2000 },
        },
      },
      maxItems: 20,
    },
    reflection: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["retain", "narrow", "pivot", "test", "stop"],
          nullable: true,
        },
        reason: { type: "string", maxLength: 2000 },
        productChange: { type: "string", maxLength: 2000 },
        nextTest: { type: "string", maxLength: 2000 },
        uncertainty: { type: "string", maxLength: 2000 },
      },
    },
  },
} as const;
const baseSchema = z
  .object({
    schemaVersion: z.literal(1),
    frame: z.object({ problem: text(3000), solution: text(3000) }).strict(),
    hypothesisDraft: z
      .object({
        population: text(500),
        situation: text(500),
        prediction: text(1000),
        disconfirming: text(1000),
        timeWindow: text(500),
        reason: text(1000),
      })
      .strict(),
    hypotheses: z
      .array(
        z
          .object({
            id: discoveryId,
            createdAt: instant,
            population: text(500),
            situation: text(500),
            prediction: text(1000),
            disconfirming: text(1000),
            timeWindow: text(500),
            reason: text(1000),
          })
          .strict(),
      )
      .max(20),
    selectedHypothesisId: discoveryId.nullable(),
    people: z
      .array(
        z
          .object({
            id: discoveryId,
            alias: text(120),
            relationship: text(500),
            relevance: text(1000),
            contactId: discoveryId.nullable(),
            falsePositive: text(1000),
            falseNegative: text(1000),
            mitigation: text(1000),
          })
          .strict(),
      )
      .max(5),
    missingPerspectives: text(2000),
    scriptDraft: z
      .object({
        title: text(120),
        opening: text(1500),
        questions: z.array(text(1000)).max(20),
        closing: text(1500),
      })
      .strict(),
    scripts: z
      .array(
        z
          .object({
            id: discoveryId,
            createdAt: instant,
            hypothesisId: discoveryId,
            contextIds: z.array(discoveryId).max(20),
            title: text(120),
            opening: text(1500),
            questions: z.array(text(1000)).max(20),
            closing: text(1500),
          })
          .strict(),
      )
      .max(20),
    selectedScriptId: discoveryId.nullable(),
    contexts: z
      .array(
        z
          .object({
            id: discoveryId,
            kind: z.enum(["website", "github", "product_text", "prompt", "model_output", "other"]),
            label: text(120),
            url: publicUrl.nullable(),
            text: text(6000),
            capturedAt: instant,
            reviewedAt: instant.nullable(),
            permission: z.enum(["own_or_permitted", "unknown"]),
            retrieval: z.enum(["link_not_read", "pasted_text"]),
          })
          .strict(),
      )
      .max(20),
    excludedContextIds: z.array(discoveryId).max(20),
    results: z
      .array(
        z
          .object({
            id: discoveryId,
            interviewId: discoveryId.nullable(),
            scriptId: discoveryId.nullable(),
            sourceCapturedAt: instant.nullable(),
            observation: text(4000),
            quote: text(2000),
            interpretation: text(2000),
            counterevidence: text(2000),
          })
          .strict(),
      )
      .max(20),
    reflection: z
      .object({
        decision: z.enum(["retain", "narrow", "pivot", "test", "stop"]).nullable(),
        reason: text(2000),
        productChange: text(2000),
        nextTest: text(2000),
        uncertainty: text(2000),
      })
      .strict(),
  })
  .strict();
export type DiscoveryDocument = z.infer<typeof baseSchema>;
export type Hypothesis = DiscoveryDocument["hypotheses"][number];
export type DiscoveryScript = DiscoveryDocument["scripts"][number];
export const hypothesisReady = (h: DiscoveryDocument["hypothesisDraft"]) =>
  [h.population, h.situation, h.prediction, h.disconfirming, h.timeWindow].every((s) => s.trim());
export function hasLikelySecret(text: string) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}/i.test(
    text,
  );
}
export const discoverySchema = baseSchema.superRefine((doc, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (jsonBytes(doc) > DISCOVERY_LIMITS.documentBytes)
    fail(
      "This workspace is too large to save. Export or shorten the current draft; no saved work changed.",
    );
  const all = [
    ...doc.hypotheses,
    ...doc.people,
    ...doc.scripts,
    ...doc.contexts,
    ...doc.results,
  ].map((x) => x.id);
  if (new Set(all).size !== all.length) fail("Activity IDs must be unique.");
  const has = (rows: { id: string }[], id: string | null) =>
    id === null || rows.some((r) => r.id === id);
  if (!has(doc.hypotheses, doc.selectedHypothesisId) || !has(doc.scripts, doc.selectedScriptId))
    fail("Choose an existing version.");
  if (doc.hypotheses.some((h) => !hypothesisReady(h)))
    fail(
      "Preserved hypotheses need a population, situation, prediction, disconfirming observation and time window.",
    );
  if (
    doc.scripts.some(
      (s) =>
        !has(doc.hypotheses, s.hypothesisId) ||
        !s.questions.length ||
        s.questions.some((q) => !q.trim()) ||
        s.contextIds.some((id) => !has(doc.contexts, id)) ||
        new Set(s.contextIds).size !== s.contextIds.length,
    )
  )
    fail("Scripts need an existing hypothesis, questions and valid context versions.");
  if (
    doc.excludedContextIds.some((id) => !has(doc.contexts, id)) ||
    new Set(doc.excludedContextIds).size !== doc.excludedContextIds.length
  )
    fail("Excluded context references are invalid.");
  if (doc.results.some((r) => !has(doc.scripts, r.scriptId)))
    fail("Select a recorded script for these observations.");
  for (const c of doc.contexts) {
    if (hasLikelySecret(c.text) || hasLikelySecret(c.url ?? ""))
      fail("Remove credentials or likely secrets from context before saving.");
    if (
      !c.label ||
      (c.retrieval === "link_not_read" && (!c.url || c.text !== "")) ||
      (c.retrieval === "pasted_text" && !c.text) ||
      ["website", "github"].includes(c.kind) !== (c.retrieval === "link_not_read")
    )
      fail("Context must be a labeled unread link or labeled pasted text.");
  }
});
export function emptyHypothesis(): DiscoveryDocument["hypothesisDraft"] {
  return {
    population: "",
    situation: "",
    prediction: "",
    disconfirming: "",
    timeWindow: "",
    reason: "",
  };
}
export function emptyScript(): DiscoveryDocument["scriptDraft"] {
  return {
    title: "",
    opening:
      "Explain what you are learning. Is it okay to take notes? You may skip a question or stop.",
    questions: [],
    closing:
      "What have I missed? Is there a different situation or perspective I should understand?",
  };
}
export function createEmptyDiscovery(): DiscoveryDocument {
  return {
    schemaVersion: 1,
    frame: { problem: "", solution: "" },
    hypothesisDraft: emptyHypothesis(),
    hypotheses: [],
    selectedHypothesisId: null,
    people: [],
    missingPerspectives: "",
    scriptDraft: emptyScript(),
    scripts: [],
    selectedScriptId: null,
    contexts: [],
    excludedContextIds: [],
    results: [],
    reflection: { decision: null, reason: "", productChange: "", nextTest: "", uncertainty: "" },
  };
}
export function preservedVersionsError(
  before: DiscoveryDocument,
  after: DiscoveryDocument,
): string | null {
  for (const key of ["hypotheses", "scripts", "contexts"] as const)
    if (before[key].some((item, i) => JSON.stringify(item) !== JSON.stringify(after[key][i])))
      return "Preserved versions cannot be overwritten or removed. Make a new version.";
  if (before.excludedContextIds.some((id) => !after.excludedContextIds.includes(id)))
    return "Excluded captures cannot be silently reintroduced. Add a new reviewed capture.";
  return null;
}
export const loadDiscoverySchema = z.object({ projectId: discoveryId }).strict();
export const saveDiscoverySchema = loadDiscoverySchema
  .extend({
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    mutationId: discoveryId,
    document: discoverySchema,
  })
  .strict();
export type SaveDiscoveryInput = z.infer<typeof saveDiscoverySchema>;
export const discoveryRecordSchema = z
  .object({
    id: discoveryId,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    savedAt: instant,
    document: discoverySchema,
    history: z
      .array(
        z
          .object({
            revision: z.number().int().min(1),
            savedAt: instant,
            document: discoverySchema,
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type DiscoveryRecord = z.infer<typeof discoveryRecordSchema>;
export const discoveryFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "ARCHIVED",
      "INVALID_DOCUMENT",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "SOURCE_UNAVAILABLE",
      "PRESERVED_VERSION",
      "UNAVAILABLE",
    ]),
    currentRevision: z.number().int().min(0).optional(),
  })
  .strict();
export type DiscoveryFailure = z.infer<typeof discoveryFailureSchema>;
export type LoadDiscoveryResult =
  DiscoveryFailure | { ok: true; workspace: DiscoveryRecord | null };
export type SaveDiscoveryResult = DiscoveryFailure | ({ ok: true } & DiscoveryRecord);
export const adoptDiscoverySchema = loadDiscoverySchema
  .extend({
    expectedRevision: z.number().int().min(1),
    scriptId: discoveryId,
    expectedQuestions: z.array(z.string().max(20000)).max(100).nullable(),
    expectedOriginId: discoveryId.nullable(),
  })
  .strict();
export type AdoptDiscoveryInput = z.infer<typeof adoptDiscoverySchema>;
export type AdoptDiscoveryResult = DiscoveryFailure | { ok: true; questions: string[] };
