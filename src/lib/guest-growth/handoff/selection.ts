import {
  guestGrowthSelectionSchema,
  guestGrowthSelectionError,
  type GuestGrowthDocument,
} from "../contracts";
import { canonicalGrowthJson } from "../transport";
import type { z } from "zod";
type Selection = z.infer<typeof guestGrowthSelectionSchema>;
/** Pure display/validation mirror only; the DB resolver independently loads real saved content. */
export function growthSelectionText(document: GuestGrowthDocument, value: Selection): string {
  const selection = guestGrowthSelectionSchema.parse(value);
  const error = guestGrowthSelectionError(document, [selection]);
  if (error) throw Error(error);
  let source: unknown;
  if (
    (document.kind === "survey" || document.kind === "onboarding") &&
    "questionId" in selection &&
    selection.questionId
  ) {
    const q = document.questions.find((q) => q.id === selection.questionId)!;
    const { id: _privateId, ...fields } = q;
    source = fields;
  } else {
    const fields: Record<string, Record<string, readonly string[]>> = {
      learning: {
        observations: ["observations"],
        patterns: ["patterns"],
        objections: ["objections"],
        best_fit: ["bestFit"],
        interpretation: ["interpretation"],
        counterevidence: ["counterevidence"],
        uncertainty: ["uncertainty"],
        proposed_changes: ["proposedChanges"],
        next_test: ["nextTest"],
        review: ["form", "reviewState", "reviewedAt"],
      },
      experiment: {
        plan: ["hypothesis", "change", "audience", "procedure"],
        criterion: ["criterion"],
        reported_result: ["reportedResult"],
        reported_state: ["state", "reportedStartOn"],
      },
      pipeline_contact: {
        alias: ["alias", "relationship"],
        fit: ["relevantExperience", "fitReason", "source", "uncertainty"],
        reported_status: ["status", "reportedOn", "statusBasis"],
        next_action: ["nextAction"],
      },
      survey: {
        introduction: [
          "purpose",
          "audience",
          "introduction",
          "permissionReminder",
          "delivery",
          "collection",
        ],
      },
      referral: {
        recipient_role: ["recipientAlias", "recipientRole", "relevantPersonCriteria"],
        draft: ["builderDisclosure", "context", "body", "delivery"],
        specific_ask: ["specificAsk"],
        safe_exit: ["respectfulExit"],
      },
      onboarding: {
        goal: ["audience", "userGoal"],
        first_action: ["firstAction", "successObservationPlan"],
        walkthrough: ["walkthroughPrompt", "anticipatedHesitation", "delivery", "collection"],
      },
    };
    const keys = fields[document.kind]?.[selection.section];
    if (!keys) throw Error("Unavailable exact section");
    source = Object.fromEntries(
      keys.map((k) => [k, (document as unknown as Record<string, unknown>)[k]]),
    );
  }
  const full = canonicalGrowthJson(source),
    text = selection.excerpt ?? full;
  if (!full.includes(text) || Array.from(text).length < 1 || Array.from(text).length > 6000)
    throw Error("Use an exact bounded excerpt from the selected section");
  return text;
}
