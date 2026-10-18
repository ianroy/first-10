import type { ActivityExportV1 } from "@/lib/export/activity";

export function exportFixture(): ActivityExportV1 {
  return {
    schemaVersion: 1,
    title: "Evidence, decisions and next steps",
    teamLabel: "Élodie / Nguyễn / Αλέξανδρος / Ольга",
    capturedAt: "2026-10-18T15:00:00.000Z",
    activities: [
      {
        key: "interview",
        title: "Listen before deciding",
        kind: "Interview reflection",
        sourceScope: "fictional",
        status: "draft",
        fictional: true,
        updatedAt: null,
        sections: [
          {
            key: "observations",
            title: "What we heard",
            blocks: [
              {
                key: "note",
                type: "text",
                text: "Élodie described a missed meeting. Nguyễn found a workaround. Αλέξανδρος disagreed; Ольга asked what would change our decision.\nThese are authored fictional examples, not interviews or enrolled students.",
              },
              {
                key: "counts",
                type: "fields",
                fields: [
                  { label: "Attendance baseline", value: null },
                  { label: "Confirmed trials", value: 0 },
                  { label: "Next observation", value: "" },
                  { label: "Reviewed by a peer", value: false },
                ],
              },
              {
                key: "evidence",
                type: "table",
                columns: ["Observation", "Interpretation", "Next test"],
                rows: [
                  [
                    "Two reported missed meetings",
                    "Possibly a coordination problem",
                    "Test a confirmation message",
                  ],
                  [
                    "One person already has a routine",
                    "The problem is not universal",
                    "Keep this counterexample visible",
                  ],
                ],
              },
            ],
          },
        ],
      },
      {
        key: "marketing",
        title: "$0 Marketing Lab",
        kind: "Seven-day plan",
        sourceScope: "submitted_snapshot",
        status: "submitted",
        fictional: true,
        updatedAt: "2026-10-17T16:30:00Z",
        sections: [
          {
            key: "plan",
            title: "A small, observable test",
            blocks: [
              {
                key: "tasks",
                type: "table",
                columns: ["Day", "Action", "Measure"],
                rows: [
                  [1, "Ask a club organizer for permission", null],
                  [3, "Invite relevant students", 0],
                  [7, "Reflect before repeating", "Not measured yet"],
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
