import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MARKETING_SHAPE,
  MARKETING_LIMITS,
  createEmptyMarketingPlan,
  marketingPlanSchema,
  saveMarketingPlanSchema,
  isCalendarDay,
  isPublicMarketingUrl,
  jsonBytes,
  canCompleteStudentFirst,
  type MarketingPlanV1,
} from "./marketing-plan";

const richFixture: MarketingPlanV1 = {
  schemaVersion: 1,
  studentFirst: {
    columns: [],
    notes: [
      {
        id: "f4000000-0000-4000-8000-000000000001",
        columnId: null,
        text: "My own initial observation",
      },
    ],
    audience: "Student founders",
    usefulAction: "Try one interview",
    channelIdeas: ["Campus club"],
    completedAt: null,
  },
  audience: {
    beachhead: "Students building a prototype",
    situation: "",
    usefulAction: "Try one interview",
    valueProposition: "",
    sourceIds: [],
    assumptions: [],
    unknowns: ["Whether people return"],
  },
  sources: [
    {
      id: "f4000000-0000-4000-8000-000000000002",
      label: "Owner observation",
      text: "A fictional observation",
      kind: "owner_observation",
      recordId: null,
      url: null,
      observedOn: null,
    },
  ],
  channels: [
    {
      id: "f4000000-0000-4000-8000-000000000003",
      name: "Owner-entered channel",
      medium: "physical",
      place: null,
      url: null,
      sourceIds: ["f4000000-0000-4000-8000-000000000002"],
      observation: "",
      fitReason: "",
      access: {
        state: "unknown",
        rulesNote: "",
        rulesSourceId: null,
        checkedOn: null,
        nextQuestion: "",
      },
      estimatedMinutes: null,
      resourcesNeeded: [],
      unknowns: [],
      origin: "student",
      aiOrigin: null,
    },
    {
      id: "f4000000-0000-4000-8000-000000000004",
      name: "Owner-entered channel",
      medium: "physical",
      place: null,
      url: null,
      sourceIds: ["f4000000-0000-4000-8000-000000000002"],
      observation: "",
      fitReason: "",
      access: {
        state: "unknown",
        rulesNote: "",
        rulesSourceId: null,
        checkedOn: null,
        nextQuestion: "",
      },
      estimatedMinutes: null,
      resourcesNeeded: [],
      unknowns: [],
      origin: "student",
      aiOrigin: null,
    },
  ],
  selection: {
    primaryId: "f4000000-0000-4000-8000-000000000003",
    alternativeId: "f4000000-0000-4000-8000-000000000004",
    reason: "",
  },
  assets: [
    {
      id: "f4000000-0000-4000-8000-000000000005",
      channelId: "f4000000-0000-4000-8000-000000000003",
      format: "community_post",
      ownHook: "",
      truthfulSupport: "",
      supportSourceIds: ["f4000000-0000-4000-8000-000000000002"],
      body: "A manual asset",
      builderDisclosure: "",
      cta: "Try an interview",
      destinationUrl: null,
      firstUsefulAction: "Interview a relevant person",
      aiOrigin: null,
      review: {
        truthful: true,
        disclosedBuilder: true,
        accessChecked: true,
        destinationChecked: true,
        checkedAt: "2026-10-18T12:00:00Z",
      },
      walkthrough: {
        mode: null,
        understoodAudience: "",
        actionObserved: "",
        hesitation: "Keep this dated observation",
        revisionMade: "",
        checkedOn: null,
      },
    },
  ],
  resources: {
    cashBudgetCents: 0,
    availableMinutes: 120,
    existingResources: [],
    limitations: [],
    aiUse: "manual_only",
    fallback: "Use an existing private conversation",
  },
  test: {
    state: "draft",
    startOn: "2026-10-18",
    endOn: "2026-10-24",
    reviewOn: "2026-10-25",
    startedAt: null,
    primaryMetric: "useful_action",
    baselineMeasurementId: null,
    target: null,
    unknownBaselineOrTarget: "Not measured yet",
    measurementPlan: "Manual tally",
    repeatIf: "Useful action observed",
    reviseIf: "Action unclear",
    stopIf: "No accessible route",
    tasks: [
      {
        id: "f4000000-0000-4000-8000-000000000006",
        channelId: "f4000000-0000-4000-8000-000000000003",
        assetId: "f4000000-0000-4000-8000-000000000005",
        kind: "investigate",
        title: "Check the draft",
        ownerLabel: "Founder",
        dueOn: "2026-10-18",
        dependsOn: [],
        doneMeans: "Record a walkthrough",
        estimatedMinutes: null,
        status: "todo",
        completionNote: "",
      },
    ],
  },
  measurements: [],
  rates: [],
  reflection: {
    decision: null,
    evidenceIds: [],
    learned: "",
    uncertainty: "",
    nextAction: "",
    reviewedOn: null,
  },
};
const rich = () => structuredClone(richFixture);
const request = (document = createEmptyMarketingPlan()) => ({
  projectId: "f4000000-0000-4000-8000-000000000010",
  expectedRevision: 0,
  mutationId: "f4000000-0000-4000-8000-000000000100",
  completeStudentFirst: false,
  document,
});

