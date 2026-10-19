import { expect, it } from "vitest";
import {
  GUEST_GROWTH_KINDS,
  GUEST_GROWTH_LIMITS,
  GUEST_GROWTH_PDF_CONTENT,
  GUEST_GROWTH_EVIDENCE_LABEL,
  GUEST_GROWTH_RESOLVER_VERSION,
  createEmptyGuestGrowth,
  guestGrowthDocumentSchema,
  saveGuestGrowthSchema,
  guestGrowthRecordSchema,
  guestGrowthHistorySchema,
  guestGrowthSaveReceiptSchema,
  guestGrowthReferenceSchema,
  guestGrowthReferences,
  guestGrowthReferenceError,
  guestGrowthSelectionSchema,
  guestGrowthSelectionError,
  previewGuestGrowthSchema,
  guestGrowthChoiceSchema,
  saveGuestGrowthChoiceSchema,
  guestGrowthSubmissionHeaderSchema,
  confirmGuestGrowthSchema,
  guestGrowthTeacherPayloadSchema,
  readTeacherGrowthSubmissionSchema,
  type GuestGrowthReferenceMetadata,
  type GuestGrowthDocument,
} from "@/lib/guest-growth/contracts";
const id = (n: number) => `f2600000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const csrf = "a".repeat(64),
  time = "2026-10-19T00:00:00Z";
const scope = {
  artifactId: id(1),
  classId: id(2),
  teamId: id(3),
  principalId: id(4),
  audience: "principal_private" as const,
};
const header = {
  id: id(1),
  classId: id(2),
  teamId: id(3),
  authorPrincipalId: id(4),
  audience: "principal_private" as const,
  kind: "learning" as const,
  revision: 1,
  savedAt: time,
  aiEnabled: false,
};
const saved = (document: GuestGrowthDocument = createEmptyGuestGrowth("learning")) => ({
  ...header,
  kind: document.kind,
  document,
});
const save = (document: GuestGrowthDocument = createEmptyGuestGrowth("learning")) => ({
  csrf,
  artifactId: id(1),
  audience: "principal_private" as const,
  expectedRevision: 0,
  mutationId: id(9),
  sharedAudienceConfirmed: false,
  document,
});
it.each(GUEST_GROWTH_KINDS)(
  "defines a structured blank %s artifact and explicit PDF coverage contract",
  (kind) => {
    const blank = createEmptyGuestGrowth(kind);
    expect(guestGrowthDocumentSchema.parse(blank)).toEqual(blank);
    expect(GUEST_GROWTH_PDF_CONTENT[kind].length).toBeGreaterThan(4);
    expect(saveGuestGrowthSchema.safeParse(save(blank)).success).toBe(true);
    expect(guestGrowthRecordSchema.safeParse(saved(blank)).success).toBe(true);
  },
);
it.each(GUEST_GROWTH_KINDS)("rejects raw/private/account/AI payload additions in %s", (kind) => {
  const d = createEmptyGuestGrowth(kind);
  for (const [key, value] of Object.entries({
    projectId: id(20),
    user_id: id(21),
    interviewId: id(22),
    answers: [{ q: "Private question", note: "Private note", quote: "Private quote" }],
    participantEmail: "person@example.invalid",
    aiEnabled: true,
    generationOriginId: id(23),
    privateNotes: "Do not copy",
  }))
    expect(guestGrowthDocumentSchema.safeParse({ ...d, [key]: value }).success, key).toBe(false);
});
it("requires genuine blank team creation rather than relabeling private content", () => {
  for (const kind of GUEST_GROWTH_KINDS) {
    const d = createEmptyGuestGrowth(kind),
      input = { ...save(d), audience: "team_shared" };
    expect(saveGuestGrowthSchema.safeParse(input).success).toBe(false);
    expect(
      saveGuestGrowthSchema.safeParse({ ...input, sharedAudienceConfirmed: true }).success,
    ).toBe(true);
    expect(
      saveGuestGrowthSchema.safeParse({
        ...input,
        sharedAudienceConfirmed: true,
        document: { ...d, title: "Private content cannot be copied on create" },
      }).success,
    ).toBe(false);
    expect(
      saveGuestGrowthSchema.safeParse({
        ...input,
        expectedRevision: 1,
        document: { ...d, title: "New authored shared material" },
      }).success,
    ).toBe(true);
  }
  const d = { ...createEmptyGuestGrowth("survey"), stage: 3 };
  expect(
    saveGuestGrowthSchema.safeParse({
      ...save(),
      audience: "team_shared",
      sharedAudienceConfirmed: true,
      document: d,
    }).success,
  ).toBe(true);
});
it("rejects caller-controlled identities, foreign namespace references and unsafe revision values", () => {
  for (const extra of [
    { classId: id(20) },
    { teamId: id(20) },
    { authorPrincipalId: id(20) },
    { userId: id(20) },
  ])
    expect(saveGuestGrowthSchema.safeParse({ ...save(), ...extra }).success).toBe(false);
  for (const ref of [
    { kind: "interview", artifactId: id(2), revision: 1 },
    { kind: "learning", projectId: id(2), revision: 1 },
    { kind: "learning", artifactId: "bad-uuid", revision: 1 },
    { kind: "learning", artifactId: id(2), revision: 0 },
    { kind: "learning", artifactId: id(2), revision: 1.5 },
  ])
    expect(guestGrowthReferenceSchema.safeParse(ref).success).toBe(false);
  for (const expectedRevision of [-1, 40, 1.5, Number.MAX_SAFE_INTEGER])
    expect(saveGuestGrowthSchema.safeParse({ ...save(), expectedRevision }).success).toBe(false);
});
it("checks exact retained reference revision, kind, class, team and private author", () => {
  const d = {
    ...createEmptyGuestGrowth("experiment"),
    kind: "experiment" as const,
    learningRefs: [{ kind: "learning" as const, artifactId: id(10), revision: 2 }],
  };
  const source: GuestGrowthReferenceMetadata = {
    kind: "learning",
    artifactId: id(10),
    revision: 2,
    classId: id(2),
    teamId: id(3),
    authorPrincipalId: id(4),
    audience: "principal_private",
  };
  expect(guestGrowthReferences(guestGrowthDocumentSchema.parse(d))).toEqual(d.learningRefs);
  expect(guestGrowthReferenceError(d, scope, [source])).toBeNull();
  for (const change of [
    { revision: 1 },
    { kind: "experiment" as const },
    { classId: id(99) },
    { teamId: id(99) },
    { authorPrincipalId: id(99) },
  ])
    expect(guestGrowthReferenceError(d, scope, [{ ...source, ...change }])).not.toBeNull();
  expect(
    guestGrowthReferenceError(d, { ...scope, audience: "team_shared" }, [source]),
  ).not.toBeNull();
  expect(
    guestGrowthReferenceError(d, { ...scope, audience: "team_shared" }, [
      { ...source, audience: "team_shared", authorPrincipalId: id(99) },
    ]),
  ).toBeNull();
  expect(guestGrowthReferenceError(d, { ...scope, artifactId: id(10) }, [source])).not.toBeNull();
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      learningRefs: [...d.learningRefs, ...d.learningRefs],
    }).success,
  ).toBe(false);
});
it("keeps the reference graph acyclic and never accepts implicit source-note attachments", () => {
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...createEmptyGuestGrowth("learning"),
      experimentRef: { kind: "experiment", artifactId: id(10), revision: 1 },
    }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...createEmptyGuestGrowth("pipeline_contact"),
      learningRefs: [],
    }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...createEmptyGuestGrowth("referral"),
      contactRef: { kind: "learning", artifactId: id(10), revision: 1 },
    }).success,
  ).toBe(false);
});
it("distinguishes a manually reviewed learning from an empty draft or AI acceptance", () => {
  const d = createEmptyGuestGrowth("learning");
  expect(
    guestGrowthDocumentSchema.safeParse({ ...d, reviewState: "reviewed", reviewedAt: time })
      .success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      title: "Learning",
      interpretation: "My interpretation",
      nextTest: "Test a behavior",
      reviewState: "reviewed",
      reviewedAt: time,
    }).success,
  ).toBe(true);
  expect(guestGrowthDocumentSchema.safeParse({ ...d, reviewedAt: time }).success).toBe(false);
});
it("preserves unknown experiment quantities and explicitly reports outcome limitations", () => {
  const d = createEmptyGuestGrowth("experiment");
  expect(d.kind).toBe("experiment");
  if (d.kind !== "experiment") throw Error("fixture");
  expect(d.criterion.baseline).toBeNull();
  expect(
    guestGrowthDocumentSchema.parse({ ...d, criterion: { ...d.criterion, target: 0 } }),
  ).toMatchObject({ criterion: { baseline: null, target: 0 } });
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      state: "completed_reported",
      reportedStartOn: "2026-10-18",
    }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      reportedResult: { ...d.reportedResult, summary: "A claim before reporting any test" },
    }).success,
  ).toBe(false);
  const reported = {
    ...d,
    state: "completed_reported",
    reportedStartOn: "2026-10-18",
    reportedResult: {
      ...d.reportedResult,
      summary: "No one returned (self-report)",
      reportedOn: "2026-10-19",
      limitations: "Small non-random sample",
    },
  };
  expect(guestGrowthDocumentSchema.safeParse(reported).success).toBe(true);
  expect(
    guestGrowthDocumentSchema.safeParse({ ...reported, reportedStartOn: "2026-10-20" }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      criterion: { ...d.criterion, reviewOn: "2026-02-30" },
    }).success,
  ).toBe(false);
});
it("uses only later-stage alias pipeline records with self-reported status basis", () => {
  const d = createEmptyGuestGrowth("pipeline_contact");
  expect(guestGrowthDocumentSchema.safeParse({ ...d, stage: 1 }).success).toBe(false);
  for (const alias of [
    "person@example.invalid",
    "https://example.invalid/person",
    "+1 617 555 0123",
  ])
    expect(guestGrowthDocumentSchema.safeParse({ ...d, alias }).success).toBe(false);
  expect(guestGrowthDocumentSchema.safeParse({ ...d, status: "paying" }).success).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      alias: "Club builder A",
      status: "paying",
      reportedOn: "2026-10-19",
      statusBasis: "Owner-reported payment, not independently verified",
    }).success,
  ).toBe(true);
});
it("provides typed survey drafts and rejects response collection and duplicate choices", () => {
  const d = createEmptyGuestGrowth("survey"),
    question = {
      id: id(20),
      format: "single_choice",
      prompt: "Which action did you try?",
      purpose: "Understand behavior",
      options: ["A", "B"],
    };
  expect(guestGrowthDocumentSchema.safeParse({ ...d, questions: [question] }).success).toBe(true);
  for (const patch of [
    { responses: [] },
    { collection: "collected" },
    { delivery: "sent" },
    { questions: [{ ...question, options: [" A ", "a"] }] },
    { questions: [question, question] },
    { questions: [{ ...question, answers: ["A"] }] },
  ])
    expect(guestGrowthDocumentSchema.safeParse({ ...d, ...patch }).success).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      questions: [
        {
          id: id(20),
          format: "scale",
          prompt: "How difficult was that?",
          purpose: "Explore friction",
          minimum: 1,
          maximum: 5,
          lowLabel: "Easy",
          highLabel: "Difficult",
        },
      ],
    }).success,
  ).toBe(true);
});
it("defines dedicated referral and onboarding structure without automatic sending or captured answers", () => {
  const referral = createEmptyGuestGrowth("referral"),
    onboarding = createEmptyGuestGrowth("onboarding");
  expect(referral).toHaveProperty("respectfulExit");
  expect(referral).toHaveProperty("specificAsk");
  expect(onboarding).toHaveProperty("successObservationPlan");
  expect(
    guestGrowthDocumentSchema.safeParse({ ...referral, delivery: "manually_sent" }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...onboarding,
      questions: [
        {
          id: id(20),
          prompt: "What would you try first?",
          purpose: "Observe orientation",
          when: "before",
          answer: "Private response",
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...onboarding,
      questions: [
        { id: id(20), prompt: "What happened?", purpose: "Explore friction", when: "after" },
      ],
    }).success,
  ).toBe(true);
});
it("requires exact question selectors from the actual saved kind and rejects private/raw selection fields", () => {
  const d = guestGrowthDocumentSchema.parse({
    ...createEmptyGuestGrowth("survey"),
    questions: [
      {
        id: id(20),
        format: "open_text",
        prompt: "What happened last time?",
        purpose: "Past behavior",
      },
    ],
  });
  const selected = guestGrowthSelectionSchema.parse({
    kind: "survey",
    section: "question",
    questionId: id(20),
  });
  if (selected.kind !== "survey") throw new Error("Expected parsed survey selector");
  expect(guestGrowthSelectionError(d, [selected])).toBeNull();
  expect(guestGrowthSelectionError(d, [{ ...selected, questionId: id(99) }])).not.toBeNull();
  expect(
    guestGrowthSelectionError(d, [{ kind: "learning", section: "observations" }]),
  ).not.toBeNull();
  for (const selection of [
    { kind: "survey", section: "question" },
    { kind: "survey", section: "introduction", questionId: id(20) },
    { kind: "interview", section: "answers" },
    { kind: "learning", section: "raw_notes" },
    { kind: "learning", section: "observations", userId: id(2) },
  ])
    expect(guestGrowthSelectionSchema.safeParse(selection).success).toBe(false);
});
it("binds teacher preview selection kind and explicit confirmation without widening old namespaces", () => {
  const reflection = {
      title: "Review",
      interpretation: "",
      uncertainty: "",
      decision: "",
      nextAction: "",
    },
    selection = { kind: "learning", section: "interpretation" };
  const input = {
    csrf,
    artifactId: id(1),
    expectedRevision: 1,
    assignmentId: id(8),
    threadId: id(9),
    requestId: id(10),
    selections: [selection],
    redactions: [],
    reflection,
  };
  expect(previewGuestGrowthSchema.safeParse(input).success).toBe(true);
  expect(
    previewGuestGrowthSchema.safeParse({ ...input, selections: [selection, selection] }).success,
  ).toBe(false);
  expect(
    previewGuestGrowthSchema.safeParse({
      ...input,
      selections: [selection, { kind: "referral", section: "draft" }],
    }).success,
  ).toBe(false);
  expect(previewGuestGrowthSchema.safeParse({ ...input, audience: "team" }).success).toBe(false);
  expect(
    guestGrowthChoiceSchema.safeParse({
      sourceKind: "guest_growth",
      artifactId: id(1),
      choice: "unknown",
      revision: 0,
    }).success,
  ).toBe(true);
  expect(
    guestGrowthChoiceSchema.safeParse({
      sourceKind: "guest_growth",
      artifactId: id(1),
      choice: null,
      revision: 0,
    }).success,
  ).toBe(false);
  for (const selectedCopyConfirmed of [false, undefined])
    expect(
      confirmGuestGrowthSchema.safeParse({
        csrf,
        previewId: id(1),
        previewHash: "b".repeat(64),
        requestId: id(2),
        selectedCopyConfirmed,
      }).success,
    ).toBe(false);
  expect(
    readTeacherGrowthSubmissionSchema.safeParse({
      classId: id(2),
      snapshotId: id(3),
      presenter: true,
    }).success,
  ).toBe(false);
});
it("keeps immutable history scope, exact save acknowledgement and privacy evidence labels", () => {
  expect(
    guestGrowthHistorySchema.safeParse({
      artifactId: id(1),
      versions: [header, { ...header, revision: 2 }],
    }).success,
  ).toBe(true);
  for (const versions of [
    [header, header],
    [{ ...header, id: id(99) }],
    [header, { ...header, revision: 2, audience: "team_shared" }],
  ])
    expect(guestGrowthHistorySchema.safeParse({ artifactId: id(1), versions }).success).toBe(false);
  expect(
    guestGrowthSaveReceiptSchema.safeParse({ record: saved(), savedRevision: 2, replayed: true })
      .success,
  ).toBe(false);
  expect(guestGrowthRecordSchema.safeParse({ ...saved(), kind: "experiment" }).success).toBe(false);
  const payload = {
    schemaVersion: 1,
    resolverVersion: GUEST_GROWTH_RESOLVER_VERSION,
    sourceKind: "guest_growth",
    title: "Review",
    interpretation: "",
    uncertainty: "",
    decision: "",
    nextAction: "",
    excerpts: [
      {
        key: "excerpt.1",
        label: "Interpretation",
        text: "One authored interpretation",
        evidenceLabel: GUEST_GROWTH_EVIDENCE_LABEL,
      },
    ],
  };
  expect(guestGrowthTeacherPayloadSchema.safeParse(payload).success).toBe(true);
  expect(
    guestGrowthTeacherPayloadSchema.safeParse({
      ...payload,
      excerpts: [{ ...payload.excerpts[0], evidenceLabel: "Verified demand" }],
    }).success,
  ).toBe(false);
  expect(guestGrowthTeacherPayloadSchema.safeParse({ ...payload, artifactId: id(1) }).success).toBe(
    false,
  );
});
it("enforces Unicode and aggregate byte bounds and excludes likely credentials/capabilities", () => {
  const d = createEmptyGuestGrowth("learning");
  expect(guestGrowthDocumentSchema.safeParse({ ...d, title: "😀".repeat(120) }).success).toBe(true);
  expect(guestGrowthDocumentSchema.safeParse({ ...d, title: "😀".repeat(121) }).success).toBe(
    false,
  );
  expect(
    guestGrowthDocumentSchema.safeParse({ ...d, interpretation: "Bearer " + "x".repeat(30) })
      .success,
  ).toBe(false);
  expect(guestGrowthDocumentSchema.safeParse({ ...d, observations: "a".repeat(64) }).success).toBe(
    false,
  );
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      observations: "😀".repeat(3000),
      interpretation: "😀".repeat(3000),
      counterevidence: "😀".repeat(2000),
      uncertainty: "😀".repeat(2000),
    }).success,
  ).toBe(false);
  expect(GUEST_GROWTH_LIMITS.documentBytes).toBe(32768);
  expect(GUEST_GROWTH_LIMITS.classHistoryBytes).toBe(33554432);
});

it("supports structured authored synthesis patterns, objections, best-fit hypotheses and proposed changes without quotes", () => {
  const d = {
    ...createEmptyGuestGrowth("learning"),
    form: "synthesis",
    patterns: [
      {
        observationSummary: "Two deidentified reports described a workaround",
        interpretation: "The situation may matter",
        limitations: "Small convenience sample",
      },
    ],
    objections: ["Existing workaround may be sufficient"],
    bestFit: ["Builders who recently faced this situation"],
    proposedChanges: [
      {
        title: "Shorten one step",
        reason: "Authored interpretation of friction",
        nextStep: "Test with a different relevant person",
      },
    ],
  };
  expect(guestGrowthDocumentSchema.safeParse(d).success).toBe(true);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      patterns: [{ ...d.patterns[0], quotes: ["Private exact participant words"] }],
    }).success,
  ).toBe(false);
  expect(
    guestGrowthDocumentSchema.safeParse({
      ...d,
      proposedChanges: [{ ...d.proposedChanges[0], autoImplemented: true }],
    }).success,
  ).toBe(false);
});

it("bounds the aggregate preview request in UTF-8 bytes after valid distinct selectors", () => {
  const sections = [
    "observations",
    "patterns",
    "objections",
    "best_fit",
    "interpretation",
    "counterevidence",
    "uncertainty",
    "proposed_changes",
    "next_test",
    "review",
  ] as const;
  const input = {
    csrf,
    artifactId: id(1),
    expectedRevision: 1,
    assignmentId: id(8),
    threadId: id(9),
    requestId: id(10),
    selections: sections.map((section) => ({
      kind: "learning",
      section,
      excerpt: "x".repeat(6000),
    })),
    redactions: [],
    reflection: {
      title: "Review",
      interpretation: "",
      uncertainty: "",
      decision: "",
      nextAction: "",
    },
  };
  expect(previewGuestGrowthSchema.safeParse(input).success).toBe(true);
  const oversized = {
    ...input,
    selections: input.selections.map((s) => ({ ...s, excerpt: "😀".repeat(6000) })),
  };
  expect(new TextEncoder().encode(JSON.stringify(oversized)).length).toBeGreaterThan(
    GUEST_GROWTH_LIMITS.requestBytes,
  );
  expect(previewGuestGrowthSchema.safeParse(oversized).success).toBe(false);
  expect(
    previewGuestGrowthSchema.safeParse({
      ...oversized,
      selections: oversized.selections.slice(0, 1),
    }).success,
  ).toBe(true);
});
it("rejects duplicate reviewed excerpt keys independently of the payload byte limit", () => {
  const excerpt = {
    key: "excerpt.1",
    label: "Interpretation",
    text: "One interpretation",
    evidenceLabel: GUEST_GROWTH_EVIDENCE_LABEL,
  };
  const base = {
    schemaVersion: 1,
    resolverVersion: GUEST_GROWTH_RESOLVER_VERSION,
    sourceKind: "guest_growth",
    title: "Review",
    interpretation: "",
    uncertainty: "",
    decision: "",
    nextAction: "",
    excerpts: [excerpt, { ...excerpt, text: "Different text" }],
  };
  expect(guestGrowthTeacherPayloadSchema.safeParse(base).success).toBe(false);
  expect(
    guestGrowthTeacherPayloadSchema.safeParse({
      ...base,
      excerpts: [excerpt, { ...excerpt, key: "excerpt.2" }],
    }).success,
  ).toBe(true);
});
it("accepts terminal privacy-reduction responses while reserving CAS increment room", () => {
  const expected = Number.MAX_SAFE_INTEGER - 1;
  const request = {
    csrf,
    artifactId: id(1),
    choice: "withdrawn",
    expectedRevision: expected,
    requestId: id(20),
  };
  expect(saveGuestGrowthChoiceSchema.safeParse(request).success).toBe(true);
  expect(
    saveGuestGrowthChoiceSchema.safeParse({ ...request, expectedRevision: Number.MAX_SAFE_INTEGER })
      .success,
  ).toBe(false);
  expect(saveGuestGrowthChoiceSchema.safeParse({ ...request, choice: "granted" }).success).toBe(
    false,
  );
  expect(
    guestGrowthChoiceSchema.safeParse({
      sourceKind: "guest_growth",
      artifactId: id(1),
      choice: "withdrawn",
      revision: expected + 1,
    }).success,
  ).toBe(true);
  expect(
    guestGrowthChoiceSchema.safeParse({
      sourceKind: "guest_growth",
      artifactId: id(1),
      choice: "granted",
      revision: expected + 1,
    }).success,
  ).toBe(false);
  const withdrawn = {
    id: id(1),
    threadId: id(2),
    classId: id(3),
    assignmentId: id(4),
    sourceType: "guest_growth",
    version: 1,
    audience: "teacher",
    authorLabel: "Learner alias",
    submittedAt: time,
    grantState: "withdrawn",
    grantRevision: Number.MAX_SAFE_INTEGER,
    recipientEligible: false,
    title: "Review",
  };
  expect(guestGrowthSubmissionHeaderSchema.safeParse(withdrawn).success).toBe(true);
  expect(
    guestGrowthSubmissionHeaderSchema.safeParse({ ...withdrawn, grantState: "active" }).success,
  ).toBe(false);
});
