import { z } from "zod";
import { activity, section, type ActivityOffer } from "@/lib/export/adapters";
import { activityExportSchema, type ActivityExportV1 } from "@/lib/export/activity";
import {
  guestGrowthDocumentSchema,
  guestGrowthRecordSchema,
  guestGrowthReferences,
  GUEST_GROWTH_EVIDENCE_LABEL,
  type GuestGrowthDocument,
} from "./contracts";
const uuid = z.string().uuid();
/** Supplied from current guest authority; structural parsing is NOT an authorization grant. */
export const guestGrowthPdfScopeSchema = z
  .object({
    classId: uuid,
    teamId: uuid,
    principalId: uuid,
    className: z.string().max(120),
    teamAlias: z.string().max(80),
    principalAlias: z.string().max(80),
    accessExpiresAt: z.string().datetime({ offset: true }),
    fictional: z.boolean(),
  })
  .strict();
export type GuestGrowthPdfScope = z.infer<typeof guestGrowthPdfScopeSchema>;
export const guestGrowthPdfSourceSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("saved"),
      record: guestGrowthRecordSchema,
      localDocument: guestGrowthDocumentSchema.optional(),
    })
    .strict(),
  z
    .object({ state: z.literal("draft"), localDraftId: uuid, document: guestGrowthDocumentSchema })
    .strict(),
]);
export type GuestGrowthPdfSource = z.infer<typeof guestGrowthPdfSourceSchema>;
export const GUEST_GROWTH_TITLES = {
  learning: "Learning & synthesis",
  experiment: "Experiment",
  pipeline_contact: "Alias pipeline contact",
  survey: "Feedback survey draft",
  referral: "Referral ask draft",
  onboarding: "Onboarding research draft",
} as const;
const fp = (v: unknown) => JSON.stringify(v);
/** Every document field has a deliberate section; referenced bodies are never fetched/copied. */
export function guestGrowthActivities(
  value: GuestGrowthPdfSource,
  rawScope: GuestGrowthPdfScope,
): ActivityOffer[] {
  const source = guestGrowthPdfSourceSchema.parse(value),
    scope = guestGrowthPdfScopeSchema.parse(rawScope);
  const record = source.state === "saved" ? source.record : null;
  if (
    record &&
    (record.classId !== scope.classId ||
      record.teamId !== scope.teamId ||
      (record.audience === "principal_private" && record.authorPrincipalId !== scope.principalId))
  )
    throw Error("This artifact does not belong to this guest export scope.");
  const d =
    source.state === "draft" ? source.document : (source.localDocument ?? source.record.document);
  if (record && record.kind !== d.kind)
    throw Error("A local overlay cannot change the saved artifact kind.");
  const dirty =
    !record ||
    (source.state === "saved" && Boolean(source.localDocument) && fp(d) !== fp(record.document));
  const id = source.state === "saved" ? source.record.id : source.localDraftId;
  const key = `growth.${id}.${record ? `r${record.revision}` : "draft"}`,
    s = (suffix: string, title: string, fields: Parameters<typeof section>[2]) =>
      section(`${key}.${suffix}`, title, fields);
  const sections = [
    s("identity", "Audience, revision and limits", [
      ["Artifact", GUEST_GROWTH_TITLES[d.kind]],
      ["Artifact schema version", d.schemaVersion],
      ["Title", d.title],
      ["Teaching stage", d.stage],
      ["Class", scope.className],
      ["Team", scope.teamAlias],
      [
        "Audience",
        record?.audience === "team_shared"
          ? "Current and future authorized teammates"
          : "Private to this current guest principal",
      ],
      [
        "Save state",
        !record
          ? "Unsaved local draft; no stored record is claimed"
          : dirty
            ? `Local edits over saved revision ${record.revision}; these edits are NOT saved`
            : `Exact retained saved revision ${record.revision}`,
      ],
      ["Saved revision", record?.revision ?? null],
      ["Saved time", record?.savedAt ?? null],
      ["Class access deadline", scope.accessExpiresAt],
      ["Evidence limit", GUEST_GROWTH_EVIDENCE_LABEL],
      [
        "PDF limit",
        "This file does not verify a conversation, use, payment, learning outcome or permission. It does not submit work, send messages or grant teacher access. Export before class access ends; earlier downloads cannot be recalled.",
      ],
    ]),
  ];
  switch (d.kind) {
    case "learning":
      sections.push(
        s("observations", "Authored learning", [
          ["Form", d.form],
          ["Deidentified observations", d.observations],
          ["Interpretation", d.interpretation],
          ["Counterevidence", d.counterevidence],
          ["Uncertainty", d.uncertainty],
        ]),
      );
      d.patterns.forEach((p, i) =>
        sections.push(
          s(`pattern.${i}`, `Pattern ${i + 1} - authored`, [
            ["Observation summary", p.observationSummary],
            ["Interpretation", p.interpretation],
            ["Limitations", p.limitations],
          ]),
        ),
      );
      sections.push(
        s("fit", "Objections and best-fit hypotheses", [
          ["Objections", d.objections.join("\n")],
          ["Best-fit hypotheses", d.bestFit.join("\n")],
        ]),
      );
      d.proposedChanges.forEach((c, i) =>
        sections.push(
          s(`change.${i}`, `Proposed change ${i + 1}`, [
            ["Title", c.title],
            ["Reason", c.reason],
            ["Next step", c.nextStep],
          ]),
        ),
      );
      sections.push(
        s("review", "Next test and reported review", [
          ["Next test", d.nextTest],
          ["Review state", d.reviewState],
          ["Reported reviewed time", d.reviewedAt],
          ["Limit", "Review is student-reported; no raw interview words are attached."],
        ]),
      );
      break;
    case "experiment":
      sections.push(
        s("plan", "Plan a falsifiable test", [
          ["Hypothesis", d.hypothesis],
          ["Change", d.change],
          ["Audience", d.audience],
          ["Procedure", d.procedure],
        ]),
        s("criterion", "Decide what would change your mind", [
          ["Measure", d.criterion.measure],
          ["Baseline", d.criterion.baseline],
          ["Target", d.criterion.target],
          ["Unit", d.criterion.unit],
          ["Repeat if", d.criterion.repeatIf],
          ["Revise if", d.criterion.reviseIf],
          ["Stop if", d.criterion.stopIf],
          ["Review on", d.criterion.reviewOn],
        ]),
        s("result", "Separately reported outcome", [
          ["Reported state", d.state],
          ["Reported start", d.reportedStartOn],
          ["Summary", d.reportedResult.summary],
          ["Reported date", d.reportedResult.reportedOn],
          ["Reported count", d.reportedResult.count],
          ["Limitations", d.reportedResult.limitations],
          ["Decision", d.reportedResult.decision],
          ["Next action", d.reportedResult.nextAction],
          [
            "Limit",
            "A planned test or an entered result is not independent evidence that the test occurred.",
          ],
        ]),
      );
      break;
    case "pipeline_contact":
      sections.push(
        s("fit", "Why this alias might fit", [
          ["Alias / role", d.alias],
          ["Relationship", d.relationship],
          ["Relevant experience", d.relevantExperience],
          ["Fit reason", d.fitReason],
          ["Source", d.source],
        ]),
        s("status", "Manually reported pipeline", [
          ["Status", d.status],
          ["Reported date", d.reportedOn],
          ["Basis", d.statusBasis],
          ["Uncertainty", d.uncertainty],
          ["Next action", d.nextAction],
          [
            "Limit",
            "Manually entered statuses do not verify product use or payment. Use non-identifying aliases.",
          ],
        ]),
      );
      break;
    case "survey":
      sections.push(
        s("intro", "Prepare a feedback survey", [
          ["Purpose", d.purpose],
          ["Audience", d.audience],
          ["Introduction", d.introduction],
          ["Permission reminder", d.permissionReminder],
          ["Delivery", d.delivery],
          ["Collection", d.collection],
        ]),
      );
      d.questions.forEach((q, i) =>
        sections.push(
          s(`question.${i}`, `Survey question ${i + 1} - draft`, [
            ["Question reference", q.id],
            ["Format", q.format],
            ["Prompt", q.prompt],
            ["Purpose", q.purpose],
            ...(q.format === "single_choice"
              ? ([["Options", q.options.join("\n")]] as Array<[string, string]>)
              : q.format === "scale"
                ? ([
                    ["Minimum", q.minimum],
                    ["Maximum", q.maximum],
                    ["Low label", q.lowLabel],
                    ["High label", q.highLabel],
                  ] as Array<[string, string | number]>)
                : []),
          ]),
        ),
      );
      break;
    case "referral":
      sections.push(
        s("recipient", "Who might make a useful introduction?", [
          ["Recipient alias", d.recipientAlias],
          ["Recipient role", d.recipientRole],
          ["Relevant-person criteria", d.relevantPersonCriteria],
          ["Builder disclosure", d.builderDisclosure],
          ["Context", d.context],
        ]),
        s("draft", "Unsent referral request", [
          ["Specific ask", d.specificAsk],
          ["Draft body", d.body],
          ["Respectful exit", d.respectfulExit],
          ["Delivery", d.delivery],
          [
            "Limit",
            "Nothing was sent by this app. A referral request is not an observed introduction or demand.",
          ],
        ]),
      );
      break;
    case "onboarding":
      sections.push(
        s("goal", "Plan first-use learning", [
          ["Audience", d.audience],
          ["User goal", d.userGoal],
          ["First action", d.firstAction],
          ["Success observation plan", d.successObservationPlan],
          ["Walkthrough prompt", d.walkthroughPrompt],
          ["Anticipated hesitation", d.anticipatedHesitation],
          ["Delivery", d.delivery],
          ["Collection", d.collection],
        ]),
      );
      d.questions.forEach((q, i) =>
        sections.push(
          s(`question.${i}`, `Onboarding question ${i + 1} - draft`, [
            ["Question reference", q.id],
            ["When", q.when],
            ["Prompt", q.prompt],
            ["Purpose", q.purpose],
          ]),
        ),
      );
      break;
  }
  const refs = guestGrowthReferences(d);
  sections.push(
    s("references", "Exact saved references - no automatic attachment", [
      [
        "References",
        refs
          .map((r, i) => `${i + 1}. ${r.kind} / ${r.artifactId} / retained revision ${r.revision}`)
          .join("\n"),
      ],
      [
        "Limit",
        "Only reference metadata is printed. Linked bodies, raw interviews and cross-studio context are not loaded or copied; this file does not establish authorized provenance.",
      ],
    ]),
  );
  const offer = activity(key, d.title || GUEST_GROWTH_TITLES[d.kind], sections, {
    kind: GUEST_GROWTH_TITLES[d.kind],
    updatedAt: dirty ? null : (record?.savedAt ?? null),
    fictional: scope.fictional,
    status: dirty
      ? "draft"
      : d.kind === "learning" && d.reviewState === "reviewed"
        ? "reviewed"
        : "draft",
  });
  return [
    {
      ...offer,
      activity: {
        ...offer.activity,
        sourceScope:
          record?.audience === "team_shared" ? "guest_team_shared" : "guest_principal_private",
      },
    },
  ];
}
export function guestGrowthPortfolio(
  sources: readonly GuestGrowthPdfSource[],
  scope: GuestGrowthPdfScope,
  title = "Selected growth activity portfolio",
  capturedAt = new Date().toISOString(),
): ActivityExportV1 {
  if (sources.length < 1 || sources.length > 50)
    throw Error("Select between one and 50 explicit growth sources.");
  const offers = sources.flatMap((s) => guestGrowthActivities(s, scope));
  return activityExportSchema.parse({
    schemaVersion: 1,
    title,
    capturedAt,
    activities: offers.map((o) => o.activity),
  });
}
export function guestGrowthExportAudiences(
  sources: readonly GuestGrowthPdfSource[],
): readonly ("owner" | "team")[] {
  return sources.length > 0 &&
    sources.every((s) => s.state === "saved" && s.record.audience === "team_shared")
    ? ["owner", "team"]
    : ["owner"];
}
export function growthDocumentForPdf(source: GuestGrowthPdfSource): GuestGrowthDocument {
  return source.state === "draft"
    ? source.document
    : (source.localDocument ?? source.record.document);
}
