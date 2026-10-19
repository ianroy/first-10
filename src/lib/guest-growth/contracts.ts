import { z } from "zod";
import { hasLikelySecret } from "@/lib/discovery";
import { jsonBytes } from "@/lib/marketing-plan";
import { growthOptionKey, growthOptionTrim } from "./option-case";
import { secretSchema } from "@/lib/guest-spaces/contracts";

/** Contract-only: no persistence, authorization, PDF mount or collection is enabled here. */
export const GUEST_GROWTH_KINDS = [
  "learning",
  "experiment",
  "pipeline_contact",
  "survey",
  "referral",
  "onboarding",
] as const;
export const GUEST_GROWTH_LIMITS = {
  documentBytes: 32768,
  requestBytes: 65536,
  revisions: 40,
  privateArtifacts: 64,
  teamArtifacts: 96,
  privateHistoryBytes: 2097152,
  teamHistoryBytes: 8388608,
  classHistoryBytes: 33554432,
  ordinaryReceipts: 2000,
  requestsPerMinute: 120,
  page: 50,
  disclosurePublisherBytes: 2097152,
  disclosureClassBytes: 16777216,
  disclosureVersions: 20,
  disclosurePreviews: 50,
  disclosureExcerpts: 12,
  lineageSources: 32,
  lineageDepth: 3,
} as const;
export const GUEST_GROWTH_RESOLVER_VERSION = "guest-growth-v1" as const;
export const GUEST_GROWTH_EVIDENCE_LABEL =
  "Student-authored / student-reported; not verified customer evidence" as const;
const uuid = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
const text = (n: number) =>
  z
    .string()
    .refine((v) => Array.from(v).length <= n, `Use at most ${n} characters.`)
    .refine(
      (v) =>
        !v.includes("\u0000") &&
        !Array.from(v).some(
          (c) => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff,
        ),
      "Use valid Unicode text without NUL characters.",
    );
const instant = z
  .string()
  .datetime({ offset: true })
  .refine(
    (v) => !v.startsWith("0000") && Number.isFinite(Date.parse(v)),
    "Use a finite supported calendar instant.",
  );
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !v.startsWith("0000") &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().startsWith(v),
  );
const count = z.number().int().min(0).max(1000000).nullable();
const choice = z.enum(["unknown", "granted", "withdrawn"]);
const stage = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const laterStage = z.union([z.literal(2), z.literal(3)]);
const audience = z.enum(["principal_private", "team_shared"]);
const revision = z.number().int().min(1).max(GUEST_GROWTH_LIMITS.revisions);
// A CAS request must leave room for one increment; a returned terminal reduction may use MAX.
const requestPermissionRevision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const permissionRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const guestGrowthKindSchema = z.enum(GUEST_GROWTH_KINDS);
const reference = <K extends "learning" | "experiment" | "pipeline_contact">(kind: K) =>
  z.object({ kind: z.literal(kind), artifactId: uuid, revision }).strict();
export const guestGrowthReferenceSchema = z.discriminatedUnion("kind", [
  reference("learning"),
  reference("experiment"),
  reference("pipeline_contact"),
]);
export type GuestGrowthReference = z.infer<typeof guestGrowthReferenceSchema>;
const common = { schemaVersion: z.literal(1), title: text(120) };
export const guestGrowthLearningSchema = z
  .object({
    ...common,
    kind: z.literal("learning"),
    stage,
    form: z.enum(["learning", "synthesis"]),
    observations: text(3000),
    patterns: z
      .array(
        z
          .object({
            observationSummary: text(1200),
            interpretation: text(1200),
            limitations: text(1000),
          })
          .strict(),
      )
      .max(8),
    objections: z.array(text(1000)).max(8),
    bestFit: z.array(text(1000)).max(8),
    interpretation: text(3000),
    counterevidence: text(2000),
    uncertainty: text(2000),
    proposedChanges: z
      .array(z.object({ title: text(120), reason: text(1000), nextStep: text(1000) }).strict())
      .max(8),
    nextTest: text(2000),
    reviewState: z.enum(["draft", "reviewed"]),
    reviewedAt: instant.nullable(),
  })
  .strict();
