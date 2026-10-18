import {
  createEmptyTeacherPlan,
  type TeacherPlanRecord,
  type SaveTeacherPlanInput,
} from "../../lib/teacher-plan";
let record: TeacherPlanRecord = {
  id: "f4000000-0000-4000-8000-000000000030",
  revision: 1,
  savedAt: "2026-10-18T12:00:00Z",
  document: {
    ...createEmptyTeacherPlan(),
    className: "Evidence to action: a $0 experiment",
    audience:
      "Educators practicing a student-first entrepreneurship lesson. No prior AI experience required.",
    plannedLearners: 45,
    scheduledOn: "2026-10-19",
  },
};
export async function loadTeacherPlan() {
  return { ok: true as const, plan: record };
}
export async function saveTeacherPlan({ data }: { data: SaveTeacherPlanInput }) {
  if (data.expectedRevision !== record.revision)
    return { ok: false as const, code: "CONFLICT" as const };
  record = {
    ...record,
    document: data.document,
    revision: record.revision + 1,
    savedAt: new Date().toISOString(),
  };
  return { ok: true as const, ...record };
}
