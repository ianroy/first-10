import { describe, expect, it } from "vitest";
import { createEmptyDiscovery, type DiscoveryDocument } from "@/lib/discovery";
import { discoveryActivities } from "@/lib/export/discovery-adapters";
import { frozen, textOf } from "../exp-002/fixtures";

const stamp = "2026-10-18T15:00:00Z";
const id = (n: number) => `d1500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const state = { savedAt: stamp, revision: 3, dirty: false };
function fixture(): DiscoveryDocument {
  const doc = createEmptyDiscovery();
  doc.frame = { problem: "Late clubs are hard to reach", solution: "A ride coordination idea" };
  doc.hypotheses = [
    {
      id: id(1),
      createdAt: stamp,
      population: "Commuting students",
      situation: "Late club meetings",
      prediction: "Two people report missed meetings",
      disconfirming: "Existing rides meet their needs",
      timeWindow: "This week, about last month",
      reason: "First assumption",
    },
  ];
  doc.selectedHypothesisId = id(1);
  doc.contexts = [
    {
      id: id(2),
      kind: "model_output",
      label: "Unverified model suggestion",
      url: null,
      text: "CONTEXT_SENTINEL: consider commuter scheduling",
      capturedAt: stamp,
      reviewedAt: stamp,
      permission: "own_or_permitted",
      retrieval: "pasted_text",
    },
  ];
  doc.scripts = [
    {
      id: id(3),
      createdAt: stamp,
      hypothesisId: id(1),
      contextIds: [id(2)],
      title: "First conversation",
      opening: "May I take notes? You may skip or stop.",
      questions: ["Élodie, what happened last time?", "What workaround did you use?"],
      closing: "What have I missed?",
    },
    {
      id: id(4),
      createdAt: stamp,
      hypothesisId: id(1),
      contextIds: [],
      title: "Second conversation",
      opening: "May I take notes? You may skip or stop.",
      questions: ["Describe your most recent bus journey."],
      closing: "What have I missed?",
    },
  ];
  doc.selectedScriptId = id(4);
  doc.scriptDraft.questions = ["UNSAVED_DRAFT_QUESTION"];
  doc.people = [
    {
      id: id(5),
      alias: "A classmate",
      relationship: "Friend",
      relevance: "Commutes after clubs",
      contactId: id(90),
      falsePositive: "May encourage me out of friendship",
      falseNegative: "May not face the timing problem",
      mitigation: "Ask about a specific past trip",
    },
  ];
  doc.missingPerspectives = "Students who stopped attending clubs";
  doc.results = [
    {
      id: id(6),
      interviewId: id(91),
      scriptId: id(3),
      sourceCapturedAt: stamp,
      observation: "They left the event early",
      quote: "I checked the bus time",
      interpretation: "Travel timing may matter",
      counterevidence: "They said most weeks are manageable",
    },
    {
      id: id(7),
      interviewId: null,
      scriptId: null,
      sourceCapturedAt: null,
      observation: "A manual observation",
      quote: "",
      interpretation: "",
      counterevidence: "",
    },
  ];
  doc.reflection = {
    decision: "narrow",
    reason: "Only late events caused a problem",
    productChange: "Focus the next draft on late departures",
    nextTest: "Observe two different evening events",
    uncertainty: "The sample is all friends",
  };
  return doc;
}

describe("discovery individual PDF activities", () => {
  it("provides valid independent choices with source state, first attempt and exact saved script versions", () => {
    const doc = fixture();
    const before = JSON.stringify(doc);
    const offers = discoveryActivities(doc, state);
    expect(offers.map((o) => o.activity.key)).toEqual([
      "discovery.frame",
      "discovery.hypothesis-draft",
      "discovery.hyp.0",
      "discovery.sampling",
      "discovery.bias",
      "discovery.script-draft",
      "discovery.results",
      "discovery.context",
      "discovery.script.0",
      "discovery.script.1",
    ]);
    offers.forEach((offer) => expect(frozen([offer]).activities).toHaveLength(1));
    expect(frozen(offers).activities).toHaveLength(10);
    expect(
      offers.every(
        (offer) => offer.activity.sourceScope === "owner_private" && !offer.activity.fictional,
      ),
    ).toBe(true);
    const first = offers.find((offer) => offer.activity.key === "discovery.script.0")!;
    const firstText = textOf([first]);
    expect(firstText).toContain("Élodie, what happened last time?");
    expect(firstText).toContain("What workaround did you use?");
    expect(firstText).toContain("Hypothesis version 1 (first attempt)");
    expect(firstText).toContain("Currently selected: No");
    expect(firstText).not.toContain("Describe your most recent bus journey.");
    expect(firstText).not.toContain("UNSAVED_DRAFT_QUESTION");
    expect(textOf([offers.find((o) => o.activity.key === "discovery.script.1")!])).toContain(
      "Currently selected: Yes",
    );
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("includes permission opening and writable note, quote and counterexample space for every exact question", () => {
    const offer = discoveryActivities(fixture(), state).find(
      (o) => o.activity.key === "discovery.script.0",
    )!;
    const text = textOf([offer]);
    expect(text).toContain("Opening / permission: May I take notes? You may skip or stop.");
    expect(text).toContain("Closing: What have I missed?");
    const questions = offer.activity.sections.filter((s) => s.title.startsWith("Question "));
    expect(questions).toHaveLength(2);
    for (const [index, question] of questions.entries()) {
      const fields = question.blocks.flatMap((b) => (b.type === "fields" ? b.fields : []));
      expect(fields.map((f) => f.label)).toEqual([
        "Ask",
        `Question ${index + 1}: observed behavior / workaround`,
        `Question ${index + 1}: exact words (only if accurate)`,
        `Question ${index + 1}: uncertainty / counterexample`,
      ]);
      expect(fields.slice(1).every((f) => String(f.value).includes("________________"))).toBe(true);
    }
    expect(text).toContain("Ask separately before taking notes, using AI or sharing");
    expect(text).toContain("not a completed interview");
  });

  it("removes excluded source content and withholds scripts linked to it while retaining unrelated versions", () => {
    const doc = fixture();
    doc.excludedContextIds = [id(2)];
    const offers = discoveryActivities(doc, state);
    const connected = textOf([offers.find((o) => o.activity.key === "discovery.context")!]);
    expect(connected).toContain("Context 1 excluded");
    expect(connected).toContain("stored capture and prior save history remain");
    expect(connected).not.toContain("CONTEXT_SENTINEL");
    expect(connected).not.toContain("Unverified model suggestion");
    const withheld = textOf([offers.find((o) => o.activity.key === "discovery.script.0")!]);
    expect(withheld).toContain("This script is withheld");
    expect(withheld).not.toContain("First conversation");
    expect(withheld).not.toContain("Élodie, what happened last time?");
    expect(withheld).not.toContain("What workaround did you use?");
    expect(textOf([offers.find((o) => o.activity.key === "discovery.script.1")!])).toContain(
      "Describe your most recent bus journey.",
    );
  });

  it("keeps model output unverified, unread URLs inert and unknown review separate from permission", () => {
    const doc = fixture();
    doc.contexts.push({
      id: id(8),
      kind: "website",
      label: "Public project page",
      url: "https://example.com/product",
      text: "",
      capturedAt: stamp,
      reviewedAt: null,
      permission: "unknown",
      retrieval: "link_not_read",
    });
    const context = textOf([
      discoveryActivities(doc, state).find((o) => o.activity.key === "discovery.context")!,
    ]);
    expect(context).toContain(
      "Pasted model output is an unverified draft, not interview evidence.",
    );
    expect(context).toContain("Reviewed: Unknown / not recorded");
    expect(context).toContain("Permission report: unknown");
    expect(context).toContain("Retrieval state: link_not_read");
    expect(context).toContain("URL - inert, not fetched: https://example.com/product");
  });

  it("preserves sampling risks and counterevidence without exporting contact or interview IDs or inventing completion", () => {
    const doc = fixture();
    const text = textOf(discoveryActivities(doc, state));
    expect(text).toContain("Planned aliases: 1");
    expect(text).toContain("Five is a scaffold, not a completion target");
    expect(text).toContain("May encourage me out of friendship");
    expect(text).toContain("Students who stopped attending clubs");
    expect(text).toContain("Counterevidence: They said most weeks are manageable");
    expect(text).toContain("Manual observation, not a completed interview record");
    expect(text).toContain("not a frozen copy of that interview");
    expect(text).toContain("Actionable product change: Focus the next draft on late departures");
    expect(text).toContain("Next small test: Observe two different evening events");
    expect(JSON.stringify(discoveryActivities(doc, state))).not.toContain(id(90));
    expect(JSON.stringify(discoveryActivities(doc, state))).not.toContain(id(91));
    expect(text).not.toContain("Completed interviews: 2");
  });

  it("labels unsaved and fictional material without inventing a saved timestamp or project access", () => {
    const offers = discoveryActivities(createEmptyDiscovery(), {
      savedAt: stamp,
      revision: 3,
      dirty: true,
      fictional: true,
    });
    expect(
      offers.every(
        (offer) =>
          offer.activity.updatedAt === null &&
          offer.activity.fictional &&
          offer.activity.sourceScope === "owner_private",
      ),
    ).toBe(true);
    const text = textOf(offers);
    expect(text).toContain("Current unsaved edits");
    expect(text).toContain("FICTIONAL EXAMPLE");
    expect(text).toContain("Decision: Unknown / not recorded");
    expect(text).toContain("Planned aliases: 0");
  });
});
