import {
  guestLearningDocumentSchema,
  guestSubmissionViewSchema,
  type GuestLearningDocument,
  type GuestSubmissionView,
} from "@/lib/guest-activities/contracts";
import { discoveryActivities } from "./discovery-adapters";
import { activity, section, type ActivityOffer, type SaveState } from "./adapters";
export function guestLearningActivities(
  document: GuestLearningDocument,
  state: SaveState,
  audience: "principal_private" | "team_shared",
): ActivityOffer[] {
  const doc = guestLearningDocumentSchema.parse(document);
  if (
    audience === "team_shared" &&
    (doc.interviews.length || doc.discovery.results.some((r) => r.interviewId || r.quote))
  )
    throw new Error(
      "Raw interviews and participant quotes cannot be exported as team-shared work.",
    );
  const offers = discoveryActivities(doc.discovery, state);
  offers.push(
    activity(
      "guest.permissions",
      "Activity processing choices",
      [
        section("guest.permissions.state", "Reported choices and audience", [
          [
            "Activity audience",
            audience === "principal_private" ? "Principal-private" : "Current and future teammates",
          ],
          ["AI processing choice", doc.permissions.ai],
          ["Sharing choice", doc.permissions.sharing],
          ["Permission revision", doc.permissions.revision],
          [
            "Limits",
            "Owner-reported choices are not verification of consent or access grants. Class AI is off. Downloading does not submit this work.",
          ],
        ]),
      ],
      { kind: "Guest-reported choices", updatedAt: state.dirty ? null : state.savedAt },
    ),
  );
  for (const [index, interview] of doc.interviews.entries()) {
    const script = doc.discovery.scripts.findIndex((s) => s.id === interview.scriptId);
    offers.push(
      activity(
        `guest.interview.${index}`,
        `Interview ${index + 1} - ${interview.completed ? "completed report" : "private draft"}`,
        [
          section(`guest.interview.${index}.state`, "Exact captured script and reported choices", [
            ["Alias / role", interview.alias],
            ["Captured", interview.capturedAt],
            ["Script version", script + 1],
            ["Completed report", interview.completed],
            ["Note-taking choice", interview.choices.note],
            ["AI processing choice", interview.choices.ai],
            ["Sharing choice", interview.choices.sharing],
            ["Permission revision", interview.choices.revision],
            [
              "Save state",
              state.dirty
                ? "Includes unsaved edits"
                : `Saved revision ${state.revision ?? "unknown"}`,
            ],
            [
              "Limits",
              interview.completed
                ? "Student-reported completion, not independent verification that the conversation happened."
                : "Incomplete private notes. Not a completed interview, customer evidence count or submitted copy.",
            ],
          ]),
          ...interview.answers.map((a, j) =>
            section(`guest.interview.${index}.answer.${j}`, `Question ${j + 1}`, [
              ["Exact question", a.q],
              ["Observation / notes", a.note],
              ["Reported quote - verify exact words", a.quote],
            ]),
          ),
        ],
        { kind: "Guest interview report", updatedAt: state.dirty ? null : state.savedAt },
      ),
    );
  }
  return offers.map((o) => ({
    ...o,
    activity: {
      ...o.activity,
      fictional: state.fictional ?? false,
      sourceScope:
        audience === "principal_private" ? "guest_principal_private" : "guest_team_shared",
    },
  }));
}
export function guestSubmissionActivities(
  value: GuestSubmissionView,
  mode: "author" | "team" | "teacher" = "team",
): ActivityOffer[] {
  const s = guestSubmissionViewSchema.parse(value),
    key = "guest.reviewed-copy";
  if (mode !== "author" && (s.grantState !== "active" || s.audience !== mode))
    throw new Error(
      "This reviewed copy is withdrawn or unavailable for that audience. Open an active authorized copy to export.",
    );
  return [
    {
      activity: {
        ...activity(
          key,
          s.title || "Reviewed classroom copy",
          [
            section(`${key}.state`, "Reviewed copy and limits", [
              ["Version", s.version],
              ["Submitted", s.submittedAt],
              ["Alias", s.authorLabel],
              ["Original reviewed audience", s.audience],
              ["Current access state", s.grantState],
              ["Current access revision", s.grantRevision],
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
                  : "Active at the last authorized check. Earlier downloads cannot be recalled after access ends.",
              ],
              [
                "Limits",
                "Only these selected excerpts and reflections were intentionally submitted. This is not access to raw private activity work. Permission can end; downloaded copies cannot be recalled.",
              ],
            ]),
            ...s.payload.excerpts.map((e, i) =>
              section(`${key}.excerpt.${i}`, e.label, [
                ["Selected and reviewed excerpt", e.text],
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
            kind: "Reviewed classroom snapshot",
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
