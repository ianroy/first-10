import { z } from "zod";

/** Phase 1 only: these are data contracts, not authorization or persistence. */
export const GENERATION_HISTORY_LIMITS = {
  versionsPerStream: 50,
  receiptsPerStream: 200,
  pageSize: 20,
  bodyBytes: 65_536,
  mutationBytes: 98_304,
} as const;
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// MAX_SAFE_INTEGER is a valid terminal read value, never an incrementable expectation.
const writableRevision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const sequence = z.number().int().min(1).max(GENERATION_HISTORY_LIMITS.versionsPerStream);
const text = z.string().max(2400);
const texts = z.array(text).max(20);
const titled = z.object({ title: text, body: text }).strict();
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const unique = (values: string[]) => new Set(values).size === values.length;
export const generationScopeSchema = z
  .object({ userId: uuid, projectId: uuid, streamId: uuid })
  .strict();
// The verified actor is derived server-side; no mutation accepts a supplied userId.
const requestScope = z.object({ projectId: uuid, streamId: uuid }).strict();
const synthesisBody = z
  .object({
    title: text,
    summary: z.string().max(12_000),
    synthesis: z
      .object({
        problems: texts,
        objections: texts,
        best_fit: texts,
        quotes: texts,
        changes: z.array(titled).max(12),
      })
      .strict(),
  })
  .strict();
const learningBody = z.object({ title: text, body: z.string().max(12_000) }).strict();
const outreachRow = z
  .object({
    id: uuid,
    kind: z.enum(["channel", "draft", "referral", "onboarding"]),
    title: text,
    body: text,
  })
  .strict();
const stage2Body = z
  .object({
    rows: z.array(outreachRow.extend({ kind: z.enum(["channel", "draft"]) })).max(64),
    survey: texts,
  })
  .strict();
const stage3Body = z
  .object({
    rows: z
      .array(outreachRow.extend({ kind: z.enum(["channel", "referral", "onboarding"]) }))
      .max(64),
  })
  .strict();
export const generationDocumentSchema = z
  .union([
    z.object({ kind: z.literal("synthesis"), stage: z.literal(1), body: synthesisBody }).strict(),
    z
      .object({
        kind: z.literal("learning"),
        stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        body: learningBody,
      })
      .strict(),
    z.object({ kind: z.literal("outreach"), stage: z.literal(2), body: stage2Body }).strict(),
    z.object({ kind: z.literal("outreach"), stage: z.literal(3), body: stage3Body }).strict(),
  ])
  .superRefine((doc, ctx) => {
    if (byteLength(doc) > GENERATION_HISTORY_LIMITS.bodyBytes)
      ctx.addIssue({ code: "custom", message: "Version body exceeds its UTF-8 budget." });
    if (doc.kind === "outreach" && !unique(doc.body.rows.map((row) => row.id)))
      ctx.addIssue({ code: "custom", message: "Outreach row identities must be unique." });
  });
export type GenerationDocument = z.infer<typeof generationDocumentSchema>;

const contextSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("recorded"),
      contextSha256: hash,
      sourceIds: z
        .array(z.string().regex(/^src_[a-f0-9]{64}$/))
        .max(80)
        .refine(unique),
    })
    .strict(),
]);
const metadataLabel = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
  );
export const generationProvenanceSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("none") }).strict(),
    z
      .object({
        status: z.literal("recorded"),
        originId: uuid,
        operationId: uuid.nullable(),
        kind: z.enum(["synthesis", "stage2", "stage3"]),
        promptId: metadataLabel,
        promptVersion: z.number().int().min(1).max(10_000),
        schemaId: metadataLabel,
        schemaVersion: z.number().int().min(1).max(10_000),
        requestedModel: metadataLabel,
        actualModel: metadataLabel.nullable(),
        provider: metadataLabel.nullable(),
        costUsd: z.number().finite().min(0).max(1_000_000).nullable(),
        generatedAt: instant,
        context: contextSchema,
      })
      .strict(),
  ])
  .superRefine((origin, ctx) => {
    if (origin.status !== "recorded") return;
    if (
      origin.promptId !== `first-ten.${origin.kind}` ||
      origin.schemaId !== `first-ten.${origin.kind}.output`
    )
      ctx.addIssue({ code: "custom", message: "Origin prompt/schema kind does not match." });
    if ((origin.operationId === null) !== (origin.context.status === "unknown"))
      ctx.addIssue({
        code: "custom",
        message: "Recorded operation and source context must travel together.",
      });
  });

const versionBase = z
  .object({
    scope: generationScopeSchema,
    id: uuid,
    sequence,
    parentVersionId: uuid.nullable(),
    bodyHash: hash,
    createdAt: instant,
    authorship: z.enum(["manual", "manual_edit", "generated", "legacy_unknown"]),
    generation: generationProvenanceSchema,
    document: generationDocumentSchema,
  })
  .strict();
