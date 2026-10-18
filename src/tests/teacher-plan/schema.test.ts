import { describe, expect, it } from "vitest";
import {
  createEmptyTeacherPlan,
  teacherPlanSchema,
  saveTeacherPlanSchema,
  teacherPlanBytes,
  TEACHER_PLAN_LIMITS,
} from "@/lib/teacher-plan";
const request = () => ({
  projectId: "f5000000-0000-4000-8000-000000000101",
  expectedRevision: 0,
  mutationId: "f5000000-0000-4000-8000-000000000201",
  document: createEmptyTeacherPlan(),
});
describe("owner-private lesson planning schema", () => {
  it("starts as an editable plan without implying actual learners or a scheduled class", () => {
    const plan = teacherPlanSchema.parse(createEmptyTeacherPlan());
    expect(plan.plannedLearners).toBeNull();
    expect(plan.scheduledOn).toBeNull();
    expect(plan.learningObjectives).toEqual([]);
    expect(plan.sessionMinutes).toBe(60);
    expect(saveTeacherPlanSchema.safeParse(request()).success).toBe(true);
  });
  it("keeps new plans independent", () => {
    const plan = createEmptyTeacherPlan();
    plan.learningObjectives.push("Learn");
    expect(createEmptyTeacherPlan().learningObjectives).toEqual([]);
  });
  it("normalizes outer whitespace without rewriting meaningful text", () => {
    const plan = createEmptyTeacherPlan();
    plan.assignment = "  Compare observations\nExplain limits  ";
    expect(teacherPlanSchema.parse(plan).assignment).toBe("Compare observations\nExplain limits");
  });
  it.each([0, -1, 481, 1.5])("rejects invalid session minutes %s", (sessionMinutes) =>
    expect(
      teacherPlanSchema.safeParse({ ...createEmptyTeacherPlan(), sessionMinutes }).success,
    ).toBe(false),
  );
  it.each([-1, 10001, 1.5])("rejects invalid planned capacity %s", (plannedLearners) =>
    expect(
      teacherPlanSchema.safeParse({ ...createEmptyTeacherPlan(), plannedLearners }).success,
    ).toBe(false),
  );
  it("distinguishes explicit zero capacity from unknown capacity", () => {
    expect(
      teacherPlanSchema.parse({ ...createEmptyTeacherPlan(), plannedLearners: 0 }).plannedLearners,
    ).toBe(0);
    expect(createEmptyTeacherPlan().plannedLearners).toBeNull();
  });
  it.each(["2026-02-29", "2026-02-30", "0000-01-01", "2026-1-1"])(
    "rejects invalid date %s",
    (scheduledOn) =>
      expect(
        teacherPlanSchema.safeParse({ ...createEmptyTeacherPlan(), scheduledOn }).success,
      ).toBe(false),
  );
  it("accepts a real leap-day plan", () =>
    expect(
      teacherPlanSchema.safeParse({ ...createEmptyTeacherPlan(), scheduledOn: "2024-02-29" })
        .success,
    ).toBe(true));
  it("does not accept enrollment, shared roles or unknown schema fields", () => {
    for (const extra of [
      { studentRecords: [] },
      { user_id: "forged" },
      { teacherRole: true },
      { schemaVersion: 2 },
    ])
      expect(teacherPlanSchema.safeParse({ ...createEmptyTeacherPlan(), ...extra }).success).toBe(
        false,
      );
  });
  it("bounds objectives and long private notes", () => {
    expect(
      teacherPlanSchema.safeParse({
        ...createEmptyTeacherPlan(),
        learningObjectives: Array(9).fill("Goal"),
      }).success,
    ).toBe(false);
    expect(
      teacherPlanSchema.safeParse({
        ...createEmptyTeacherPlan(),
        learningObjectives: ["x".repeat(501)],
      }).success,
    ).toBe(false);
    expect(
      teacherPlanSchema.safeParse({
        ...createEmptyTeacherPlan(),
        facilitatorNotes: "x".repeat(4001),
      }).success,
    ).toBe(false);
  });
  it("requires explicit safe revision and project identity", () => {
    expect(
      saveTeacherPlanSchema.safeParse({
        ...request(),
        expectedRevision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      saveTeacherPlanSchema.safeParse({ ...request(), projectId: "other-project" }).success,
    ).toBe(false);
    expect(saveTeacherPlanSchema.safeParse({ ...request(), history: [] }).success).toBe(false);
  });
  it("enforces serialized size independently of per-field character bounds", () => {
    const input = request();
    Object.assign(input.document, {
      assignment: "\u0001".repeat(4000),
      facilitatorNotes: "\u0001".repeat(4000),
      assessment: "\u0001".repeat(2000),
      audience: "\u0001".repeat(1000),
      learningObjectives: Array(8).fill("\u0001".repeat(500)),
    });
    expect(teacherPlanSchema.safeParse(input.document).success).toBe(true);
    expect(teacherPlanBytes(input.document)).toBeGreaterThan(TEACHER_PLAN_LIMITS.documentBytes);
    expect(saveTeacherPlanSchema.safeParse(input).success).toBe(false);
  });
});
