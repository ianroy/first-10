import { z } from "zod";
import {
  guestGrowthChoiceSchema,
  guestGrowthPreviewSchema,
  guestGrowthSubmissionHeaderSchema,
  guestGrowthSubmissionViewSchema,
  guestGrowthSelectionSchema,
  guestGrowthKindSchema,
  guestGrowthRecordSchema,
} from "../contracts";
import { secretSchema } from "@/lib/guest-spaces/contracts";
export { guestActivityResult } from "@/lib/guest-activities/contracts";
export {
  guestGrowthChoiceSchema as growthChoiceSchema,
  guestGrowthPreviewSchema as growthPreviewSchema,
  guestGrowthSubmissionHeaderSchema as growthSubmissionHeaderSchema,
  guestGrowthSubmissionViewSchema as growthSubmissionViewSchema,
  readGuestGrowthChoiceSchema as readGrowthChoiceSchema,
  saveGuestGrowthChoiceSchema as saveGrowthChoiceSchema,
  previewGuestGrowthSchema as previewGrowthSchema,
  confirmGuestGrowthSchema as confirmGrowthSchema,
  readGuestGrowthSubmissionSchema as readGrowthSubmissionSchema,
  listGuestGrowthSubmissionsSchema as listGrowthSubmissionsSchema,
  withdrawGuestGrowthSubmissionSchema as withdrawGrowthSchema,
} from "../contracts";
export type GrowthSubmissionView = z.infer<typeof guestGrowthSubmissionViewSchema>;
export const growthSubmissionPageSchema = z
  .object({
    items: z.array(guestGrowthSubmissionHeaderSchema).max(50),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sourceRosterSchema = z
  .object({
    resolverVersion: z.literal("guest-growth-v1"),
    artifactId: z.string().uuid(),
    revision: z.number().int().min(1).max(40),
    publisher: z.string().uuid(),
    threads: z
      .array(z.object({ assignmentId: z.string().uuid(), threadId: z.string().uuid() }).strict())
      .max(50),
    sources: z
      .array(
        z
          .object({
            artifactId: z.string().uuid(),
            revision: z.number().int().min(1).max(40),
            kind: guestGrowthKindSchema,
            audience: z.enum(["principal_private", "team_shared"]),
            authorPrincipalId: z.string().uuid(),
            sourcePrincipalGeneration: counter.min(1),
            choice: z.enum(["unknown", "granted", "withdrawn"]),
            choiceRevision: counter,
            referenceCount: z.number().int().min(0).max(4),
            referenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
  .superRefine((v, ctx) => {
    const root = v.sources.find((s) => s.artifactId === v.artifactId && s.revision === v.revision);
    if (
      !root ||
      new Set(v.sources.map((s) => `${s.artifactId}:${s.revision}`)).size !== v.sources.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Use unique exact sources including the selected retained root.",
      });
  });
export const readSourcesSchema = z
  .object({
    csrf: secretSchema,
    artifactId: z.string().uuid(),
    revision: z.number().int().min(1).max(40),
  })
  .strict();
export const HANDOFF_LIMITS = {
  requestBytes: 65536,
  payloadBytes: 40000,
  publisherBytes: 2097152,
  classBytes: 16777216,
  receipts: 2000,
  audits: 5000,
} as const;
export function growthSelectionOptions(record: z.infer<typeof guestGrowthRecordSchema>) {
  const sections = {
    learning: [
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
    ],
    experiment: ["plan", "criterion", "reported_result", "reported_state"],
    pipeline_contact: ["alias", "fit", "reported_status", "next_action"],
    survey: ["introduction"],
    referral: ["recipient_role", "draft", "specific_ask", "safe_exit"],
    onboarding: ["goal", "first_action", "walkthrough"],
  } as const;
  const d = record.document;
  const out = sections[d.kind].map((section) => ({
    key: section as string,
    label: section.replaceAll("_", " "),
    selection: guestGrowthSelectionSchema.parse({ kind: d.kind, section }),
  }));
  if (d.kind === "survey" || d.kind === "onboarding")
    out.push(
      ...d.questions.map((q, i) => ({
        key: `question:${q.id}`,
        label: `Question ${i + 1}`,
        selection: guestGrowthSelectionSchema.parse({
          kind: d.kind,
          section: "question",
          questionId: q.id,
        }),
      })),
    );
  return out;
}
// Aliases stay closed to the original guest_growth-v1 contracts; no account/marketing IDs accepted.
export const handoffOutputSchemas = {
  choice: guestGrowthChoiceSchema,
  preview: guestGrowthPreviewSchema,
  header: guestGrowthSubmissionHeaderSchema,
  view: guestGrowthSubmissionViewSchema,
  page: growthSubmissionPageSchema,
  sources: sourceRosterSchema,
};