export const generationVersionSchema = versionBase.superRefine((version, ctx) => {
  if (
    version.parentVersionId === version.id ||
    (version.sequence === 1 && version.parentVersionId !== null)
  )
    ctx.addIssue({ code: "custom", message: "Invalid immutable version parent." });
  if (version.authorship === "manual_edit" && version.parentVersionId === null)
    ctx.addIssue({ code: "custom", message: "A manual edit requires a saved parent." });
  if (version.authorship === "generated" && version.generation.status !== "recorded")
    ctx.addIssue({
      code: "custom",
      message: "Generated wording needs a verified recorded origin.",
    });
  if (
    version.authorship === "generated" &&
    version.generation.status === "recorded" &&
    version.generation.operationId === null
  )
    ctx.addIssue({
      code: "custom",
      message: "Exact generated wording requires the trusted operation/context handoff.",
    });
  if (version.authorship === "legacy_unknown" && version.generation.status === "none")
    ctx.addIssue({
      code: "custom",
      message: "Unknown history cannot assert a known absence of AI.",
    });
  if (version.generation.status === "recorded") {
    const expected =
      version.document.kind === "synthesis"
        ? "synthesis"
        : version.document.kind === "outreach"
          ? `stage${version.document.stage}`
          : null;
    if (version.generation.kind !== expected)
      ctx.addIssue({
        code: "custom",
        message: "Generation origin does not match version kind/stage.",
      });
  }
});
export type GenerationVersion = z.infer<typeof generationVersionSchema>;

const pointer = z.object({ versionId: uuid, sequence, bodyHash: hash }).strict();
export const generationStateSchema = z
  .object({
    scope: generationScopeSchema,
    kind: z.enum(["synthesis", "learning", "outreach"]),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    revision,
    versionCount: z.number().int().min(0).max(GENERATION_HISTORY_LIMITS.versionsPerStream),
    current: pointer.nullable(),
    accepted: pointer.nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (
      (state.kind === "synthesis" && state.stage !== 1) ||
      (state.kind === "outreach" && state.stage === 1)
    )
      ctx.addIssue({ code: "custom", message: "Invalid stream kind/stage." });
    if (
      (state.current === null && state.accepted !== null) ||
      [state.current, state.accepted].some(
        (value) => value && value.sequence > state.versionCount,
      ) ||
      (state.versionCount > 0 && state.revision === 0) ||
      state.versionCount > state.revision ||
      (state.versionCount === 0 && (state.current !== null || state.accepted !== null))
    )
      ctx.addIssue({ code: "custom", message: "Pointers or revision contradict saved history." });
    if (
      state.current &&
      state.accepted &&
      ((state.current.versionId === state.accepted.versionId &&
        (state.current.sequence !== state.accepted.sequence ||
          state.current.bodyHash !== state.accepted.bodyHash)) ||
        (state.current.sequence === state.accepted.sequence &&
          state.current.versionId !== state.accepted.versionId))
    )
      ctx.addIssue({ code: "custom", message: "One version cannot have two saved identities." });
  });
export type GenerationState = z.infer<typeof generationStateSchema>;

export const appendManualVersionSchema = requestScope
  .extend({
    requestId: uuid,
    versionId: uuid,
    expectedRevision: writableRevision,
    parentVersionId: uuid.nullable(),
    authorship: z.enum(["manual", "manual_edit"]),
    document: generationDocumentSchema,
    current: z.enum(["retain", "select_new"]),
    // Append never implicitly replaces accepted work.
    accepted: z.literal("retain"),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (
      request.versionId === request.parentVersionId ||
      (request.expectedRevision === 0 && request.parentVersionId !== null) ||
      (request.authorship === "manual_edit" && request.parentVersionId === null)
    )
      ctx.addIssue({ code: "custom", message: "Manual save has an invalid saved baseline." });
    if (byteLength(request) > GENERATION_HISTORY_LIMITS.mutationBytes)
      ctx.addIssue({ code: "custom", message: "Save exceeds its UTF-8 budget." });
  });
export const selectGenerationVersionSchema = requestScope
  .extend({
    requestId: uuid,
    expectedRevision: writableRevision,
    operation: z.enum(["select_current", "accept_current", "clear_acceptance"]),
    versionId: uuid.nullable(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if ((request.operation === "clear_acceptance") !== (request.versionId === null))
      ctx.addIssue({
        code: "custom",
        message: "Pointer action needs its exact version or explicit clear.",
      });
  });
const cursor = z.object({ sequence, versionId: uuid }).strict();
export const listGenerationHistorySchema = requestScope
  .extend({ cursor: cursor.optional() })
  .strict();
export const getGenerationVersionSchema = requestScope.extend({ versionId: uuid }).strict();
export const generationReceiptSchema = z
  .object({
    requestId: uuid,
    operation: z.enum(["append", "select_current", "accept_current", "clear_acceptance"]),
    revisionAtCommit: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    versionId: uuid.nullable(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if ((receipt.operation === "clear_acceptance") !== (receipt.versionId === null))
      ctx.addIssue({ code: "custom", message: "Receipt action/version mismatch." });
  });
export const generationMutationResultSchema = z
  .object({
    ok: z.literal(true),
    replayed: z.boolean(),
    receipt: generationReceiptSchema,
    // Fresh state can be newer than the immutable replay receipt; never replay old pointers.
    state: generationStateSchema,
  })
  .strict()
  .refine(
    (result) => result.state.revision >= result.receipt.revisionAtCommit,
    "Fresh state cannot precede its operation receipt.",
  );
export const generationFailureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "NOT_FOUND",
      "ARCHIVED",
      "INVALID_INPUT",
      "CHANGED",
      "IDEMPOTENCY_CONFLICT",
      "CAPACITY",
      "REVISION_EXHAUSTED",
      "UNAVAILABLE",
      "GENERATION_UNAVAILABLE",
    ]),
  })
  .strict();