export const guestGrowthExperimentSchema = z
  .object({
    ...common,
    kind: z.literal("experiment"),
    stage,
    learningRefs: z.array(reference("learning")).max(4),
    hypothesis: text(2000),
    change: text(2000),
    audience: text(1500),
    procedure: text(3000),
    criterion: z
      .object({
        measure: text(1000),
        baseline: count,
        target: count,
        unit: z.enum(["people", "sessions", "events", "other", "unknown"]),
        repeatIf: text(1000),
        reviseIf: text(1000),
        stopIf: text(1000),
        reviewOn: day.nullable(),
      })
      .strict(),
    state: z.enum(["planned", "running_reported", "completed_reported", "stopped_reported"]),
    reportedStartOn: day.nullable(),
    reportedResult: z
      .object({
        summary: text(3000),
        reportedOn: day.nullable(),
        count,
        limitations: text(2000),
        decision: z.enum(["unknown", "repeat", "revise", "stop"]),
        nextAction: text(2000),
      })
      .strict(),
  })
  .strict();
const alias = text(80).refine(
  (v) => !/@|https?:\/\/|(?:\+?\d[\s().-]*){9,}/i.test(v),
  "Use a role or non-identifying alias, without email, phone or URL.",
);
export const guestGrowthPipelineSchema = z
  .object({
    ...common,
    kind: z.literal("pipeline_contact"),
    stage: laterStage,
    alias,
    relationship: z.enum(["unknown", "friend", "classmate", "introduced", "community", "other"]),
    relevantExperience: text(1500),
    fitReason: text(1500),
    source: text(1000),
    status: z.enum(["to_contact", "contacted", "replied", "tried", "active", "paying"]),
    reportedOn: day.nullable(),
    statusBasis: text(1500),
    uncertainty: text(1500),
    nextAction: text(1000),
  })
  .strict();
const questionBase = { id: uuid, prompt: text(1000), purpose: text(500) };
export const guestGrowthSurveyQuestionSchema = z.discriminatedUnion("format", [
  z.object({ ...questionBase, format: z.literal("open_text") }).strict(),
  z
    .object({
      ...questionBase,
      format: z.literal("single_choice"),
      options: z
        .array(text(120).refine((v) => Boolean(growthOptionTrim(v))))
        .min(2)
        .max(6),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      format: z.literal("scale"),
      minimum: z.literal(1),
      maximum: z.union([z.literal(5), z.literal(7)]),
      lowLabel: text(120),
      highLabel: text(120),
    })
    .strict(),
]);
export const guestGrowthSurveySchema = z
  .object({
    ...common,
    kind: z.literal("survey"),
    stage: laterStage,
    experimentRef: reference("experiment").nullable(),
    purpose: text(1500),
    audience: text(1500),
    introduction: text(2000),
    permissionReminder: text(1000),
    questions: z.array(guestGrowthSurveyQuestionSchema).max(12),
    delivery: z.literal("unsent_draft"),
    collection: z.literal("not_collected"),
  })
  .strict();
export const guestGrowthReferralSchema = z
  .object({
    ...common,
    kind: z.literal("referral"),
    stage: z.literal(3),
    contactRef: reference("pipeline_contact").nullable(),
    experimentRef: reference("experiment").nullable(),
    recipientAlias: alias,
    recipientRole: text(500),
    relevantPersonCriteria: text(1500),
    builderDisclosure: text(1000),
    context: text(1500),
    specificAsk: text(2000),
    body: text(4000),
    respectfulExit: text(1000),
    delivery: z.literal("unsent_draft"),
  })
  .strict();
