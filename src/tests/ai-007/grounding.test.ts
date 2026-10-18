import { describe, expect, it } from "vitest";
import { envelope, wrapper } from "./fixtures";
import { validateGroundedOutput } from "@/lib/prompts/grounding-v2";
const e = envelope();
const sources = [e.project, ...e.sources];
const omissions = { ...e.omissions, budget: 0 };
const cited = () => ({
  draft: {
    problems: ["Coordination may be difficult."],
    objections: [],
    best_fit: [],
    quotes: ["ALLOWED_QUOTE"],
    changes: [],
  },
  grounding: {
    observations: [{ path: "/quotes/0", sourceId: sources[1]!.sourceId, quote: "ALLOWED_QUOTE" }],
    inferences: [{ path: "/problems/0", category: "inference", sourceIds: [sources[1]!.sourceId] }],
    missingEvidence: [
      { reason: "authenticity_unverified", message: "Not independently verified." },
      { reason: "omitted_sources", message: "Some sources withheld." },
    ],
  },
});
describe("AI007 source and exact quote validator", () => {
  it("accepts a literal authorized quote, preserves uncertainty and stores content-free classifications", () => {
    const output = validateGroundedOutput("synthesis", cited(), sources, omissions);
    expect(output.draft).toEqual(cited().draft);
    expect(output.receipt).toContainEqual({
      path: "/quotes/0",
      category: "observation",
      sourceIds: [sources[1]!.sourceId],
    });
    expect(JSON.stringify(output.receipt)).not.toContain("ALLOWED_QUOTE");
    expect(JSON.stringify(output.receipt)).not.toContain("Coordination");
  });
  it.each([
    "fabricated quote",
    "unknown source",
    "quote from notes",
    "missing annotation",
    "duplicate annotation",
    "project-only inference",
    "hidden limitation",
  ])("rejects %s", (scenario) => {
    const v = cited();
    if (scenario === "fabricated quote") {
      v.draft.quotes[0] = "invented";
      v.grounding.observations[0]!.quote = "invented";
    }
    if (scenario === "unknown source")
      v.grounding.observations[0]!.sourceId = `src_${"f".repeat(64)}`;
    if (scenario === "quote from notes") {
      v.draft.quotes[0] = "ALLOWED_NOTE";
      v.grounding.observations[0]!.quote = "ALLOWED_NOTE";
    }
    if (scenario === "missing annotation") v.grounding.inferences = [];
    if (scenario === "duplicate annotation")
      v.grounding.inferences.push(v.grounding.inferences[0]!);
    if (scenario === "project-only inference")
      v.grounding.inferences[0]!.sourceIds = [sources[0]!.sourceId];
    if (scenario === "hidden limitation") v.grounding.missingEvidence.pop();
    expect(() => validateGroundedOutput("synthesis", v, sources, omissions)).toThrow();
  });
  it("does not count a repeated quotation as another observation", () => {
    const value = cited();
    value.draft.quotes.push(value.draft.quotes[0]!);
    value.grounding.observations.push({ ...value.grounding.observations[0]!, path: "/quotes/1" });
    expect(() => validateGroundedOutput("synthesis", value, sources, omissions)).toThrow(
      "Repeated quotations",
    );
  });
  it("allows honest empty evidence arrays and proposals without fabricating evidence", () => {
    expect(
      validateGroundedOutput("synthesis", wrapper("synthesis"), sources, omissions).draft,
    ).toEqual(wrapper("synthesis").draft);
    expect(
      validateGroundedOutput("questions", wrapper("questions"), [e.project], omissions).receipt[0]!
        .category,
    ).toBe("proposal");
  });
});