/** Validate read scope against the caller's already verified identity. This is NOT authorization. */
export function parseScopedGenerationVersion(
  value: unknown,
  expected: z.infer<typeof generationScopeSchema>,
) {
  const scope = generationScopeSchema.parse(expected);
  const version = generationVersionSchema.parse(value);
  if (!sameScope(version.scope, scope))
    throw new Error("Saved version belongs to another workspace.");
  return version;
}
function sameScope(
  a: z.infer<typeof generationScopeSchema>,
  b: z.infer<typeof generationScopeSchema>,
) {
  return a.userId === b.userId && a.projectId === b.projectId && a.streamId === b.streamId;
}
/** Metadata pages are deliberately body-free. Full wording requires an exact version read. */
const header = versionBase
  .omit({ document: true, generation: true })
  .extend({
    kind: z.enum(["synthesis", "learning", "outreach"]),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    title: text,
    generationStatus: z.enum(["unknown", "none", "recorded"]),
  })
  .strict();
export const generationHistoryPageSchema = z
  .object({
    state: generationStateSchema,
    items: z.array(header).max(GENERATION_HISTORY_LIMITS.pageSize),
    nextCursor: cursor.nullable(),
  })
  .strict()
  .superRefine((page, ctx) => {
    const ids = page.items.map((item) => item.id),
      sequences = page.items.map((item) => item.sequence);
    if (!unique(ids) || new Set(sequences).size !== sequences.length)
      ctx.addIssue({ code: "custom", message: "Duplicate immutable version on history page." });
    for (const item of page.items) {
      if (
        !sameScope(item.scope, page.state.scope) ||
        item.kind !== page.state.kind ||
        item.stage !== page.state.stage ||
        item.sequence > page.state.versionCount ||
        item.parentVersionId === item.id ||
        (item.sequence === 1 && item.parentVersionId !== null) ||
        (item.authorship === "manual_edit" && item.parentVersionId === null) ||
        (item.authorship === "generated" && item.generationStatus !== "recorded") ||
        (item.authorship === "legacy_unknown" && item.generationStatus === "none")
      )
        ctx.addIssue({ code: "custom", message: "History item does not match its scoped stream." });
      for (const selected of [page.state.current, page.state.accepted])
        if (
          selected &&
          ((selected.versionId === item.id &&
            (selected.sequence !== item.sequence || selected.bodyHash !== item.bodyHash)) ||
            (selected.sequence === item.sequence && selected.versionId !== item.id))
        )
          ctx.addIssue({
            code: "custom",
            message: "Saved pointer does not match its version header.",
          });
      const parent = page.items.find((candidate) => candidate.id === item.parentVersionId);
      if (parent && parent.sequence >= item.sequence)
        ctx.addIssue({
          code: "custom",
          message: "A parent must precede its child in saved history.",
        });
    }
    if (
      page.items.some(
        (item, index) => index > 0 && item.sequence >= page.items[index - 1]!.sequence,
      )
    )
      ctx.addIssue({ code: "custom", message: "History must be ordered newest first." });
    const last = page.items.at(-1);
    if (
      page.nextCursor &&
      (!last || page.nextCursor.sequence !== last.sequence || page.nextCursor.versionId !== last.id)
    )
      ctx.addIssue({
        code: "custom",
        message: "History cursor must identify the last returned item.",
      });
  });
export function parseScopedGenerationHistory(
  value: unknown,
  expected: z.infer<typeof generationScopeSchema>,
) {
  const scope = generationScopeSchema.parse(expected);
  const page = generationHistoryPageSchema.parse(value);
  if (!sameScope(page.state.scope, scope))
    throw new Error("Saved history belongs to another workspace.");
  return page;
}
export function parseScopedGenerationMutation(
  value: unknown,
  expected: z.infer<typeof generationScopeSchema>,
  requestId: string,
) {
  const scope = generationScopeSchema.parse(expected);
  const request = uuid.parse(requestId);
  const result = generationMutationResultSchema.parse(value);
  if (!sameScope(result.state.scope, scope) || result.receipt.requestId !== request)
    throw new Error("Save receipt belongs to another workspace or request.");
  return result;
}