export const guestGrowthOnboardingSchema = z
  .object({
    ...common,
    kind: z.literal("onboarding"),
    stage: z.literal(3),
    experimentRef: reference("experiment").nullable(),
    audience: text(1500),
    userGoal: text(1500),
    firstAction: text(1500),
    successObservationPlan: text(1500),
    walkthroughPrompt: text(2000),
    anticipatedHesitation: text(1500),
    questions: z
      .array(
        z
          .object({
            id: uuid,
            prompt: text(1000),
            purpose: text(500),
            when: z.enum(["before", "during", "after"]),
          })
          .strict(),
      )
      .max(12),
    delivery: z.literal("unsent_draft"),
    collection: z.literal("not_collected"),
  })
  .strict();
const documentBase = z.discriminatedUnion("kind", [
  guestGrowthLearningSchema,
  guestGrowthExperimentSchema,
  guestGrowthPipelineSchema,
  guestGrowthSurveySchema,
  guestGrowthReferralSchema,
  guestGrowthOnboardingSchema,
]);
export const guestGrowthDocumentSchema = documentBase.superRefine((d, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (jsonBytes(d) > GUEST_GROWTH_LIMITS.documentBytes)
    fail("This artifact is too large. Shorten or export it before saving.");
  // Capability-looking tokens are excluded from artifact content, never from the separate CSRF envelope.
  if (hasLikelySecret(JSON.stringify(d)) || /\b[a-f0-9]{64}\b/i.test(JSON.stringify(d)))
    fail("Remove credentials or capability-looking tokens before saving.");
  if (d.kind === "learning") {
    if (d.reviewState === "draft" && d.reviewedAt !== null)
      fail("A draft has no reviewed timestamp.");
    if (
      d.reviewState === "reviewed" &&
      (!d.reviewedAt || !d.title.trim() || !d.interpretation.trim() || !d.nextTest.trim())
    )
      fail("Review requires a title, interpretation, next test and reported review time.");
  }
  if (d.kind === "experiment") {
    if (
      d.state === "planned" &&
      (d.reportedResult.summary ||
        d.reportedResult.reportedOn !== null ||
        d.reportedResult.count !== null ||
        d.reportedResult.limitations ||
        d.reportedResult.decision !== "unknown" ||
        d.reportedResult.nextAction)
    )
      fail(
        "A planned experiment has no reported outcome. Keep intended results in the hypothesis and criterion.",
      );
    if (d.state === "planned" && d.reportedStartOn !== null)
      fail("A planned test has no reported start date.");
    if (d.state !== "planned" && !d.reportedStartOn)
      fail("Record the reported start date or leave the test planned.");
    if (
      ["completed_reported", "stopped_reported"].includes(d.state) &&
      (!d.reportedResult.reportedOn ||
        !d.reportedResult.summary.trim() ||
        !d.reportedResult.limitations.trim())
    )
      fail("Reported outcomes require a date, summary and limitations.");
    if (
      d.reportedStartOn &&
      d.reportedResult.reportedOn &&
      d.reportedStartOn > d.reportedResult.reportedOn
    )
      fail("An outcome cannot precede the reported start.");
  }
  if (
    d.kind === "pipeline_contact" &&
    d.status !== "to_contact" &&
    (!d.reportedOn || !d.statusBasis.trim())
  )
    fail("Reported pipeline changes require a date and basis; they do not verify use or payment.");
  if (d.kind === "survey" || d.kind === "onboarding") {
    if (new Set(d.questions.map((q) => q.id)).size !== d.questions.length)
      fail("Question identifiers must be unique.");
    if (d.kind === "survey")
      for (const q of d.questions)
        if (
          q.format === "single_choice" &&
          q.options.every((v) => Array.from(v).length <= 120) &&
          new Set(q.options.map(growthOptionKey)).size !== q.options.length
        )
          fail("Question options must be distinct.");
  }
  const refs = guestGrowthReferences(d);
  if (new Set(refs.map((r) => r.artifactId)).size !== refs.length)
    fail("Reference each source artifact once.");
});
export type GuestGrowthDocument = z.infer<typeof guestGrowthDocumentSchema>;
export type GuestGrowthKind = GuestGrowthDocument["kind"];
export function guestGrowthReferences(d: z.infer<typeof documentBase>): GuestGrowthReference[] {
  switch (d.kind) {
    case "experiment":
      return d.learningRefs;
    case "survey":
    case "onboarding":
      return d.experimentRef ? [d.experimentRef] : [];
    case "referral":
      return [d.contactRef, d.experimentRef].filter((v): v is NonNullable<typeof v> => v !== null);
    default:
      return [];
  }
}
/** Kind-specific empty team creation deliberately cannot import an existing private document. */
export function createEmptyGuestGrowth<K extends GuestGrowthKind>(
  kind: K,
): Extract<GuestGrowthDocument, { kind: K }>;
export function createEmptyGuestGrowth(kind: GuestGrowthKind): GuestGrowthDocument {
  const base = { schemaVersion: 1 as const, title: "" };
  switch (kind) {
    case "learning":
      return {
        ...base,
        kind,
        stage: 1,
        form: "learning",
        observations: "",
        patterns: [],
        objections: [],
        bestFit: [],
        interpretation: "",
        counterevidence: "",
        uncertainty: "",
        proposedChanges: [],
        nextTest: "",
        reviewState: "draft",
        reviewedAt: null,
      };
    case "experiment":
      return {
        ...base,
        kind,
        stage: 1,
        learningRefs: [],
        hypothesis: "",
        change: "",
        audience: "",
        procedure: "",
        criterion: {
          measure: "",
          baseline: null,
          target: null,
          unit: "unknown",
          repeatIf: "",
          reviseIf: "",
          stopIf: "",
          reviewOn: null,
        },
        state: "planned",
        reportedStartOn: null,
        reportedResult: {
          summary: "",
          reportedOn: null,
          count: null,
          limitations: "",
          decision: "unknown",
          nextAction: "",
        },
      };
    case "pipeline_contact":
      return {
        ...base,
        kind,
        stage: 2,
        alias: "",
        relationship: "unknown",
        relevantExperience: "",
        fitReason: "",
        source: "",
        status: "to_contact",
        reportedOn: null,
        statusBasis: "",
        uncertainty: "",
        nextAction: "",
      };
    case "survey":
      return {
        ...base,
        kind,
        stage: 2,
        experimentRef: null,
        purpose: "",
        audience: "",
        introduction: "",
        permissionReminder: "",
        questions: [],
        delivery: "unsent_draft",
        collection: "not_collected",
      };
    case "referral":
      return {
        ...base,
        kind,
        stage: 3,
        contactRef: null,
        experimentRef: null,
        recipientAlias: "",
        recipientRole: "",
        relevantPersonCriteria: "",
        builderDisclosure: "",
        context: "",
        specificAsk: "",
        body: "",
        respectfulExit: "",
        delivery: "unsent_draft",
      };
    case "onboarding":
      return {
        ...base,
        kind,
        stage: 3,
        experimentRef: null,
        audience: "",
        userGoal: "",
        firstAction: "",
        successObservationPlan: "",
        walkthroughPrompt: "",
        anticipatedHesitation: "",
        questions: [],
        delivery: "unsent_draft",
        collection: "not_collected",
      };
  }
}
const scope = z.object({ csrf: secretSchema }).strict();
export const listGuestGrowthSchema = scope
  .extend({ kind: guestGrowthKindSchema.optional(), cursor: uuid.optional() })
  .strict();
