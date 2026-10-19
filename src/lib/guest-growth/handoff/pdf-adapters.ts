import { growthExcerptDisplay } from "@/lib/guest-growth/handoff/presentation";
import {
  growthPreviewSchema,
  growthSubmissionViewSchema,
  type GrowthSubmissionView,
} from "./contracts";
import { activity, section, type ActivityOffer } from "@/lib/export/adapters";
export function growthSubmissionActivities(
  value: GrowthSubmissionView,
  mode: "author" | "teacher" = "teacher",
): ActivityOffer[] {
  const s = growthSubmissionViewSchema.parse(value),
    key = "guest.growth-reviewed-copy";
  if (
    mode !== "author" &&
    (s.grantState !== "active" || !s.recipientEligible || s.audience !== mode)
  )
    throw new Error(
      "This reviewed copy is withdrawn or unavailable for that audience. Open an active authorized copy to export.",
    );
  return [
    {
      activity: {
        ...activity(
          key,
          s.title || "Reviewed Growth Lab copy",
          [
            section(`${key}.state`, "Reviewed copy and limits", [
              ["Version", s.version],
              ["Submitted", s.submittedAt],
              ["Alias", s.authorLabel],
              ["Original reviewed audience", s.audience],
              ["Current access state", s.grantState],
              ["Current access revision", s.grantRevision],
              ["Recipient currently eligible", s.recipientEligible],
              [
                "This PDF",
                mode === "author"
                  ? "Author's private copy of their own reviewed version"
                  : `${mode} authorized copy`,
              ],
              [
                "Withdrawal",
                s.grantState === "withdrawn"
                  ? "Audience access was withdrawn. This author-only export does not restore that access; earlier downloads cannot be recalled."
                  : s.recipientEligible
                    ? "Active at the last authorized check. Earlier downloads cannot be recalled after access ends."
                    : "The recorded grant is active but current teacher eligibility ended. This private author copy does not restore access; earlier downloads cannot be recalled.",
              ],
              [
                "Limits",
                "Only selected growth excerpts and reflections were deliberately submitted. Student-authored / student-reported; not verified customer evidence. No raw-artifact teacher access. Class expiry ends private author access. Downloaded copies cannot be recalled.",
              ],
            ]),
            ...s.payload.excerpts.map((e, i) =>
              section(`${key}.excerpt.${i}`, e.label, [
                ["Selected and reviewed excerpt", growthExcerptDisplay(e)],
                ["Evidence label", e.evidenceLabel],
              ]),
            ),
            section(`${key}.reflection`, "Student reflection", [
              ["Interpretation", s.payload.interpretation],
              ["Uncertainty", s.payload.uncertainty],
              ["Decision", s.payload.decision],
              ["Next action", s.payload.nextAction],
            ]),
          ],
          {
            kind: "Reviewed Growth Lab snapshot",
            updatedAt: s.submittedAt,
            // A conservative presentation marker only; never an access grant.
            fictional: /\bfictional\b/i.test([s.title, s.authorLabel, s.payload.title].join(" ")),
          },
        ).activity,
        sourceScope: mode === "author" ? "guest_principal_private" : "submitted_snapshot",
        status: "submitted",
      },
    },
  ];
}

/** Private reviewed preview; never a submitted version or teacher grant. */
export function growthPreviewActivities(
  value: import("zod").z.infer<typeof import("./contracts").growthPreviewSchema>,
): ActivityOffer[] {
  const p = growthPreviewSchema.parse(value),
    key = "guest.growth-private-preview";
  return [
    {
      activity: {
        ...activity(
          key,
          p.payload.title,
          [
            section(`${key}.state`, "Private preview, not submitted", [
              ["Audience if confirmed", "Current class teachers"],
              ["Preview expires", p.expiresAt],
              [
                "Limits",
                "This PDF does not submit or grant access. Student-authored / student-reported; not verified customer evidence. Previously downloaded copies cannot be recalled.",
              ],
            ]),
            ...p.payload.excerpts.map((e, i) =>
              section(`${key}.excerpt.${i}`, e.label, [
                ["Exact reviewed excerpt", growthExcerptDisplay(e)],
                ["Evidence label", e.evidenceLabel],
              ]),
            ),
            section(`${key}.reflection`, "Student reflection", [
              ["Interpretation", p.payload.interpretation],
              ["Uncertainty", p.payload.uncertainty],
              ["Decision", p.payload.decision],
              ["Next action", p.payload.nextAction],
            ]),
          ],
          {
            kind: "Private Growth Lab preview",
            updatedAt: null,
            fictional: /\bfictional\b/i.test(p.payload.title),
          },
        ).activity,
        sourceScope: "guest_principal_private",
        status: "draft",
      },
    },
  ];
}
