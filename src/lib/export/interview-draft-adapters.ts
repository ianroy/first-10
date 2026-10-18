import type { InterviewDraftRecord } from "@/lib/interview-drafts";
import {
  activity,
  section,
  sourceState,
  isFictionalExportProject,
  type ActivityOffer,
} from "./adapters";
export function interviewDraftActivities(
  project: { id: string; user_id: string; checklist?: unknown },
  drafts: InterviewDraftRecord[],
  dirty = false,
): ActivityOffer[] {
  if (drafts.some((d) => d.projectId !== project.id))
    throw Error("Interview draft belongs to another project");
  return drafts.flatMap((d, index) => {
    if (d.status !== "active" || !d.document) return [];
    const key = `interview-draft.${d.id}`,
      doc = d.document;
    return [
      {
        ...activity(
          key,
          `Interview draft ${index + 1} - ${dirty ? "current unsaved edits" : "saved incomplete notes"}`,
          [
            sourceState(key, { savedAt: d.savedAt, revision: d.revision, dirty }),
            section(`${key}.scope`, "Private incomplete work", [
              [
                "Question snapshot",
                "Captured at draft creation; preparation changes do not replace it.",
              ],
              ["Captured", d.createdAt],
              [
                "Contact reference",
                d.contactId ? "Saved reference; identity omitted" : "No person linked",
              ],
              ["Note permission (owner-reported)", doc.choices.noteStatus],
              ["AI choice (owner-reported)", doc.choices.aiStatus],
              ["Sharing choice (owner-reported)", doc.choices.sharingStatus],
              [
                "Limits",
                "A draft is not a completed interview. It is excluded from completed counts, AI evidence and shared projections. Permission choices are reports, not independently verified consent or a sharing grant.",
              ],
            ]),
            ...doc.answers.map((a, i) =>
              section(`${key}.q${i}`, `Question ${i + 1}`, [
                ["Exact saved question", a.q],
                ["Observation / notes", a.note],
                ["Reported exact words", a.quote],
              ]),
            ),
            section(`${key}.tags`, "Reported themes", [
              ["Tags", doc.tags.join(", ")],
              ["Limits", "Willingness statements are not observed use or payment."],
            ]),
          ],
          {
            kind: "Private interview draft",
            fictional: isFictionalExportProject(project),
            updatedAt: dirty ? null : d.savedAt,
          },
        ),
        originId: d.originId,
      },
    ];
  });
}