export const loadGuestGrowthSchema = scope
  .extend({ artifactId: uuid, revision: revision.optional() })
  .strict();
export const saveGuestGrowthSchema = scope
  .extend({
    artifactId: uuid,
    audience,
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(GUEST_GROWTH_LIMITS.revisions - 1),
    mutationId: uuid,
    sharedAudienceConfirmed: z.boolean(),
    document: guestGrowthDocumentSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.audience === "team_shared" &&
      v.expectedRevision === 0 &&
      (!v.sharedAudienceConfirmed ||
        JSON.stringify(v.document) !==
          JSON.stringify({ ...createEmptyGuestGrowth(v.document.kind), stage: v.document.stage }))
    )
      ctx.addIssue({
        code: "custom",
        message: "Confirm and save a new blank team artifact before adding shared material.",
      });
  });
export const guestGrowthHeaderSchema = z
  .object({
    id: uuid,
    classId: uuid,
    teamId: uuid,
    authorPrincipalId: uuid,
    audience,
    kind: guestGrowthKindSchema,
    revision,
    savedAt: instant,
    aiEnabled: z.literal(false),
  })
  .strict();
export const guestGrowthRecordSchema = guestGrowthHeaderSchema
  .extend({ document: guestGrowthDocumentSchema })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind !== v.document.kind)
      ctx.addIssue({
        code: "custom",
        message: "The stored artifact kind must match its document.",
      });
  });
