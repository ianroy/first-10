import type { PublicContextList } from "@/lib/context/contracts";
import { activity, section, isFictionalExportProject, type ActivityOffer } from "./adapters";

/** Public reference material stays separate from interviews and model-generated advice. */
export function publicContextActivities(
  project: { id: string; user_id: string; checklist?: unknown },
  context: PublicContextList,
  draft?: { previewId: string; label: string; excerpt: string; read: boolean; permitted: boolean },
): ActivityOffer[] {
  if (!context.ok) throw new Error("Public source records are unavailable");
  if ([...context.previews, ...context.reviewed].some((row) => row.projectId !== project.id))
    throw new Error("Public source belongs to another project");
  const options = { fictional: isFictionalExportProject(project), kind: "Public reference review" };
  const textSections = (key: string, text: string) => {
    // Preserve every character. Prefer word boundaries between presentation blocks.
    const points = Array.from(text),
      parts: string[] = [];
    for (let start = 0; start < points.length;) {
      let end = Math.min(start + 10000, points.length);
      if (end < points.length) {
        for (let i = end - 1; i > start + 5000; i--) {
          if (/\s/u.test(points[i]!)) {
            end = i + 1;
            break;
          }
        }
      }
      parts.push(points.slice(start, end).join(""));
      start = end;
    }
    return parts.map((part, i) =>
      section(`${key}.text${i}`, `Source text${i ? ` (continued ${i + 1})` : ""}`, [
        ["Text", part],
      ]),
    );
  };
  const metadata = (
    key: string,
    source: {
      url: string;
      title: string;
      format: string;
      contentHash: string;
      previewHash: string;
      bytes: number;
      commitSha: string | null;
      path: string | null;
      blobSha: string | null;
    },
  ) =>
    section(`${key}.source`, "Source and limits", [
      ["Title", source.title],
      ["Public URL", source.url],
      ["Capture format", source.format],
      ["Retrieved response bytes", source.bytes],
      ["Response content SHA-256", source.contentHash],
      ["Preview text SHA-256", source.previewHash],
      ["Git commit", source.commitSha],
      ["Selected repository file", source.path],
      ["Git blob", source.blobSha],
      [
        "Limits",
        "Public product/reference text, not customer evidence. Static HTML extraction is not a rendered-page verification. No repository code was executed. Source claims and authenticity are unverified.",
      ],
    ]);
  const reviewPreview = draft ? context.previews.find((row) => row.id === draft.previewId) : null;
  if (draft && !reviewPreview) throw new Error("Review draft has no authorized preview");
  return [
    ...(draft && reviewPreview
      ? [
          activity(
            `public-review-draft.${reviewPreview.id}`,
            "Source review — current unsaved selection",
            [
              section(`public-review-draft.${reviewPreview.id}.state`, "Unsaved review draft", [
                ["Current label", draft.label],
                ["Read confirmation (owner-reported)", draft.read],
                ["Storage permission confirmation (owner-reported)", draft.permitted],
                ["Source preview hash", reviewPreview.source.previewHash],
                [
                  "Limits",
                  "Exporting does not save or attest this selection. Edited text has not been checked against the retrieved preview. AI and sharing remain unauthorized.",
                ],
              ]),
              ...textSections(`public-review-draft.${reviewPreview.id}`, draft.excerpt),
            ],
            { ...options, updatedAt: null },
          ),
        ]
      : []),
    ...context.previews.map((preview) => {
      const key = `public-preview.${preview.id}`;
      return activity(
        key,
        `Unreviewed source — ${preview.source.title.slice(0, 150)}`,
        [
          section(`${key}.state`, "Retrieved, not yet reviewed", [
            ["Retrieved at", preview.retrievedAt],
            ["Preview access expires", preview.expiresAt],
            ["Preview storage permission", "Explicitly requested by the owner"],
            ["Review state", "Unreviewed; no approved excerpt"],
            [
              "AI and sharing",
              "Not authorized by retrieval. No provider inclusion is connected here.",
            ],
            [
              "Copy limits",
              "This owner copy preserves the preview captured at export time. Access expiry is not a claim of deletion; downloaded copies cannot be recalled.",
            ],
          ]),
          metadata(key, preview.source),
          ...textSections(key, preview.source.text),
        ],
        { ...options, updatedAt: preview.retrievedAt },
      );
    }),
    ...context.reviewed.map((reviewed) => {
      const key = `public-review.${reviewed.id}`;
      if (reviewed.status === "withdrawn")
        return activity(
          key,
          "Withdrawn public-source review",
          [
            section(`${key}.state`, "Withdrawal receipt", [
              ["Reviewed at", reviewed.reviewedAt],
              ["Current revision", reviewed.revision],
              ["Current state", "Withdrawn; source text and metadata are omitted"],
              [
                "Limits",
                "Withdrawal excludes current use; it cannot recall earlier downloaded or manually shared copies. This receipt does not claim physical deletion.",
              ],
            ]),
          ],
          { ...options, status: "reviewed", updatedAt: reviewed.reviewedAt },
        );
      return activity(
        key,
        `Reviewed reference — ${reviewed.label.slice(0, 150)}`,
        [
          section(`${key}.state`, "Owner-reviewed excerpt", [
            ["Reviewed at", reviewed.reviewedAt],
            ["Current revision", reviewed.revision],
            [
              "Storage permission",
              "Owner reports owning this text or having permission to retain it",
            ],
            ["Excerpt SHA-256", reviewed.excerptHash],
            ["External AI permission", reviewed.aiPermission],
            ["Sharing permission", reviewed.sharingPermission],
            [
              "Limits",
              "An exact selected excerpt was explicitly reviewed. Review does not verify source claims or make this interview evidence. No provider adapter is connected in this slice.",
            ],
          ]),
          metadata(key, reviewed.source),
          ...textSections(key, reviewed.excerpt),
        ],
        { ...options, status: "reviewed", updatedAt: reviewed.reviewedAt },
      );
    }),
  ];
}