describe("marketing plan contract", () => {
  it("starts with unknowns, no invented evidence, and manual mode", () => {
    const plan = marketingPlanSchema.parse(createEmptyMarketingPlan());
    expect(plan.test.target).toBeNull();
    expect(plan.studentFirst.completedAt).toBeNull();
    expect(plan.measurements).toEqual([]);
    expect(plan.resources.aiUse).toBe("manual_only");
    expect(plan.test.primaryMetric).toBe("useful_action");
    expect(saveMarketingPlanSchema.safeParse(request(plan)).success).toBe(true);
  });
  it("keeps independent copies for new projects", () => {
    const plan = createEmptyMarketingPlan();
    plan.audience.unknowns.push("An unknown");
    expect(createEmptyMarketingPlan().audience.unknowns).toEqual([]);
  });
  it("uses the identical field/bounds specification in the independent SQL validator", () => {
    const migration = readFileSync(
      "supabase/migrations/20261018001000_marketing_plans.sql",
      "utf8",
    );
    const match = migration.match(/AS \$shape\$ SELECT '(.*?)'::jsonb \$shape\$/s);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1]!)).toEqual(MARKETING_SHAPE);
  });
  it("trims edges while preserving meaningful newlines and unknown counts", () => {
    const plan = rich();
    plan.assets[0]!.body = "  First line\nSecond line  ";
    expect(marketingPlanSchema.parse(plan).assets[0]!.body).toBe("First line\nSecond line");
    expect(marketingPlanSchema.parse(plan).test.target).toBeNull();
  });
  it.each(["2026-02-29", "2026-02-30", "0000-01-01", "2026-13-01", "2026-1-1"])(
    "rejects non-calendar date %s",
    (day) => expect(isCalendarDay(day)).toBe(false),
  );
  it("accepts leap day only in a leap year", () => expect(isCalendarDay("2024-02-29")).toBe(true));
  it.each([
    "http://localhost/x",
    "http://127.1/x",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "https://name:secret@example.com/",
    "javascript:alert(1)",
    "https://example.com/\nsecret",
    "https://example.com\\@127.0.0.1/",
  ])("rejects unsafe URL %s", (url) => expect(isPublicMarketingUrl(url)).toBe(false));
  it("normalizes a public URL without fetching it", () => {
    const plan = rich();
    plan.channels[0]!.url = " HTTPS://EXAMPLE.COM/path ";
    expect(marketingPlanSchema.parse(plan).channels[0]!.url).toBe("https://example.com/path");
  });
  it.each([
    "schemaVersion",
    "unknownKey",
    "missingKey",
    "tooLong",
    "tooMany",
    "badNumber",
    "badMinutes",
    "sameChannel",
    "danglingSource",
    "badTaskChannel",
    "cycle",
    "invalidWindow",
    "permissionWithoutBasis",
    "fakeOrigin",
  ])("rejects %s without changing the original", (kind) => {
    const plan = rich();
    const original = structuredClone(plan);
    let candidate: unknown = plan;
    switch (kind) {
      case "schemaVersion":
        candidate = { ...plan, schemaVersion: 2 };
        break;
      case "unknownKey":
        candidate = { ...plan, extra: true };
        break;
      case "missingKey": {
        const { sources: _sources, ...rest } = plan;
        candidate = rest;
        break;
      }
      case "tooLong":
        plan.assets[0]!.body = "x".repeat(4001);
        break;
      case "tooMany":
        plan.channels = Array.from({ length: 13 }, () => structuredClone(plan.channels[0]!));
        break;
      case "badNumber":
        plan.test.target = 0.5;
        break;
      case "badMinutes":
        plan.resources.availableMinutes = 10081;
        break;
      case "sameChannel":
        plan.selection.alternativeId = plan.selection.primaryId;
        break;
      case "danglingSource":
        plan.assets[0]!.supportSourceIds = ["f4000000-0000-4000-8000-000000000999"];
        break;
      case "badTaskChannel":
        plan.test.tasks[0]!.channelId = plan.selection.alternativeId;
        break;
      case "cycle": {
        const task = structuredClone(plan.test.tasks[0]!);
        task.id = "f4000000-0000-4000-8000-000000000777";
        task.dependsOn = [plan.test.tasks[0]!.id];
        plan.test.tasks[0]!.dependsOn = [task.id];
        plan.test.tasks.push(task);
        break;
      }
      case "invalidWindow":
        plan.test.endOn = "2026-10-25";
        break;
      case "permissionWithoutBasis":
        plan.channels[0]!.access.state = "allowed";
        break;
      case "fakeOrigin":
        plan.channels[0]!.origin = "ai_proposal";
        break;
    }
    expect(marketingPlanSchema.safeParse(candidate).success).toBe(false);
    expect(rich()).toEqual(original);
  });
  it("requires own first thinking before completion", () => {
    expect(canCompleteStudentFirst(createEmptyMarketingPlan().studentFirst)).toBe(false);
    expect(canCompleteStudentFirst(rich().studentFirst)).toBe(true);
  });
  it("allows unknown baseline/target in a review-ready plan with an explanation", () => {
    const plan = rich();
    plan.studentFirst.completedAt = "2026-10-18T12:00:00.000Z";
    plan.test.state = "ready_to_review";
    expect(marketingPlanSchema.safeParse(plan).success).toBe(true);
    plan.test.unknownBaselineOrTarget = "";
    expect(marketingPlanSchema.safeParse(plan).success).toBe(false);
  });
  it("does not confuse a ready plan with a launched or reviewed test", () => {
    const plan = rich();
    plan.studentFirst.completedAt = "2026-10-18T12:00:00.000Z";
    plan.test.state = "running";
    expect(marketingPlanSchema.safeParse(plan).success).toBe(false);
    plan.test.state = "reviewed";
    expect(marketingPlanSchema.safeParse(plan).success).toBe(false);
  });
  it("enforces byte limits independently of character limits", () => {
    const plan = rich();
    plan.assets = Array.from({ length: 10 }, (_, index) => ({
      ...structuredClone(plan.assets[0]!),
      id:
        index === 0
          ? plan.assets[0]!.id
          : `f4000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`,
      body: "🧪".repeat(4000),
    }));
    expect(marketingPlanSchema.safeParse(plan).success).toBe(true);
    expect(jsonBytes(plan)).toBeGreaterThan(MARKETING_LIMITS.clientDocumentBytes);
    expect(saveMarketingPlanSchema.safeParse(request(plan)).success).toBe(false);
  });
  it("rejects unbounded revision and unknown request fields", () => {
    expect(
      saveMarketingPlanSchema.safeParse({
        ...request(),
        expectedRevision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(saveMarketingPlanSchema.safeParse({ ...request(), userId: "forged" }).success).toBe(
      false,
    );
  });
});
