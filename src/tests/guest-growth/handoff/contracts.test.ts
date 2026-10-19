import { describe, expect, it } from "vitest";
import {
  createEmptyGuestGrowth,
  guestGrowthSelectionSchema,
  previewGuestGrowthSchema,
  guestGrowthTeacherPayloadSchema,
} from "@/lib/guest-growth/contracts";
import { growthSelectionText } from "@/lib/guest-growth/handoff/selection";
import { growthSelectionOptions, sourceRosterSchema } from "@/lib/guest-growth/handoff/contracts";
import { records, id } from "../fixture";
const source = records()[0]!;
it.each(records())("only offers genuine sections for $kind", (r) => {
  for (const o of growthSelectionOptions(r))
    expect(guestGrowthSelectionSchema.safeParse(o.selection).success).toBe(true);
});
it.each(["survey", "onboarding"] as const)(
  "never projects private %s question IDs or source references",
  (kind) => {
    const d = createEmptyGuestGrowth(kind);
    if (d.kind !== kind) throw Error("Wrong kind");
    d.questions =
      kind === "survey"
        ? [{ id: id(901), prompt: "Real prompt", purpose: "Purpose", format: "open_text" }]
        : ([
            { id: id(901), prompt: "Real prompt", purpose: "Purpose", when: "before" },
          ] as typeof d.questions);
    const text = growthSelectionText(
      d,
      guestGrowthSelectionSchema.parse({ kind, section: "question", questionId: id(901) }),
    );
    expect(text).toContain("Real prompt");
    expect(text).not.toContain(id(901));
    expect(text).not.toContain('"id"');
    expect(text).not.toMatch(/artifactId|experimentRef|learningRefs/);
    expect(() =>
      growthSelectionText(
        d,
        guestGrowthSelectionSchema.parse({
          kind,
          section: "question",
          questionId: id(901),
          excerpt: id(901),
        }),
      ),
    ).toThrow();
    expect(() =>
      growthSelectionText(
        d,
        guestGrowthSelectionSchema.parse({ kind, section: "question", questionId: id(902) }),
      ),
    ).toThrow();
  },
);
it("verifies literal excerpt membership rather than accepting invented advice", () => {
  const d = { ...source.document };
  if (d.kind !== "learning") throw Error();
  const whole = growthSelectionText(d, { kind: "learning", section: "observations" });
  expect(
    growthSelectionText(d, {
      kind: "learning",
      section: "observations",
      excerpt: whole.slice(2, 12),
    }),
  ).toBe(whole.slice(2, 12));
  expect(() =>
    growthSelectionText(d, {
      kind: "learning",
      section: "observations",
      excerpt: "made up private quote",
    }),
  ).toThrow();
  expect(() => growthSelectionText(d, { kind: "experiment", section: "plan" })).toThrow();
});
it("rejects account/marketing namespaces, raw fields and duplicated selected sections", () => {
  const base = {
    csrf: "a".repeat(64),
    artifactId: source.id,
    expectedRevision: 2,
    assignmentId: id(901),
    threadId: id(902),
    requestId: id(903),
    selections: [{ kind: "learning", section: "observations" }],
    redactions: [],
    reflection: {
      title: "Reviewed authored copy",
      interpretation: "",
      uncertainty: "",
      decision: "",
      nextAction: "",
    },
  };
  expect(previewGuestGrowthSchema.safeParse(base).success).toBe(true);
  for (const extra of [
    { projectId: id(9) },
    { planId: source.id },
    { userId: id(9) },
    { document: source.document },
  ])
    expect(previewGuestGrowthSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  expect(
    previewGuestGrowthSchema.safeParse({
      ...base,
      selections: [...base.selections, ...base.selections],
    }).success,
  ).toBe(false);
  expect(
    previewGuestGrowthSchema.safeParse({
      ...base,
      selections: [{ kind: "learning", section: "raw_notes" }],
    }).success,
  ).toBe(false);
});
it("rejects teacher body IDs, duplicate excerpt identities and oversized Unicode payloads", () => {
  const p = {
    schemaVersion: 1,
    resolverVersion: "guest-growth-v1",
    sourceKind: "guest_growth",
    title: "Review",
    interpretation: "",
    uncertainty: "",
    decision: "",
    nextAction: "",
    excerpts: [
      {
        key: "excerpt.1",
        label: "Observed",
        text: "Draft",
        evidenceLabel: "Student-authored / student-reported; not verified customer evidence",
      },
    ],
  };
  expect(guestGrowthTeacherPayloadSchema.safeParse(p).success).toBe(true);
  expect(guestGrowthTeacherPayloadSchema.safeParse({ ...p, artifactId: source.id }).success).toBe(
    false,
  );
  expect(
    guestGrowthTeacherPayloadSchema.safeParse({ ...p, excerpts: [...p.excerpts, ...p.excerpts] })
      .success,
  ).toBe(false);
  expect(
    guestGrowthTeacherPayloadSchema.safeParse({
      ...p,
      excerpts: [1, 2, 3].map((n) => ({
        ...p.excerpts[0],
        key: `excerpt.${n}`,
        text: "😀".repeat(6000),
      })),
    }).success,
  ).toBe(false);
});
it("keeps roster provenance metadata closed, unique and rooted", () => {
  const m = {
    resolverVersion: "guest-growth-v1",
    artifactId: source.id,
    revision: 2,
    publisher: source.authorPrincipalId,
    threads: [],
    sources: [
      {
        artifactId: source.id,
        revision: 2,
        kind: source.kind,
        audience: source.audience,
        authorPrincipalId: source.authorPrincipalId,
        sourcePrincipalGeneration: 1,
        choice: "unknown",
        choiceRevision: 0,
        referenceCount: 0,
        referenceDigest: "a".repeat(64),
      },
    ],
  };
  expect(sourceRosterSchema.safeParse(m).success).toBe(true);
  for (const extra of [
    { document: source.document },
    { sessionToken: "a".repeat(64) },
    { projectId: id(999) },
  ])
    expect(sourceRosterSchema.safeParse({ ...m, ...extra }).success).toBe(false);
  expect(sourceRosterSchema.safeParse({ ...m, sources: [] }).success).toBe(false);
  expect(
    sourceRosterSchema.safeParse({ ...m, sources: [...m.sources, ...m.sources] }).success,
  ).toBe(false);
});
