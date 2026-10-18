import { describe, expect, it } from "vitest";
import {
  createEmptyDiscovery,
  discoverySchema,
  discoveryRecordSchema,
  saveDiscoverySchema,
  preservedVersionsError,
  hypothesisReady,
  DISCOVERY_LIMITS,
  type DiscoveryDocument,
} from "@/lib/discovery";

const stamp = "2026-10-18T15:00:00Z";
const id = (n: number) => `d1500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hypothesis = (n = 1) => ({
  id: id(n),
  createdAt: stamp,
  population: "Commuting students",
  situation: "When the last bus leaves before a club finishes",
  prediction: "At least two students describe a missed meeting in the last month",
  disconfirming: "They already have a reliable return trip and attend as often as they want",
  timeWindow: "Five conversations this week about the last month",
  reason: "My first assumption, still untested",
});
function fixture(): DiscoveryDocument {
  const doc = createEmptyDiscovery();
  doc.hypotheses = [hypothesis()];
  doc.selectedHypothesisId = id(1);
  doc.contexts = [
    {
      id: id(2),
      kind: "product_text",
      label: "My draft",
      url: null,
      text: "A campus ride coordination idea",
      capturedAt: stamp,
      reviewedAt: stamp,
      permission: "own_or_permitted",
      retrieval: "pasted_text",
    },
  ];
  doc.scripts = [
    {
      id: id(3),
      createdAt: stamp,
      hypothesisId: id(1),
      contextIds: [id(2)],
      title: "First conversation",
      opening: "May I take notes? You can stop at any time.",
      questions: ["Tell me about the last club meeting you wanted to attend."],
      closing: "What have I missed?",
    },
  ];
  doc.selectedScriptId = id(3);
  return doc;
}

describe("private discovery document contracts", () => {
  it("starts as an independent manual draft without invented people, evidence or completion", () => {
    const first = discoverySchema.parse(createEmptyDiscovery());
    expect(first.people).toEqual([]);
    expect(first.hypotheses).toEqual([]);
    expect(first.results).toEqual([]);
    expect(first.reflection.decision).toBeNull();
    expect(hypothesisReady(first.hypothesisDraft)).toBe(false);
    first.frame.problem = "My assumption";
    expect(createEmptyDiscovery().frame.problem).toBe("");
    expect(discoverySchema.safeParse(fixture()).success).toBe(true);
  });

  it("allows incomplete drafts but requires all five falsifiable fields in a preserved hypothesis", () => {
    const doc = fixture();
    doc.hypothesisDraft.prediction = "This might be useful";
    expect(discoverySchema.safeParse(doc).success).toBe(true);
    for (const key of [
      "population",
      "situation",
      "prediction",
      "disconfirming",
      "timeWindow",
    ] as const) {
      const incomplete = fixture();
      incomplete.hypotheses[0]![key] = "   ";
      expect(discoverySchema.safeParse(incomplete).success, key).toBe(false);
    }
  });

  it("normalizes outer whitespace and UUID case without rewriting authored lines", () => {
    const doc = fixture();
    doc.frame.problem = "  Élodie’s problem\nSecond line  ";
    doc.hypotheses[0]!.id = id(1).toUpperCase();
    const parsed = discoverySchema.parse(doc);
    expect(parsed.frame.problem).toBe("Élodie’s problem\nSecond line");
    expect(parsed.hypotheses[0]!.id).toBe(id(1));
  });

  it("rejects extra authorization, history and nested fields", () => {
    expect(discoverySchema.safeParse({ ...fixture(), user_id: id(99) }).success).toBe(false);
    expect(discoverySchema.safeParse({ ...fixture(), history: [] }).success).toBe(false);
    const doc = fixture();
    expect(
      discoverySchema.safeParse({ ...doc, frame: { ...doc.frame, completed: true } }).success,
    ).toBe(false);
    expect(discoverySchema.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects duplicate IDs across activity kinds and duplicate context references", () => {
    const doc = fixture();
    doc.contexts[0]!.id = id(1);
    doc.scripts[0]!.contextIds = [id(1)];
    expect(discoverySchema.safeParse(doc).success).toBe(false);
    const duplicate = fixture();
    duplicate.scripts[0]!.contextIds.push(id(2));
    expect(discoverySchema.safeParse(duplicate).success).toBe(false);
    const excluded = fixture();
    excluded.excludedContextIds = [id(2), id(2)];
    expect(discoverySchema.safeParse(excluded).success).toBe(false);
  });

  it.each([
    "hypothesis selection",
    "script selection",
    "script hypothesis",
    "script context",
    "exclusion",
    "result script",
  ])("rejects a dangling %s reference", (kind) => {
    const doc = fixture();
    if (kind === "hypothesis selection") doc.selectedHypothesisId = id(99);
    if (kind === "script selection") doc.selectedScriptId = id(99);
    if (kind === "script hypothesis") doc.scripts[0]!.hypothesisId = id(99);
    if (kind === "script context") doc.scripts[0]!.contextIds = [id(99)];
    if (kind === "exclusion") doc.excludedContextIds = [id(99)];
    if (kind === "result script")
      doc.results = [
        {
          id: id(4),
          interviewId: null,
          scriptId: id(99),
          sourceCapturedAt: null,
          observation: "",
          quote: "",
          interpretation: "",
          counterevidence: "",
        },
      ];
    expect(discoverySchema.safeParse(doc).success).toBe(false);
  });

  it("accepts fewer than five aliases but rejects a sixth and preserved blank questions", () => {
    const person = (n: number) => ({
      id: id(n),
      alias: `Alias ${n}`,
      relationship: "",
      relevance: "",
      contactId: null,
      falsePositive: "",
      falseNegative: "",
      mitigation: "",
    });
    const doc = fixture();
    doc.people = [person(10)];
    expect(discoverySchema.safeParse(doc).success).toBe(true);
    doc.people = Array.from({ length: 6 }, (_, i) => person(i + 10));
    expect(discoverySchema.safeParse(doc).success).toBe(false);
    for (const questions of [[], ["   "]]) {
      const noQuestions = fixture();
      noQuestions.scripts[0]!.questions = questions;
      expect(discoverySchema.safeParse(noQuestions).success).toBe(false);
    }
  });

  it.each([
    "https://user:password@example.com/",
    "http://127.0.0.1/admin",
    "http://localhost/source",
    "file:///private/key",
    "javascript:alert(1)",
    "https://example.com/?access_token=private",
    "https://example.com/?%74oken=secret",
    "https://example.com/#access_token=secret",
    "https://example.com/?api_key=private",
    "https://example.com/?Authorization=private",
  ])("rejects a nonpublic or credential-bearing source URL %s", (url) => {
    const doc = fixture();
    Object.assign(doc.contexts[0]!, { kind: "website", retrieval: "link_not_read", text: "", url });
    expect(discoverySchema.safeParse(doc).success).toBe(false);
  });

  it("records public links as unread while preserving unknown review and permission", () => {
    const doc = fixture();
    Object.assign(doc.contexts[0]!, {
      kind: "github",
      retrieval: "link_not_read",
      text: "",
      url: "https://github.com/example/project",
      reviewedAt: null,
      permission: "unknown",
    });
    doc.scripts[0]!.contextIds = [];
    const parsed = discoverySchema.parse(doc);
    expect(parsed.contexts[0]!.retrieval).toBe("link_not_read");
    expect(parsed.contexts[0]!.reviewedAt).toBeNull();
    expect(parsed.contexts[0]!.permission).toBe("unknown");
  });

  it.each([
    "-----BEGIN PRIVATE KEY-----\nfixture",
    "ghp_fixturecredential123456789",
    "sk-fixturecredential123456789",
    "Bearer fixturecredential123456789",
  ])("rejects likely secrets in pasted context", (text) => {
    const doc = fixture();
    doc.contexts[0]!.text = text;
    expect(discoverySchema.safeParse(doc).success).toBe(false);
  });

  it("rejects misleading retrieval shapes and missing source labels", () => {
    for (const patch of [
      { label: "" },
      { text: "" },
      { kind: "website" },
      { retrieval: "link_not_read", url: "https://example.com" },
    ]) {
      const doc = fixture();
      Object.assign(doc.contexts[0]!, patch);
      expect(discoverySchema.safeParse(doc).success).toBe(false);
    }
  });

  it("bounds bytes independently of field character counts", () => {
    const doc = createEmptyDiscovery();
    doc.contexts = Array.from({ length: 20 }, (_, i) => ({
      id: id(i + 1),
      kind: "product_text",
      label: `Draft ${i}`,
      url: null,
      text: "é".repeat(6000),
      capturedAt: stamp,
      reviewedAt: null,
      permission: "unknown",
      retrieval: "pasted_text",
    }));
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBeGreaterThan(
      DISCOVERY_LIMITS.documentBytes,
    );
    expect(discoverySchema.safeParse(doc).success).toBe(false);
  });

  it("requires a safe revision, explicit mutation UUID and no caller-supplied actor", () => {
    const request = {
      projectId: id(10),
      expectedRevision: 0,
      mutationId: id(11),
      document: fixture(),
    };
    expect(saveDiscoverySchema.safeParse(request).success).toBe(true);
    for (const patch of [
      { expectedRevision: -1 },
      { expectedRevision: 1.5 },
      { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { mutationId: "retry" },
      { projectId: "foreign" },
      { user_id: id(12) },
    ])
      expect(saveDiscoverySchema.safeParse({ ...request, ...patch }).success).toBe(false);
    const record = { id: id(20), revision: 1, savedAt: stamp, document: fixture(), history: [] };
    expect(discoveryRecordSchema.safeParse(record).success).toBe(true);
    expect(
      discoveryRecordSchema.safeParse({
        ...record,
        history: Array(4).fill({ revision: 1, savedAt: stamp, document: fixture() }),
      }).success,
    ).toBe(false);
  });
});

describe("preserved discovery versions", () => {
  it.each(["hypotheses", "scripts", "contexts"] as const)(
    "rejects mutation, deletion and reordering of %s",
    (key) => {
      const before = fixture();
      if (key === "hypotheses") before.hypotheses.push(hypothesis(10));
      if (key === "scripts")
        before.scripts.push({ ...before.scripts[0]!, id: id(10), questions: ["Another version"] });
      if (key === "contexts")
        before.contexts.push({ ...before.contexts[0]!, id: id(10), text: "Another source" });
      const changed = structuredClone(before);
      changed[key][0]!.id = id(99);
      expect(preservedVersionsError(before, changed)).toMatch(/cannot be overwritten/);
      const deleted = structuredClone(before);
      deleted[key].pop();
      expect(preservedVersionsError(before, deleted)).toMatch(/cannot be overwritten/);
      const reordered = structuredClone(before);
      reordered[key].reverse();
      expect(preservedVersionsError(before, reordered)).toMatch(/cannot be overwritten/);
    },
  );

  it("permits new versions and editable drafts while retaining the first attempt", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.hypotheses.push({ ...hypothesis(10), reason: "Evidence suggests a narrower population" });
    after.selectedHypothesisId = id(10);
    after.hypothesisDraft.population = "Evening commuters";
    after.scriptDraft.questions = ["A new question to review"];
    after.frame.solution = "A revised idea";
    expect(preservedVersionsError(before, after)).toBeNull();
    expect(after.hypotheses[0]).toEqual(before.hypotheses[0]);
  });

  it("makes capture exclusion irreversible while allowing a new capture", () => {
    const before = fixture();
    before.excludedContextIds = [id(2)];
    const restored = structuredClone(before);
    restored.excludedContextIds = [];
    expect(preservedVersionsError(before, restored)).toMatch(/cannot be silently reintroduced/);
    const replacement = structuredClone(before);
    replacement.contexts.push({ ...before.contexts[0]!, id: id(10), text: "New reviewed capture" });
    expect(preservedVersionsError(before, replacement)).toBeNull();
  });
});
