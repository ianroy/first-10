import { describe, expect, it } from "vitest";
import { aiRequestSchema } from "@/lib/ai/contracts";
import { aiOriginSchema, recordedAIOutput, outreachRows } from "@/lib/ai/saved-output";
const originId = "fa028000-0000-4000-8000-000000000001";
describe("saved generation receipts", () => {
  it("accepts optional receipt requests but never caller-supplied model/prompt/origin", () => {
    expect(
      aiRequestSchema.parse({ kind: "questions", projectId: originId, operationId: originId }),
    ).not.toHaveProperty("withOrigin");
    expect(
      aiRequestSchema.parse({
        kind: "questions",
        projectId: originId,
        operationId: originId,
        withOrigin: true,
      }).withOrigin,
    ).toBe(true);
    for (const field of ["originId", "model", "prompt"])
      expect(() =>
        aiRequestSchema.parse({
          kind: "questions",
          projectId: originId,
          operationId: originId,
          [field]: "fixture",
        }),
      ).toThrow();
  });
  it("requires a stable UUID intent for every kind", () => {
    for (const kind of ["questions", "synthesis", "stage2", "stage3", "marketing_demo"]) {
      expect(aiRequestSchema.safeParse({ kind, projectId: originId }).success).toBe(false);
      expect(
        aiRequestSchema.safeParse({ kind, projectId: originId, operationId: "random" }).success,
      ).toBe(false);
      expect(
        aiRequestSchema.safeParse({ kind, projectId: originId, operationId: originId }).success,
      ).toBe(true);
    }
  });
  it("preserves strict output validation inside a server receipt", () => {
    expect(
      recordedAIOutput("questions", { originId, data: { questions: ["Recent example?"] } }),
    ).toEqual({ originId, data: { questions: ["Recent example?"] } });
    for (const bad of [
      { questions: ["No receipt"] },
      { originId: "fake", data: { questions: ["Q"] } },
      { originId, data: { questions: [] } },
      { originId, data: { questions: ["Q"], extra: true } },
      { originId, data: { questions: ["Q"] }, model: "caller" },
    ])
      expect(() => recordedAIOutput("questions", bad)).toThrow();
  });
  it("maps both outreach kinds without mixing survey content into outreach rows", () => {
    expect(
      outreachRows({
        channels: [{ title: "Investigate", body: "Check permission" }],
        drafts: [{ title: "Invitation", body: "Unsent" }],
        survey: ["Recent example?"],
      }),
    ).toEqual([
      { kind: "channel", title: "Investigate", body: "Check permission" },
      { kind: "draft", title: "Invitation", body: "Unsent" },
    ]);
    expect(
      outreachRows({
        channels: [],
        referral_asks: ["Could you introduce us?"],
        onboarding_questions: ["Where did you stop?"],
      }),
    ).toEqual([
      { kind: "referral", title: "Referral ask 1", body: "Could you introduce us?" },
      { kind: "onboarding", title: "", body: "Where did you stop?" },
    ]);
  });
  it("keeps unreported model/provider/cost unknown and zero cost distinct", () => {
    const origin = {
      requestId: originId,
      kind: "questions",
      promptId: "first-ten.questions",
      promptVersion: 1,
      schemaId: "first-ten.questions.output",
      schemaVersion: 1,
      requestedModel: "requested",
      actualModel: null,
      provider: null,
      costUsd: null,
      createdAt: "2026-10-18T13:00:00+00:00",
    };
    expect(aiOriginSchema.parse(origin).costUsd).toBeNull();
    expect(aiOriginSchema.parse({ ...origin, costUsd: 0 }).costUsd).toBe(0);
    expect(() => aiOriginSchema.parse({ ...origin, prompt: "PRIVATE" })).toThrow();
  });
});
