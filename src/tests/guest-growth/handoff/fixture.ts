import { records, id, view as base } from "../fixture";
import { GUEST_GROWTH_EVIDENCE_LABEL } from "@/lib/guest-growth/contracts";
import type { GrowthSubmissionView } from "@/lib/guest-growth/handoff/contracts";
export { id };
export const record = records()[0]!,
  csrf = "a".repeat(64),
  time = "2026-10-18T20:00:00Z";
export const view = {
  ...base,
  assignments: [{ id: id(906), title: "Growth check-in", state: "published" }],
};
export const payload = {
  schemaVersion: 1 as const,
  resolverVersion: "guest-growth-v1" as const,
  sourceKind: "guest_growth" as const,
  title: "Fictional Élodie review",
  interpretation: "An authored interpretation",
  uncertainty: "No measured demand",
  decision: "Revise",
  nextAction: "One permitted test",
  excerpts: [
    {
      key: "excerpt.1",
      label: "learning - observations",
      text: JSON.stringify({ observations: "Selected observation only; END_OF_SELECTED_COPY" }),
      evidenceLabel: GUEST_GROWTH_EVIDENCE_LABEL,
    },
  ],
};
export const preview = {
  id: id(907),
  hash: "b".repeat(64),
  threadId: id(908),
  expiresAt: "2099-11-18T20:10:00Z",
  audience: "teacher" as const,
  payload,
};
export const copy: GrowthSubmissionView = {
  id: id(909),
  threadId: id(908),
  classId: view.classId,
  assignmentId: id(906),
  sourceType: "guest_growth",
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
export const roster = {
  resolverVersion: "guest-growth-v1" as const,
  artifactId: record.id,
  revision: record.revision,
  publisher: view.principalId,
  threads: [{ assignmentId: id(906), threadId: id(908) }],
  sources: [
    {
      artifactId: record.id,
      revision: record.revision,
      kind: record.kind,
      audience: record.audience,
      authorPrincipalId: record.authorPrincipalId,
      sourcePrincipalGeneration: 1,
      choice: "granted" as const,
      choiceRevision: 1,
      referenceCount: 0,
      referenceDigest: "a".repeat(64),
    },
  ],
};
