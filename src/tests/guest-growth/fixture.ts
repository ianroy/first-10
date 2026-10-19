import type { z } from "zod";
import {
  createEmptyGuestGrowth,
  guestGrowthDocumentSchema,
  type GuestGrowthDocument,
  type guestGrowthRecordSchema,
} from "@/lib/guest-growth/contracts";
import type { GuestGrowthPdfScope } from "@/lib/guest-growth/pdf";
import type { GuestView } from "@/lib/guest-spaces/contracts";
export const id = (n: number) => `f2700000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
export const time = "2026-10-19T00:00:00Z",
  csrf = "a".repeat(64);
export const view: GuestView = {
  classId: id(1),
  className: "Fictional growth workshop",
  teamId: id(2),
  teamAlias: "Fictional Élodie team",
  principalId: id(3),
  principalAlias: "Fictional Élodie",
  mode: "class",
  instructions: "",
  accessExpiresAt: "2099-10-19T00:00:00Z",
  retentionDays: 30,
  aiEnabled: false,
  assignments: [],
};
export const scope: GuestGrowthPdfScope = {
  classId: view.classId,
  teamId: view.teamId,
  principalId: view.principalId,
  className: view.className,
  teamAlias: view.teamAlias,
  principalAlias: view.principalAlias,
  accessExpiresAt: view.accessExpiresAt,
  fictional: true,
};
export function documents(): GuestGrowthDocument[] {
  const learning = {
    ...createEmptyGuestGrowth("learning"),
    title: "Fictional Élodie synthesis",
    form: "synthesis" as const,
    stage: 2 as const,
    observations: "OBSERVATION_SUMMARY",
    interpretation: "LEARNING_INTERPRETATION",
    counterevidence: "COUNTEREVIDENCE",
    uncertainty: "LEARNING_UNCERTAINTY",
    patterns: [
      {
        observationSummary: "PATTERN_OBSERVATION",
        interpretation: "PATTERN_INTERPRETATION",
        limitations: "PATTERN_LIMITATIONS",
      },
    ],
    objections: ["OBJECTION_ONE"],
    bestFit: ["BEST_FIT_HYPOTHESIS"],
    proposedChanges: [
      { title: "CHANGE_TITLE", reason: "CHANGE_REASON", nextStep: "CHANGE_NEXT_STEP" },
    ],
    nextTest: "NEXT_FALSIFIABLE_TEST",
    reviewState: "reviewed" as const,
    reviewedAt: time,
  };
  const base = createEmptyGuestGrowth("experiment"),
    experiment = {
      ...base,
      title: "Fictional manual experiment",
      stage: 2 as const,
      learningRefs: [{ kind: "learning" as const, artifactId: id(101), revision: 2 }],
      hypothesis: "EXPERIMENT_HYPOTHESIS",
      change: "EXPERIMENT_CHANGE",
      audience: "EXPERIMENT_AUDIENCE",
      procedure: "EXPERIMENT_PROCEDURE",
      criterion: {
        ...base.criterion,
        measure: "CRITERION_MEASURE",
        baseline: null,
        target: 0,
        unit: "people" as const,
        repeatIf: "REPEAT_RULE",
        reviseIf: "REVISE_RULE",
        stopIf: "STOP_RULE",
        reviewOn: "2026-10-20",
      },
      state: "completed_reported" as const,
      reportedStartOn: "2026-10-18",
      reportedResult: {
        summary: "REPORTED_RESULT_SUMMARY",
        reportedOn: "2026-10-19",
        count: 0,
        limitations: "EXPERIMENT_LIMITATIONS",
        decision: "revise" as const,
        nextAction: "EXPERIMENT_NEXT_ACTION",
      },
    };
  const pipeline = {
    ...createEmptyGuestGrowth("pipeline_contact"),
    title: "Fictional alias contact",
    alias: "Club builder A",
    relationship: "classmate" as const,
    relevantExperience: "ALIAS_RELEVANT_EXPERIENCE",
    fitReason: "ALIAS_FIT_REASON",
    source: "ALIAS_SOURCE",
    status: "paying" as const,
    reportedOn: "2026-10-19",
    statusBasis: "REPORTED_PAYMENT_BASIS",
    uncertainty: "PIPELINE_UNCERTAINTY",
    nextAction: "PIPELINE_NEXT_ACTION",
  };
  const survey = {
    ...createEmptyGuestGrowth("survey"),
    title: "Fictional feedback survey",
    experimentRef: { kind: "experiment" as const, artifactId: id(102), revision: 2 },
    purpose: "SURVEY_PURPOSE",
    audience: "SURVEY_AUDIENCE",
    introduction: "SURVEY_INTRODUCTION",
    permissionReminder: "SURVEY_PERMISSION",
    questions: [
      {
        id: id(201),
        format: "open_text" as const,
        prompt: "OPEN_SURVEY_PROMPT",
        purpose: "OPEN_SURVEY_PURPOSE",
      },
      {
        id: id(202),
        format: "single_choice" as const,
        prompt: "CHOICE_SURVEY_PROMPT",
        purpose: "CHOICE_SURVEY_PURPOSE",
        options: ["OPTION_ONE", "OPTION_TWO"],
      },
      {
        id: id(203),
        format: "scale" as const,
        prompt: "SCALE_SURVEY_PROMPT",
        purpose: "SCALE_SURVEY_PURPOSE",
        minimum: 1 as const,
        maximum: 7 as const,
        lowLabel: "SCALE_LOW",
        highLabel: "SCALE_HIGH",
      },
    ],
  };
  const referral = {
    ...createEmptyGuestGrowth("referral"),
    title: "Fictional referral ask",
    contactRef: { kind: "pipeline_contact" as const, artifactId: id(103), revision: 2 },
    experimentRef: { kind: "experiment" as const, artifactId: id(102), revision: 2 },
    recipientAlias: "Organizer A",
    recipientRole: "REFERRAL_ROLE",
    relevantPersonCriteria: "REFERRAL_FIT_CRITERIA",
    builderDisclosure: "REFERRAL_BUILDER_DISCLOSURE",
    context: "REFERRAL_CONTEXT",
    specificAsk: "REFERRAL_SPECIFIC_ASK",
    body: "Authored referral draft. ".repeat(150) + " END_OF_REFERRAL_BODY",
    respectfulExit: "REFERRAL_RESPECTFUL_EXIT",
  };
  const onboarding = {
    ...createEmptyGuestGrowth("onboarding"),
    title: "Fictional onboarding plan",
    experimentRef: { kind: "experiment" as const, artifactId: id(102), revision: 2 },
    audience: "ONBOARDING_AUDIENCE",
    userGoal: "ONBOARDING_USER_GOAL",
    firstAction: "ONBOARDING_FIRST_ACTION",
    successObservationPlan: "ONBOARDING_OBSERVATION_PLAN",
    walkthroughPrompt: "ONBOARDING_WALKTHROUGH",
    anticipatedHesitation: "ONBOARDING_HESITATION",
    questions: [
      {
        id: id(204),
        prompt: "BEFORE_ONBOARDING_PROMPT",
        purpose: "BEFORE_ONBOARDING_PURPOSE",
        when: "before" as const,
      },
      {
        id: id(205),
        prompt: "DURING_ONBOARDING_PROMPT",
        purpose: "DURING_ONBOARDING_PURPOSE",
        when: "during" as const,
      },
      {
        id: id(206),
        prompt: "AFTER_ONBOARDING_PROMPT",
        purpose: "AFTER_ONBOARDING_PURPOSE",
        when: "after" as const,
      },
    ],
  };
  return [learning, experiment, pipeline, survey, referral, onboarding].map((d) =>
    guestGrowthDocumentSchema.parse(d),
  );
}
export type Saved = z.infer<typeof guestGrowthRecordSchema>;
export function records(shared = false): Saved[] {
  return documents().map((document, i) => ({
    id: id(101 + i),
    classId: view.classId,
    teamId: view.teamId,
    authorPrincipalId: view.principalId,
    audience: shared ? "team_shared" : "principal_private",
    kind: document.kind,
    revision: 2,
    savedAt: time,
    aiEnabled: false,
    document,
  }));
}
