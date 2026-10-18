import { activity, section } from "./adapters";
import type { ActivityExportV1 } from "./activity";
import {
  submissionViewSchema,
  submissionPreviewSchema,
  type SubmissionView,
} from "@/lib/submissions/contracts";
import type { z } from "zod";
type Preview = z.infer<typeof submissionPreviewSchema>;
function payloadSections(payload: SubmissionView["payload"]) {
  return [
    ...payload.excerpts.map((excerpt, index) =>
      section(`submission.excerpt${index + 1}`, excerpt.label, [
        ["Selected excerpt", excerpt.text],
        ["Source category", excerpt.sourceKind],
        ["Evidence limit", excerpt.evidenceLabel],
      ]),
    ),
    section("submission.reflection", "Student reasoning and next step", [
      ["Interpretation", payload.interpretation],
      ["Uncertainty / counterevidence", payload.uncertainty],
      ["Decision", payload.decision],
      ["Next action", payload.nextAction],
    ]),
  ];
}
/** Deliberately omit all source, actor, project, class, assignment, thread and snapshot IDs. */
export function submittedSnapshotDocument(
  value: SubmissionView,
  mode: "author" | "teacher",
): ActivityExportV1 {
  const view = submissionViewSchema.parse(value);
  if (mode === "teacher" && (view.audience !== "teacher" || view.grantState !== "active"))
    throw new Error("This submitted copy is unavailable.");
  return {
    schemaVersion: 1,
    title: `Reviewed submission — ${view.payload.title}`,
    capturedAt: new Date().toISOString(),
    activities: [
      activity(
        "submission.saved",
        view.payload.title,
        [
          section("submission.state", "Immutable submitted version", [
            [
              "Copy audience",
              mode === "teacher" ? "Currently authorized class teacher" : "Author's private copy",
            ],
            ["Author alias", view.authorLabel],
            ["Version", view.version],
            ["Submitted at", view.submittedAt],
            ["Current disclosure state", view.grantState],
            [
              "Limits",
              "Only intentionally selected and reviewed text appears. Owner-reported observations and interpretations are not independently verified. Private source records and later edits are excluded. Withdrawal blocks future app access, but cannot recall downloaded copies.",
            ],
          ]),
          ...payloadSections(view.payload),
        ],
        {
          sourceScope: "submitted_snapshot",
          status: "submitted",
          kind: "Reviewed classroom submission",
          updatedAt: view.submittedAt,
          fictional: /\bfictional\b/i.test(view.title),
        },
      ).activity,
    ],
  };
}
export function submissionPreviewDocument(value: Preview): ActivityExportV1 {
  const preview = submissionPreviewSchema.parse(value);
  return {
    schemaVersion: 1,
    title: `Unsubmitted review — ${preview.payload.title}`,
    capturedAt: new Date().toISOString(),
    activities: [
      activity(
        "submission.preview",
        preview.payload.title,
        [
          section("submission.state", "Private unsubmitted preview", [
            ["Status", "Draft only — not submitted to teachers"],
            ["Preview expires", preview.expiresAt],
            [
              "Proposed audience",
              "Active teachers of the chosen class, only after separate confirmation",
            ],
            [
              "Limits",
              "Downloading this private draft does not publish work or grant access. Only this selected, redacted payload appears. Original private sources remain separate; owner-reported material is not independently verified.",
            ],
          ]),
          ...payloadSections(preview.payload),
        ],
        {
          sourceScope: "owner_private",
          status: "draft",
          kind: "Classroom submission preview",
          fictional: /\bfictional\b/i.test(preview.payload.title),
        },
      ).activity,
    ],
  };
}
