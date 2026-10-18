import {
  createEmptyGuestLearning,
  type GuestLearningDocument,
} from "@/lib/guest-activities/contracts";
export const guestFixtureId = (n: number) =>
  `fc080000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function guestExportFixture(): GuestLearningDocument {
  const doc = createEmptyGuestLearning(),
    d = doc.discovery,
    time = "2026-10-18T20:00:00Z";
  d.frame = {
    problem: "FICTIONAL REHEARSAL. A student struggles to find project teammates.",
    solution: "A possible matching tool — no demand established.",
  };
  d.hypothesisDraft = {
    population: "Students in an entrepreneurship class",
    situation: "Preparing a team project this week",
    prediction: "They describe a recent unsuccessful search",
    disconfirming: "They already form teams without meaningful effort",
    timeWindow: "Next seven days",
    reason: "Own first attempt",
  };
  d.hypotheses = [
    { ...d.hypothesisDraft, id: guestFixtureId(1), createdAt: time },
    {
      ...d.hypothesisDraft,
      id: guestFixtureId(2),
      createdAt: time,
      reason: "Pivot after learning: narrower setting",
      population: "Commuter students",
    },
  ];
  d.selectedHypothesisId = d.hypotheses[1]!.id;
  d.people = Array.from({ length: 5 }, (_, i) => ({
    id: guestFixtureId(10 + i),
    alias: `Fictional person ${i + 1}`,
    relationship: "Classmate",
    relevance: "Has worked in a course team",
    contactId: null,
    falsePositive: "Might be polite",
    falseNegative: "May have a different course situation",
    mitigation: "Ask about a recent episode and seek disagreement",
  }));
  d.missingPerspectives = "Students outside the founder's friendship group";
  d.contexts = [
    {
      id: guestFixtureId(20),
      kind: "website",
      label: "Public product site",
      url: "https://example.org/product",
      text: "",
      capturedAt: time,
      reviewedAt: time,
      permission: "own_or_permitted",
      retrieval: "link_not_read",
    },
    {
      id: guestFixtureId(21),
      kind: "model_output",
      label: "Pasted AI suggestion — not interview evidence",
      url: null,
      text: "Unverified generated suggestion. <script>inert source text</script>",
      capturedAt: time,
      reviewedAt: time,
      permission: "own_or_permitted",
      retrieval: "pasted_text",
    },
    {
      id: guestFixtureId(22),
      kind: "product_text",
      label: "Excluded source",
      url: null,
      text: "EXCLUDED_CONTEXT_NEVER_EXPORTED",
      capturedAt: time,
      reviewedAt: time,
      permission: "own_or_permitted",
      retrieval: "pasted_text",
    },
  ];
  d.excludedContextIds = [guestFixtureId(22)];
  d.scriptDraft = {
    title: "Fictional listening script",
    opening: "May I take notes? You may skip or stop.",
    questions: [
      "Tell me about the last time you found a project team.",
      "What did you try, and what happened?",
      "What have I missed or misunderstood?",
    ],
    closing: "Thank you; no commitment is expected.",
  };
  d.scripts = [
    {
      ...d.scriptDraft,
      id: guestFixtureId(30),
      createdAt: time,
      hypothesisId: guestFixtureId(1),
      contextIds: [guestFixtureId(20)],
    },
    {
      ...d.scriptDraft,
      id: guestFixtureId(31),
      createdAt: time,
      hypothesisId: guestFixtureId(2),
      contextIds: [guestFixtureId(21)],
      title: "Fictional revised listening script",
    },
  ];
  d.selectedScriptId = guestFixtureId(31);
  doc.interviews = [
    {
      id: guestFixtureId(40),
      alias: "Fictional Élodie",
      scriptId: guestFixtureId(31),
      capturedAt: time,
      completed: false,
      answers: d.scriptDraft.questions.map((q, i) => ({
        q,
        note:
          i === 0
            ? "FICTIONAL PRIVATE DRAFT — no person was interviewed. " +
              "Long observation with uncertainty. ".repeat(90) +
              "END_OF_PRIVATE_DRAFT"
            : "",
        quote: "",
      })),
      choices: { note: "granted", ai: "unknown", sharing: "unknown", revision: 1 },
    },
    {
      id: guestFixtureId(41),
      alias: "Fictional role B",
      scriptId: guestFixtureId(30),
      capturedAt: time,
      completed: true,
      answers: d.scriptDraft.questions.map((q, i) => ({
        q,
        note: `FICTIONAL completed-report fixture answer ${i + 1}. Not actual research.`,
        quote: i === 1 ? "Fictional exact words for software testing only." : "",
      })),
      choices: { note: "granted", ai: "unknown", sharing: "granted", revision: 1 },
    },
  ];
  d.results = [
    {
      id: guestFixtureId(50),
      interviewId: guestFixtureId(41),
      scriptId: guestFixtureId(30),
      sourceCapturedAt: time,
      observation: "Fictional observation for UI testing",
      quote: "Fictional quote",
      interpretation: "An unverified interpretation",
      counterevidence: "Other students may not experience this",
    },
  ];
  d.reflection = {
    decision: "narrow",
    reason: "Test a narrower setting",
    productChange: "Revise the invitation prompt",
    nextTest: "Ask one commuter about a recent episode",
    uncertainty: "Demand, willingness to pay and outcomes are unknown",
  };
  return doc;
}