export const guestGrowthSaveReceiptSchema = z
  .object({ record: guestGrowthRecordSchema, savedRevision: revision, replayed: z.boolean() })
  .strict()
  .refine(
    (v) =>
      v.savedRevision <= v.record.revision && (v.replayed || v.savedRevision === v.record.revision),
    "An acknowledgement cannot claim a newer or unrelated revision.",
  );
export const guestGrowthPageSchema = z
  .object({ items: z.array(guestGrowthHeaderSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
export const guestGrowthHistorySchema = z
  .object({
    artifactId: uuid,
    versions: z.array(guestGrowthHeaderSchema).max(GUEST_GROWTH_LIMITS.revisions),
  })
  .strict()
  .superRefine((v, ctx) => {
    const first = v.versions[0];
    if (
      new Set(v.versions.map((h) => h.revision)).size !== v.versions.length ||
      v.versions.some(
        (h) =>
          h.id !== v.artifactId ||
          (first &&
            [h.kind, h.classId, h.teamId, h.authorPrincipalId, h.audience].join(":") !==
              [
                first.kind,
                first.classId,
                first.teamId,
                first.authorPrincipalId,
                first.audience,
              ].join(":")),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "History must contain distinct revisions of one immutable artifact scope.",
      });
  });

/** Defense-in-depth pure validation over a SERVER-AUTHORIZED inventory; never an access grant. */
export type GuestGrowthReferenceMetadata = GuestGrowthReference & {
  classId: string;
  teamId: string;
  authorPrincipalId: string;
  audience: "principal_private" | "team_shared";
};
export function guestGrowthReferenceError(
  document: GuestGrowthDocument,
  scope: {
    artifactId: string;
    classId: string;
    teamId: string;
    principalId: string;
    audience: "principal_private" | "team_shared";
  },
  inventory: readonly GuestGrowthReferenceMetadata[],
): string | null {
  for (const ref of guestGrowthReferences(document)) {
    if (ref.artifactId === scope.artifactId) return "An artifact cannot reference itself.";
    const found = inventory.find(
      (r) => r.artifactId === ref.artifactId && r.revision === ref.revision && r.kind === ref.kind,
    );
    if (
      !found ||
      found.classId !== scope.classId ||
      found.teamId !== scope.teamId ||
      (found.audience === "principal_private" &&
        (found.authorPrincipalId !== scope.principalId || scope.audience === "team_shared"))
    )
      return "Use only exact retained growth revisions available in this class, team and audience.";
  }
  return null;
}
export const guestGrowthChoiceSchema = z
  .object({
    sourceKind: z.literal("guest_growth"),
    artifactId: uuid,
    choice,
    revision: permissionRevision,
  })
  .strict()
  .refine(
    (v) => v.revision < Number.MAX_SAFE_INTEGER || v.choice === "withdrawn",
    "The terminal permission revision is reserved for withdrawal.",
  );
export const saveGuestGrowthChoiceSchema = scope
  .extend({
    artifactId: uuid,
    choice,
    expectedRevision: requestPermissionRevision,
    requestId: uuid,
  })
  .strict()
  .refine(
    (v) => v.expectedRevision < Number.MAX_SAFE_INTEGER - 1 || v.choice === "withdrawn",
    "Only withdrawal may consume the last permission revision.",
  );
const selectBase = {
  excerpt: text(6000)
    .refine((v) => v.length > 0)
    .optional(),
};
export const guestGrowthSelectionSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...selectBase,
        kind: z.literal("learning"),
        section: z.enum([
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
        ]),
      })
      .strict(),
    z
      .object({
        ...selectBase,
        kind: z.literal("experiment"),
        section: z.enum(["plan", "criterion", "reported_result", "reported_state"]),
      })
      .strict(),
    z
      .object({
        ...selectBase,
        kind: z.literal("pipeline_contact"),
        section: z.enum(["alias", "fit", "reported_status", "next_action"]),
      })
      .strict(),
    z
      .object({
        ...selectBase,
        kind: z.literal("survey"),
        section: z.enum(["introduction", "question"]),
        questionId: uuid.optional(),
      })
      .strict(),
    z
      .object({
        ...selectBase,
        kind: z.literal("referral"),
        section: z.enum(["recipient_role", "draft", "specific_ask", "safe_exit"]),
      })
      .strict(),
    z
      .object({
        ...selectBase,
        kind: z.literal("onboarding"),
        section: z.enum(["goal", "first_action", "walkthrough", "question"]),
        questionId: uuid.optional(),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    if (
      (v.kind === "survey" || v.kind === "onboarding") &&
      (v.section === "question") !== Boolean(v.questionId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Only an individual question selection requires its exact question ID.",
      });
  });
/** Structural check only; the future resolver must load this exact saved revision itself. */
export function guestGrowthSelectionError(
  document: GuestGrowthDocument,
  selections: readonly z.infer<typeof guestGrowthSelectionSchema>[],
): string | null {
  for (const selection of selections) {
    if (selection.kind !== document.kind) return "Select sections from this actual artifact kind.";
    if (
      (document.kind === "survey" || document.kind === "onboarding") &&
      (selection.kind === "survey" || selection.kind === "onboarding") &&
      selection.section === "question" &&
      !document.questions.some((q) => q.id === selection.questionId)
    )
      return "Select a question in this exact saved artifact revision.";
  }
  return null;
}

const reflection = z
  .object({
    title: text(120).refine((v) => Boolean(growthOptionTrim(v))),
    interpretation: text(3000),
    uncertainty: text(2000),
    decision: text(2000),
    nextAction: text(2000),
  })
  .strict();
export const previewGuestGrowthSchema = scope
  .extend({
    artifactId: uuid,
    expectedRevision: revision,
    assignmentId: uuid,
    threadId: uuid,
    requestId: uuid,
    selections: z.array(guestGrowthSelectionSchema).min(1).max(12),
    redactions: z.array(text(200).refine((v) => Boolean(growthOptionTrim(v)))).max(30),
    reflection,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (jsonBytes(v) > GUEST_GROWTH_LIMITS.requestBytes)
      ctx.addIssue({
        code: "custom",
        message: "This reviewed-copy request exceeds its UTF-8 byte bound.",
      });
    if (
      new Set(
        v.selections.map((s) =>
          JSON.stringify([s.kind, s.section, "questionId" in s ? s.questionId : null]),
        ),
      ).size !== v.selections.length ||
      new Set(v.selections.map((s) => s.kind)).size !== 1
    )
      ctx.addIssue({ code: "custom", message: "Choose distinct sections from one artifact kind." });
  });
const teacherPayloadBase = reflection
  .extend({
    schemaVersion: z.literal(1),
    resolverVersion: z.literal(GUEST_GROWTH_RESOLVER_VERSION),
    sourceKind: z.literal("guest_growth"),
    excerpts: z
      .array(
        z
          .object({
            key: z.string().regex(/^excerpt\.[1-9][0-9]?$/),
            label: text(120),
            text: text(6000),
            evidenceLabel: z.literal(GUEST_GROWTH_EVIDENCE_LABEL),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export const guestGrowthTeacherPayloadSchema = teacherPayloadBase.superRefine((v, ctx) => {
  if (jsonBytes(v) > 40000)
    ctx.addIssue({ code: "custom", message: "The reviewed payload exceeds its byte bound." });
  if (new Set(v.excerpts.map((e) => e.key)).size !== v.excerpts.length)
    ctx.addIssue({ code: "custom", message: "Reviewed excerpt keys must be unique." });
});
export const guestGrowthPreviewSchema = z
  .object({
    id: uuid,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    threadId: uuid,
    expiresAt: instant,
    audience: z.literal("teacher"),
    payload: guestGrowthTeacherPayloadSchema,
  })
  .strict();
const submittedHeader = z
  .object({
    id: uuid,
    threadId: uuid,
    classId: uuid,
    assignmentId: uuid,
    sourceType: z.literal("guest_growth"),
    version: z.number().int().min(1).max(20),
    audience: z.literal("teacher"),
    authorLabel: text(80).refine((v) => v.length > 0),
    submittedAt: instant,
    grantState: z.enum(["active", "withdrawn"]),
    grantRevision: permissionRevision.min(1),
    recipientEligible: z.boolean(),
    title: text(120),
  })
  .strict();
const terminalGrantReduction = (v: { grantRevision: number; grantState: "active" | "withdrawn" }) =>
  v.grantRevision < Number.MAX_SAFE_INTEGER || v.grantState === "withdrawn";
export const guestGrowthSubmissionHeaderSchema = submittedHeader.refine(
  terminalGrantReduction,
  "The terminal grant revision is reserved for withdrawal.",
);
export const guestGrowthSubmissionViewSchema = submittedHeader
  .extend({ payload: guestGrowthTeacherPayloadSchema })
  .strict()
  .refine(terminalGrantReduction, "The terminal grant revision is reserved for withdrawal.");
export const readGuestGrowthChoiceSchema = scope.extend({ artifactId: uuid }).strict();
export const readGuestGrowthSubmissionSchema = scope.extend({ snapshotId: uuid }).strict();
export const listGuestGrowthSubmissionsSchema = scope.extend({ cursor: uuid.optional() }).strict();
export const withdrawGuestGrowthSubmissionSchema = readGuestGrowthSubmissionSchema
  .extend({ requestId: uuid })
  .strict();
export const readTeacherGrowthSubmissionSchema = z
  .object({ classId: uuid, snapshotId: uuid })
  .strict();
export const listTeacherGrowthSubmissionsSchema = z
  .object({ classId: uuid, assignmentId: uuid.optional(), cursor: uuid.optional() })
  .strict();
export const confirmGuestGrowthSchema = scope
  .extend({
    previewId: uuid,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: uuid,
    selectedCopyConfirmed: z.literal(true),
  })
  .strict();
/** Design catalog, not a registered PDF adapter or implemented export mount. */
export const GUEST_GROWTH_PDF_CONTENT = {
  learning: [
    "learning/synthesis form",
    "observations",
    "patterns with interpretation and limitations",
    "objections",
    "best-fit hypotheses",
    "interpretation",
    "counterevidence",
    "uncertainty",
    "each proposed change with reason and next step",
    "next test",
    "reported review",
  ],
  experiment: [
    "hypothesis",
    "change",
    "procedure",
    "criterion",
    "reported state",
    "reported result",
    "limitations",
  ],
  pipeline_contact: [
    "alias",
    "relationship",
    "fit",
    "reported status",
    "date and basis",
    "uncertainty",
    "next action",
  ],
  survey: [
    "purpose",
    "audience",
    "introduction",
    "permission reminder",
    "each typed draft question",
    "unsent and not-collected limits",
  ],
  referral: [
    "recipient alias and role",
    "fit criteria",
    "builder disclosure",
    "context",
    "specific ask",
    "body",
    "respectful exit",
    "unsent limits",
  ],
  onboarding: [
    "audience",
    "user goal",
    "first action",
    "success observation plan",
    "walkthrough",
    "hesitation",
    "each timed draft question",
    "unsent and not-collected limits",
  ],
} as const satisfies Record<GuestGrowthKind, readonly string[]>;
