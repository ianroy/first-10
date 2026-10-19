import { describe, expect, it } from "vitest";
import {
  GENERATION_HISTORY_LIMITS,
  appendManualVersionSchema,
  generationDocumentSchema,
  generationFailureSchema,
  generationHistoryPageSchema,
  generationMutationResultSchema,
  generationProvenanceSchema,
  generationStateSchema,
  generationVersionSchema,
  getGenerationVersionSchema,
  listGenerationHistorySchema,
  parseScopedGenerationHistory,
  parseScopedGenerationMutation,
  parseScopedGenerationVersion,
  selectGenerationVersionSchema,
} from "@/lib/generation-history/contracts";

const id = (number: number) => `e0010000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const scope = { userId: id(1), projectId: id(2), streamId: id(3) };
const at = "2026-10-18T12:00:00Z";
const hash = "a".repeat(64);
const document = {
  kind: "synthesis" as const,
  stage: 1 as const,
  body: {
    title: "A next step",
    summary: "Owner interpretation",
    synthesis: {
      problems: ["Reported problem"],
      objections: [],
      best_fit: [],
      quotes: [] as string[],
      changes: [],
    },
  },
};
const provenance = {
  status: "recorded" as const,
  originId: id(4),
  operationId: id(5),
  kind: "synthesis" as const,
  promptId: "first-ten.synthesis",
  promptVersion: 2,
  schemaId: "first-ten.synthesis.output",
  schemaVersion: 2,
  requestedModel: "provider/model",
  actualModel: null,
  provider: null,
  costUsd: null,
  generatedAt: at,
  context: { status: "recorded" as const, contextSha256: hash, sourceIds: [`src_${hash}`] },
};
const version = {
  scope,
  id: id(6),
  sequence: 1,
  parentVersionId: null,
  bodyHash: hash,
  createdAt: at,
  authorship: "generated" as const,
  generation: provenance,
  document,
};
const pointer = { versionId: version.id, sequence: 1, bodyHash: hash };
const state = {
  scope,
  kind: "synthesis" as const,
  stage: 1 as const,
  revision: 1,
  versionCount: 1,
  current: pointer,
  accepted: pointer,
};
const header = {
  scope,
  id: version.id,
  sequence: 1,
  parentVersionId: null,
  bodyHash: hash,
  createdAt: at,
  authorship: "generated" as const,
  generationStatus: "recorded" as const,
  kind: "synthesis" as const,
  stage: 1 as const,
  title: "A next step",
};
const append = {
  projectId: scope.projectId,
  streamId: scope.streamId,
  requestId: id(7),
  versionId: id(8),
  expectedRevision: 1,
  parentVersionId: version.id,
  authorship: "manual_edit" as const,
  document,
  current: "select_new" as const,
  accepted: "retain" as const,
};
const select = {
  projectId: scope.projectId,
  streamId: scope.streamId,
  requestId: id(9),
  expectedRevision: 1,
  operation: "select_current" as const,
  versionId: version.id,
};
const clone = <T>(value: T): T => structuredClone(value);

describe("generation history document boundaries", () => {
  it("preserves manual wording exactly rather than silently trimming or substituting evidence", () => {
    const manual = clone(document);
    manual.body.summary = "  My uncertain interpretation\n";
    manual.body.synthesis.quotes = ["", "Owner-reported wording"];
    expect(generationDocumentSchema.parse(manual)).toEqual(manual);
    expect(
      generationDocumentSchema.parse({
        kind: "learning",
        stage: 3,
        body: { title: "Manual reflection", body: "Keep a disagreement" },
      }),
    ).toMatchObject({ kind: "learning", stage: 3 });
  });
  it.each([
    { kind: "synthesis", stage: 2, body: document.body },
    { kind: "outreach", stage: 1, body: { rows: [] } },
    {
      kind: "outreach",
      stage: 2,
      body: { rows: [{ id: id(10), kind: "referral", title: "", body: "" }], survey: [] },
    },
    {
      kind: "outreach",
      stage: 3,
      body: { rows: [{ id: id(10), kind: "draft", title: "", body: "" }] },
    },
    { kind: "outreach", stage: 3, body: { rows: [], survey: [] } },
    { kind: "learning", stage: 4, body: { title: "", body: "" } },
    { ...document, body: { ...document.body, rawPrompt: "Do not store this" } },
  ])("rejects an incompatible kind/stage/body or unknown field", (value) => {
    expect(generationDocumentSchema.safeParse(value).success).toBe(false);
  });
  it("keeps a complete stage-2 plan and survey atomic, and rejects duplicate row identities", () => {
    const plan = {
      kind: "outreach",
      stage: 2,
      body: {
        rows: [
          { id: id(10), kind: "channel", title: "Club", body: "Ask the organizer" },
          { id: id(11), kind: "draft", title: "Invitation", body: "Would you try one task?" },
        ],
        survey: ["What happened the last time?"],
      },
    };
    expect(generationDocumentSchema.parse(plan)).toEqual(plan);
    expect(
      generationDocumentSchema.safeParse({
        ...plan,
        body: { ...plan.body, rows: [plan.body.rows[0], plan.body.rows[0]] },
      }).success,
    ).toBe(false);
    expect(
      generationDocumentSchema.safeParse({ ...plan, body: { rows: plan.body.rows } }).success,
    ).toBe(false);
  });
  it("bounds UTF-8 bytes across all fields, including non-ASCII content below individual character limits", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: id(index + 20),
      kind: "channel",
      title: "",
      body: "🧭".repeat(600),
    }));
    expect(rows.every((row) => row.body.length <= 2400)).toBe(true);
    expect(
      generationDocumentSchema.safeParse({ kind: "outreach", stage: 3, body: { rows } }).success,
    ).toBe(false);
    expect(GENERATION_HISTORY_LIMITS.bodyBytes).toBe(65_536);
  });
});

describe("honest historical generation metadata", () => {
  it("retains unknown model/provider/cost as null, never as an invented fallback or free call", () => {
    expect(generationProvenanceSchema.parse(provenance)).toMatchObject({
      actualModel: null,
      provider: null,
      costUsd: null,
    });
    expect(
      generationVersionSchema.parse({
        ...version,
        authorship: "legacy_unknown",
        generation: { status: "unknown" },
      }),
    ).toMatchObject({ generation: { status: "unknown" } });
    expect(
      generationVersionSchema.safeParse({
        ...version,
        authorship: "generated",
        generation: { status: "unknown" },
      }).success,
    ).toBe(false);
    expect(
      generationVersionSchema.safeParse({
        ...version,
        authorship: "legacy_unknown",
        generation: { status: "none" },
      }).success,
    ).toBe(false);
  });
  it("a v1 ledger link records ancestry without certifying that historical wording is an exact AI response", () => {
    const v1 = {
      ...provenance,
      operationId: null,
      promptVersion: 1,
      schemaVersion: 1,
      context: { status: "unknown" },
    };
    expect(
      generationVersionSchema.parse({ ...version, authorship: "legacy_unknown", generation: v1 }),
    ).toMatchObject({ generation: { operationId: null } });
    expect(generationVersionSchema.safeParse({ ...version, generation: v1 }).success).toBe(false);
  });
  it("manual edits can retain their original generation ancestry without claiming unmodified AI wording", () => {
    expect(
      generationVersionSchema.parse({
        ...version,
        id: id(12),
        sequence: 2,
        parentVersionId: version.id,
        authorship: "manual_edit",
      }),
    ).toMatchObject({ authorship: "manual_edit", generation: provenance });
  });
  it.each([
    { ...provenance, kind: "stage2" },
    { ...provenance, promptId: "first-ten.stage2" },
    { ...provenance, schemaId: "first-ten.stage3.output" },
    { ...provenance, actualModel: "" },
    { ...provenance, provider: "provider\nsecret" },
    { ...provenance, costUsd: -1 },
    { ...provenance, costUsd: Infinity },
    { ...provenance, operationId: null },
    { ...provenance, rawEnvelope: {} },
    {
      ...provenance,
      context: { ...provenance.context, sourceIds: [`src_${hash}`, `src_${hash}`] },
    },
  ])("rejects mismatched, fabricated or unbounded provenance", (generation) => {
    expect(generationVersionSchema.safeParse({ ...version, generation }).success).toBe(false);
  });
});

describe("owner scope and exact immutable identity", () => {
  it("requires every private read to match verified owner, project and stream", () => {
    expect(parseScopedGenerationVersion(version, scope)).toEqual(version);
    for (const field of ["userId", "projectId", "streamId"] as const)
      expect(() => parseScopedGenerationVersion(version, { ...scope, [field]: id(99) })).toThrow(
        /another workspace/,
      );
    expect(
      getGenerationVersionSchema.safeParse({
        projectId: scope.projectId,
        streamId: scope.streamId,
        versionId: version.id,
        userId: scope.userId,
      }).success,
    ).toBe(false);
  });
  it.each([
    { ...version, sequence: 0 },
    { ...version, sequence: 51 },
    { ...version, parentVersionId: version.id },
    { ...version, parentVersionId: id(99) },
    { ...version, authorship: "manual_edit" },
    { ...version, accepted: true },
    { ...version, bodyHash: "not-a-digest" },
  ])("rejects invalid version/parent identity and per-version mutable acceptance", (value) => {
    expect(generationVersionSchema.safeParse(value).success).toBe(false);
  });
  it("allows a concurrent generated candidate from an initially empty baseline to remain an unselected history branch", () => {
    expect(generationVersionSchema.parse({ ...version, id: id(15), sequence: 2 })).toMatchObject({
      parentVersionId: null,
      sequence: 2,
    });
  });
  it("current and accepted are independent pointers, and restoring current does not replace accepted work", () => {
    const newer = { versionId: id(16), sequence: 2, bodyHash: "b".repeat(64) };
    const saved = { ...state, revision: 3, versionCount: 2, current: newer };
    expect(generationStateSchema.parse(saved)).toMatchObject({ current: newer, accepted: pointer });
    expect(selectGenerationVersionSchema.parse(select)).toMatchObject({
      operation: "select_current",
      versionId: version.id,
    });
    expect(generationStateSchema.parse({ ...saved, revision: 4, current: pointer })).toMatchObject({
      accepted: pointer,
    });
  });
  it.each([
    { ...state, current: null },
    { ...state, versionCount: 0 },
    { ...state, revision: 0 },
    { ...state, revision: 1, versionCount: 2 },
    { ...state, current: { ...pointer, sequence: 2 } },
    { ...state, accepted: { ...pointer, bodyHash: "b".repeat(64) } },
    { ...state, accepted: { ...pointer, versionId: id(99) } },
  ])("rejects contradictory pointer states", (value) =>
    expect(generationStateSchema.safeParse(value).success).toBe(false),
  );
});

describe("CAS, immutable receipts and conservative retries", () => {
  it("permits explicit manual append/select while requiring accepted content to be retained", () => {
    expect(appendManualVersionSchema.parse(append)).toEqual(append);
    expect(appendManualVersionSchema.safeParse({ ...append, current: "retain" }).success).toBe(
      true,
    );
    for (const field of ["userId", "generation", "originId", "operationId", "acceptedVersionId"])
      expect(appendManualVersionSchema.safeParse({ ...append, [field]: id(40) }).success).toBe(
        false,
      );
    expect(appendManualVersionSchema.safeParse({ ...append, accepted: "select_new" }).success).toBe(
      false,
    );
    expect(
      appendManualVersionSchema.safeParse({ ...append, authorship: "generated" }).success,
    ).toBe(false);
    // Existing unselected candidates need not invent a current parent for new manual work.
    expect(
      appendManualVersionSchema.safeParse({
        ...append,
        authorship: "manual",
        parentVersionId: null,
      }).success,
    ).toBe(true);
    expect(appendManualVersionSchema.safeParse({ ...append, parentVersionId: null }).success).toBe(
      false,
    );
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid or exhausted mutation expectation %s",
    (expectedRevision) => {
      expect(appendManualVersionSchema.safeParse({ ...append, expectedRevision }).success).toBe(
        false,
      );
      expect(selectGenerationVersionSchema.safeParse({ ...select, expectedRevision }).success).toBe(
        false,
      );
    },
  );
  it("accepts the terminal revision on reads without offering another increment", () => {
    expect(
      generationStateSchema.parse({ ...state, revision: Number.MAX_SAFE_INTEGER }).revision,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(generationFailureSchema.parse({ ok: false, code: "REVISION_EXHAUSTED" })).toMatchObject({
      ok: false,
    });
  });
  it("requires an explicit clear instead of overloading a missing version as acceptance or restore", () => {
    expect(
      selectGenerationVersionSchema.parse({
        ...select,
        operation: "clear_acceptance",
        versionId: null,
      }),
    ).toMatchObject({ operation: "clear_acceptance" });
    expect(selectGenerationVersionSchema.safeParse({ ...select, versionId: null }).success).toBe(
      false,
    );
    expect(
      selectGenerationVersionSchema.safeParse({ ...select, operation: "clear_acceptance" }).success,
    ).toBe(false);
  });
  it("a replay receipt can be older than fresh state and must never supply old pointers", () => {
    const result = {
      ok: true,
      replayed: true,
      receipt: {
        requestId: id(7),
        operation: "append",
        revisionAtCommit: 1,
        versionId: version.id,
      },
      state: { ...state, revision: 5 },
    };
    expect(generationMutationResultSchema.parse(result)).toEqual(result);
    expect(
      generationMutationResultSchema.safeParse({
        ...result,
        receipt: { ...result.receipt, revisionAtCommit: 6 },
      }).success,
    ).toBe(false);
    expect(
      generationFailureSchema.parse({ ok: false, code: "GENERATION_UNAVAILABLE" }),
    ).toMatchObject({ code: "GENERATION_UNAVAILABLE" });
  });
  it("binds a save response to both verified scope and the exact uncertain retry request", () => {
    const result = {
      ok: true,
      replayed: true,
      receipt: {
        requestId: id(7),
        operation: "append",
        revisionAtCommit: 1,
        versionId: version.id,
      },
      state,
    };
    expect(parseScopedGenerationMutation(result, scope, id(7))).toEqual(result);
    expect(() => parseScopedGenerationMutation(result, scope, id(8))).toThrow(
      /another workspace or request/,
    );
    expect(() =>
      parseScopedGenerationMutation(result, { ...scope, projectId: id(99) }, id(7)),
    ).toThrow(/another workspace or request/);
  });
});

describe("bounded history pages", () => {
  it("returns exact metadata without loading every version body or original private input", () => {
    const page = { state, items: [header], nextCursor: null };
    expect(parseScopedGenerationHistory(page, scope)).toEqual(page);
    expect(() => parseScopedGenerationHistory(page, { ...scope, userId: id(99) })).toThrow(
      /another workspace/,
    );
    expect(
      generationHistoryPageSchema.safeParse({ ...page, items: [{ ...header, document }] }).success,
    ).toBe(false);
    expect(
      listGenerationHistorySchema.safeParse({
        projectId: scope.projectId,
        streamId: scope.streamId,
        limit: 500,
      }).success,
    ).toBe(false);
  });
  it("rejects another project, duplicate sequence, mismatched pointer and invented cursor", () => {
    const page = { state, items: [header], nextCursor: null };
    for (const changed of [
      { ...header, scope: { ...scope, projectId: id(99) } },
      { ...header, bodyHash: "b".repeat(64) },
      { ...header, id: id(99) },
      { ...header, generationStatus: "unknown" },
    ])
      expect(generationHistoryPageSchema.safeParse({ ...page, items: [changed] }).success).toBe(
        false,
      );
    expect(
      generationHistoryPageSchema.safeParse({ ...page, items: [header, header] }).success,
    ).toBe(false);
    expect(
      generationHistoryPageSchema.safeParse({
        ...page,
        nextCursor: { sequence: 1, versionId: id(99) },
      }).success,
    ).toBe(false);
  });
  it("rejects reversed history and a parent that is its child's successor", () => {
    const newer = { ...header, id: id(17), sequence: 2, parentVersionId: header.id };
    const page = {
      state: { ...state, revision: 2, versionCount: 2 },
      items: [newer, header],
      nextCursor: null,
    };
    expect(generationHistoryPageSchema.safeParse(page).success).toBe(true);
    expect(generationHistoryPageSchema.safeParse({ ...page, items: [header, newer] }).success).toBe(
      false,
    );
    expect(
      generationHistoryPageSchema.safeParse({
        ...page,
        items: [newer, { ...header, parentVersionId: newer.id }],
      }).success,
    ).toBe(false);
  });
});
