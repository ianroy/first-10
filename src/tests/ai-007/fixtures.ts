import { createHash } from "node:crypto";
import type { AISource, SourceEnvelope, OmissionCounts } from "@/lib/prompts/context-v2";
import { validateGroundedOutput } from "@/lib/prompts/grounding-v2";
import type { ExistingKind } from "@/lib/prompts/private-v1";
export const projectId = "fa170000-0000-4000-8000-000000000001";
export function source(type: AISource["type"], index: number, content: unknown): AISource {
  const recordId =
    type === "project" ? projectId : `fa170000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ content, linkedContact: null }))
    .digest("hex");
  const sourceId = `src_${createHash("sha256").update(`${projectId}:${type}:${recordId}:${contentHash}`).digest("hex")}`;
  return {
    type,
    recordId,
    sourceId,
    contentHash,
    consentRevision: 1,
    linkedContact: null,
    createdAt: "2026-10-18T00:00:00+00:00",
    content,
  } as AISource;
}
export function envelope(kind: ExistingKind = "synthesis"): SourceEnvelope {
  return {
    version: 2,
    projectId,
    project: source("project", 1, {
      name: "Permitted idea",
      description: "Approved description",
      audience: "Relevant people",
      problem: "Uncertain coordination",
    }),
    sources:
      kind === "questions"
        ? []
        : [
            source("interview", 2, {
              answers: [{ q: "Recent event?", note: "ALLOWED_NOTE", quote: "ALLOWED_QUOTE" }],
              tags: [],
            }),
          ],
    omissions: { permission: 1, oversized: 0, invalid: 0, candidateLimit: 0 },
  };
}
export const draftOutputs = {
  questions: { questions: ["Recent situation?"] },
  synthesis: { problems: [], objections: [], best_fit: [], quotes: [], changes: [] },
  stage2: { channels: [], drafts: [], survey: [] },
  stage3: { channels: [], referral_asks: [], onboarding_questions: [] },
};
export function wrapper(kind: ExistingKind, draft: unknown = draftOutputs[kind]) {
  const paths = (value: unknown, prefix = ""): string[] =>
    typeof value === "string"
      ? [prefix]
      : Array.isArray(value)
        ? value.flatMap((v, i) => paths(v, `${prefix}/${i}`))
        : value && typeof value === "object"
          ? Object.entries(value).flatMap(([k, v]) => paths(v, `${prefix}/${k}`))
          : [];
  return {
    draft,
    grounding: {
      observations: [],
      inferences: paths(draft).map((path) => ({ path, category: "proposal", sourceIds: [] })),
      missingEvidence: [
        { reason: "authenticity_unverified", message: "Owner-reported evidence is unverified." },
        { reason: "omitted_sources", message: "Some records were withheld or omitted." },
      ],
    },
  };
}
export function validated(kind: ExistingKind, draft: unknown = draftOutputs[kind]) {
  const e = envelope(kind);
  return validateGroundedOutput(kind, wrapper(kind, draft), [e.project, ...e.sources], {
    ...e.omissions,
    budget: 0,
  });
}
