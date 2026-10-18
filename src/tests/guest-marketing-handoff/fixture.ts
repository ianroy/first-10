import type { GuestView } from "@/lib/guest-spaces/contracts";
import type { GuestMarketingRecord } from "@/lib/guest-marketing/contracts";
import type { MarketingSubmissionView } from "@/lib/guest-marketing/handoff/contracts";
import { marketingFixture, fixtureId as id } from "../guest-marketing/fixture";
export { id };
export const csrf = "a".repeat(64),
  time = "2026-10-18T20:00:00Z";
export const view: GuestView = {
  classId: id(1),
  className: "Fictional marketing class",
  mode: "class",
  instructions: "",
  accessExpiresAt: "2099-11-18T20:00:00Z",
  retentionDays: 30,
  aiEnabled: false,
  teamId: id(2),
  teamAlias: "Fictional team",
  principalId: id(3),
  principalAlias: "Fictional Élodie",
  assignments: [
    {
      id: id(6),
      classId: id(1),
      revision: 1,
      updatedAt: time,
      title: "Marketing check-in",
      instructions: "",
      dueAt: null,
      state: "published",
    },
  ],
};
export const record: GuestMarketingRecord = {
  id: id(4),
  classId: view.classId,
  teamId: view.teamId,
  authorPrincipalId: view.principalId,
  audience: "principal_private",
  revision: 2,
  savedAt: time,
  aiEnabled: false,
  document: marketingFixture(),
};
export const payload = {
  schemaVersion: 1 as const,
  title: "Fictional Élodie review",
  interpretation: "An authored interpretation",
  uncertainty: "No measured demand",
  decision: "Revise",
  nextAction: "One permitted test",
  excerpts: [
    {
      key: "excerpt.1",
      label: "Marketing Lab - audience",
      text: "Selected audience only; END_OF_SELECTED_COPY",
      sourceKind: "guest_marketing" as const,
      evidenceLabel: "Student-authored / student-reported; not verified customer evidence" as const,
    },
  ],
};
export const preview = {
  id: id(7),
  hash: "b".repeat(64),
  threadId: id(8),
  expiresAt: "2099-11-18T20:10:00Z",
  audience: "teacher" as const,
  payload,
};
export const copy: MarketingSubmissionView = {
  id: id(9),
  threadId: id(8),
  classId: view.classId,
  assignmentId: id(6),
  sourceType: "guest_marketing",
  version: 1,
  audience: "teacher",
  authorLabel: "Fictional Élodie",
  submittedAt: time,
  grantState: "active",
  grantRevision: 1,
  recipientEligible: true,
  title: payload.title,
  payload,
};
