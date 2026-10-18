import { describe, it, expect } from "vitest";
import {
  createEmptyGuestLearning,
  guestLearningDocumentSchema,
  guestPreservedError,
  saveGuestActivitySchema,
  guestActivityRecordSchema,
} from "@/lib/guest-activities/contracts";
const id = (n: number) => `fc080000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-10-18T20:00:00Z";
function complete() {
  const d = createEmptyGuestLearning();
  d.discovery.hypotheses.push({
    id: id(1),
    createdAt: stamp,
    population: "Fictional users",
    situation: "Recent event",
    prediction: "A workaround",
    disconfirming: "No actual workaround",
    timeWindow: "Last week",
    reason: "First attempt",
  });
  d.discovery.selectedHypothesisId = id(1);
  d.discovery.scripts.push({
    id: id(2),
    createdAt: stamp,
    hypothesisId: id(1),
    contextIds: [],
    title: "First conversation",
    opening: "May I take notes?",
    questions: ["What happened last time?"],
    closing: "What did I miss?",
  });
  d.discovery.selectedScriptId = id(2);
  d.interviews.push({
    id: id(3),
    alias: "Person A",
    scriptId: id(2),
    capturedAt: stamp,
    completed: true,
    answers: [{ q: "What happened last time?", note: "A fictional observation", quote: "" }],
    choices: { note: "granted", ai: "unknown", sharing: "unknown", revision: 1 },
  });
  d.discovery.results.push({
    id: id(4),
    interviewId: id(3),
    scriptId: id(2),
    sourceCapturedAt: stamp,
    observation: "A reported event",
    quote: "",
    interpretation: "One possible explanation",
    counterevidence: "A different situation may differ",
  });
  return d;
}
describe("guest learning document boundaries", () => {
  it("starts with useful manual blank work and separate unknown processing choices", () => {
    const d = createEmptyGuestLearning();
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(true);
    expect(d.permissions).toEqual({ ai: "unknown", sharing: "unknown", revision: 1 });
  });
  it("accepts exact saved hypothesis/script and reported interview linkage", () =>
    expect(guestLearningDocumentSchema.safeParse(complete()).success).toBe(true));
  it.each(["note", "sharing", "ai"] as const)(
    "does not turn another choice into %s permission",
    (key) => {
      const d = complete();
      expect(d.interviews[0]!.choices[key]).toBe(key === "note" ? "granted" : "unknown");
    },
  );
  it("rejects account contact references", () => {
    const d = complete();
    d.discovery.people.push({
      id: id(6),
      alias: "A",
      relationship: "Peer",
      relevance: "Has problem",
      contactId: id(7),
      falsePositive: "May be polite",
      falseNegative: "Different situation",
      mitigation: "Ask past behavior",
    });
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
  });
  it("rejects foreign account/interview reference masquerading as a guest interview", () => {
    const d = complete();
    d.discovery.results[0]!.interviewId = id(8);
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
  });
  it("rejects altered script questions on an interview", () => {
    const d = complete();
    d.interviews[0]!.answers[0]!.q = "Would you buy it?";
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
  });
  it.each(["unknown", "withdrawn"] as const)(
    "rejects stored answers when note permission is %s",
    (note) => {
      const d = complete();
      d.interviews[0]!.choices.note = note;
      expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
    },
  );
  it("rejects duplicate activity identities across types", () => {
    const d = complete();
    d.interviews[0]!.id = id(1);
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
  });
  it("rejects credentials anywhere in the document", () => {
    const d = createEmptyGuestLearning();
    d.discovery.frame.problem = "ghp_abcdefghijklmnopqrstuvw";
    expect(guestLearningDocumentSchema.safeParse(d).success).toBe(false);
  });
  it("preserves blank and unknown rather than counting an interview", () => {
    expect(createEmptyGuestLearning().interviews).toEqual([]);
    expect(createEmptyGuestLearning().discovery.reflection.decision).toBeNull();
  });
  it("preserves first hypothesis when later drafts change", () => {
    const a = complete(),
      b = structuredClone(a);
    b.discovery.hypothesisDraft.prediction = "A new prediction";
    expect(guestPreservedError(a, b)).toBeNull();
    b.discovery.hypotheses[0]!.prediction = "Rewritten history";
    expect(guestPreservedError(a, b)).toMatch(/Preserved/);
  });
  it("requires distinct permission revision and prevents revision-only forgery", () => {
    const a = complete(),
      b = structuredClone(a);
    b.permissions.sharing = "granted";
    expect(guestPreservedError(a, b)).toMatch(/revision/);
    b.permissions.revision = 2;
    expect(guestPreservedError(a, b)).toBeNull();
    b.permissions.revision = 3;
    expect(guestPreservedError(a, b)).toMatch(/revision/);
  });
  it("completed reported answers cannot be silently rewritten", () => {
    const a = complete(),
      b = structuredClone(a);
    b.interviews[0]!.answers[0]!.note = "Changed";
    expect(guestPreservedError(a, b)).toMatch(/Completed/);
  });
  it("permits explicit note withdrawal and clearing with a new choice revision", () => {
    const a = complete(),
      b = structuredClone(a);
    b.interviews[0]!.choices.note = "withdrawn";
    b.interviews[0]!.choices.revision = 2;
    b.interviews[0]!.completed = false;
    b.interviews[0]!.answers[0]!.note = "";
    b.discovery.results = [];
    expect(guestPreservedError(a, b)).toBeNull();
    expect(guestLearningDocumentSchema.safeParse(b).success).toBe(true);
  });
  it("never treats team membership as permission to store principal interview notes", () => {
    const x = {
      activityId: id(9),
      csrf: "a".repeat(64),
      audience: "team_shared",
      expectedRevision: 0,
      mutationId: id(10),
      sharedAudienceConfirmed: true,
      document: complete(),
    };
    expect(saveGuestActivitySchema.safeParse(x).success).toBe(false);
  });
  it("requires explicit confirmation to create a team shared audience", () => {
    const x = {
      activityId: id(9),
      csrf: "a".repeat(64),
      audience: "team_shared",
      expectedRevision: 0,
      mutationId: id(10),
      sharedAudienceConfirmed: false,
      document: createEmptyGuestLearning(),
    };
    expect(saveGuestActivitySchema.safeParse(x).success).toBe(false);
    expect(saveGuestActivitySchema.safeParse({ ...x, sharedAudienceConfirmed: true }).success).toBe(
      true,
    );
  });
  it("records real guest scope and forbids extra owner identity fields", () => {
    const record = {
      id: id(9),
      classId: id(10),
      teamId: id(11),
      authorPrincipalId: id(12),
      audience: "principal_private",
      revision: 1,
      savedAt: stamp,
      document: createEmptyGuestLearning(),
      aiEnabled: false,
    };
    expect(guestActivityRecordSchema.safeParse(record).success).toBe(true);
    expect(
      guestActivityRecordSchema.safeParse({ ...record, user_id: id(15), project_id: id(16) })
        .success,
    ).toBe(false);
    expect(guestActivityRecordSchema.safeParse({ ...record, aiEnabled: true }).success).toBe(false);
  });
});
