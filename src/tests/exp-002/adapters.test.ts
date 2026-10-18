import { describe, expect, it } from "vitest";
import {
  activity,
  section,
  boundedOffers,
  projectActivities,
  contactActivities,
  interviewDraftActivity,
  ownerPortfolioActivities,
  markProjectOffers,
} from "@/lib/export/adapters";
import { marketingActivities, teacherActivities } from "@/lib/export/plan-adapters";
import {
  classroomExampleActivities,
  studyLoopActivities,
  livePracticeActivities,
} from "@/lib/export/demo-adapters";
import { createEmptyMarketingPlan } from "@/lib/marketing-plan";
import { createEmptyTeacherPlan } from "@/lib/teacher-plan";
import { savedFixture, textOf, frozen, capturedAt } from "./fixtures";

describe("explicit activity adapters", () => {
  it("preserves every saved record as a named choice and marks seeded examples without inferring access", () => {
    const fixture = savedFixture();
    const offers = ownerPortfolioActivities(fixture);
    expect(offers.length).toBe(
      5 +
        fixture.contacts.length +
        fixture.interviews.length +
        fixture.learnings.length +
        fixture.experiments.length +
        fixture.outreach.length,
    );
    expect(
      offers.every((o) => o.activity.fictional && o.activity.sourceScope === "owner_private"),
    ).toBe(true);
    const text = textOf(offers);
    expect(text).toContain("Completed interview records: 5");
    expect(text).toContain("FICTIONAL EXAMPLE");
    expect(text).toContain(fixture.contacts[0]!.why);
    expect(text).toContain(fixture.outreach[0]!.body);
    expect(text).not.toContain(fixture.project.id);
    expect(text).not.toContain(fixture.project.user_id);
    expect(() =>
      contactActivities(fixture.project, [{ ...fixture.contacts[0]!, user_id: "another-owner" }]),
    ).toThrow(/does not belong/);
    expect(() =>
      ownerPortfolioActivities({
        ...fixture,
        interviews: [{ ...fixture.interviews[0]!, project_id: "another-project" }],
      }),
    ).toThrow(/does not belong/);
    expect(
      markProjectOffers({ user_id: "ordinary", checklist: { demo: { fictional: true } } }, [
        activity("x", "Example", []),
      ])[0]!.activity.sourceScope,
    ).toBe("owner_private");
  });
  it("keeps absent metrics unknown, explicit zero, entered text and interview draft permissions distinct", () => {
    const { project } = savedFixture();
    const metrics = projectActivities({
      ...project,
      checklist: { metrics: { active: 0 }, s1_fit: false },
    });
    const text = textOf(metrics);
    expect(text).toContain("Active: 0");
    expect(text).toContain("Sign-ups: Unknown / not recorded");
    expect(text).toContain("I can describe my best-fit user: No");
    expect(text).not.toContain("0%");
    const draft = interviewDraftActivity(project, {
      questions: ["What happened?"],
      answers: [
        {
          q: "What happened?",
          note: "Unsaved Élodie <script>note</script>",
          quote: "Own quoted text",
        },
      ],
      tags: ["current workaround"],
      noteTakingPermission: false,
    });
    const draftText = textOf([draft]);
    expect(draftText).toContain("Unsaved Élodie <script>note</script>");
    expect(draftText).toContain("Permission to take notes (local checkbox): No");
    expect(draftText).toContain("unsaved");
  });
  it("splits exceptionally long activities into selectable valid parts without losing text or duplicate keys", () => {
    const long = "Start Élodie ".repeat(24_000) + "FINAL_SENTINEL";
    const offers = boundedOffers([
      activity("long", "Long notes", [section("long.notes", "Notes", [["Note", long]])]),
    ]);
    expect(offers.length).toBeGreaterThan(1);
    const values = offers.flatMap((o) =>
      o.activity.sections.flatMap((s) =>
        s.blocks.flatMap((b) => (b.type === "fields" ? b.fields.map((f) => f.value) : [])),
      ),
    );
    expect(values.join("")).toBe(long);
    offers.forEach((o) => expect(frozen([o]).activities).toHaveLength(1));
    expect(offers.every((o) => /part \d+\/\d+/.test(o.activity.title))).toBe(true);
  });
  it("exports every marketing step and per-record choices without converting unrun counts into results", () => {
    const plan = createEmptyMarketingPlan();
    plan.studentFirst.columns = [{ id: "heading", title: "My original grouping" }];
    plan.studentFirst.notes = [
      { id: "note", columnId: "heading", text: "Student thought before any scaffold" },
    ];
    plan.reflection.nextAction = "Try one clearer invitation";
    plan.test.target = 0;
    plan.measurements = [
      {
        id: "observation",
        channelId: "missing",
        assetId: null,
        metric: "visits",
        cohort: "peer_test",
        from: "2026-10-17",
        to: "2026-10-18",
        unit: "unique_people",
        count: null,
        source: "Not measured",
        sourceUrl: null,
        recordedOn: "2026-10-18",
        limitations: "No observed result",
      },
    ];
    const offers = marketingActivities(plan, { savedAt: null, revision: 0, dirty: true });
    expect(offers.slice(0, 5).map((o) => o.activity.key)).toEqual([
      "marketing.think",
      "marketing.channels",
      "marketing.content",
      "marketing.test",
      "marketing.review",
    ]);
    expect(offers.some((o) => o.activity.key === "marketing.observation-record.0")).toBe(true);
    const text = textOf(offers);
    expect(text).toContain("My original grouping");
    expect(text).toContain("Student thought before any scaffold");
    expect(text).toContain("Target (not observed result): 0");
    expect(text).toContain("Count: Unknown / not recorded");
    expect(text).toContain("Current unsaved edits");
    expect(text).toContain("Try one clearer invitation");
    expect(text).not.toContain("NaN");
  });
  it("separates facilitator notes from assignment preview and keeps authored teams and local comments fictional", () => {
    const plan = {
      ...createEmptyTeacherPlan(),
      className: "A real private plan",
      plannedLearners: 45,
      facilitatorNotes: "Private facilitation note",
      assignment: "Compare evidence",
    };
    const offers = teacherActivities(plan, { savedAt: capturedAt, revision: 2, dirty: false });
    expect(textOf([offers[0]!])).toContain("Planned learner capacity - not enrollment: 45");
    expect(textOf([offers[1]!])).not.toContain("Private facilitation note");
    expect(textOf([offers[1]!])).toContain("not a published assignment");
    const classroom = classroomExampleActivities("campusswap", {
      campusswap: "My unsent feedback",
    });
    expect(classroom).toHaveLength(4);
    expect(textOf(classroom)).toContain("My unsent feedback");
    expect(classroom.every((o) => o.activity.fictional)).toBe(true);
    const study = studyLoopActivities({ choiceId: null, sourceId: "studyloop-maya", step: 0 });
    expect(textOf(study)).toContain("Selected choice: Unknown / not recorded");
    expect(textOf(study)).toContain("Nora");
  });
  it("preserves temporary edited AI practice separately from the original draft and unknown cost", () => {
    const result = {
      draft: {
        channel: "Club",
        hook: "Ask a question",
        body: "Original draft",
        cta: "Reply",
        accessCheck: "Ask first",
        peerCheck: "Try a peer",
        measurement: "Unknown",
        uncertainty: "Not tested",
      },
      metadata: {
        promptVersion: "1",
        model: "fixture model",
        provider: "fixture provider",
        costUsd: null,
      },
    };
    const text = textOf(
      livePracticeActivities(result, "Edited manual body", ["Earlier edited body"]),
    );
    expect(text).toContain("Current edited body: Edited manual body");
    expect(text).toContain("Original AI body: Original draft");
    expect(text).toContain("Earlier edited body");
    expect(text).toContain("Reported cost USD: Unknown / not recorded");
    expect(text).toContain("FICTIONAL EXAMPLE");
  });
});
