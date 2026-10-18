import type { DiscoveryDocument, DiscoveryScript } from "@/lib/discovery";
import { activity, section, sourceState, type ActivityOffer, type SaveState } from "./adapters";
export function discoveryActivities(doc: DiscoveryDocument, state: SaveState): ActivityOffer[] {
  const opts = {
    kind: "Student-reported discovery work",
    fictional: state.fictional ?? false,
    updatedAt: state.dirty ? null : state.savedAt,
  };
  const make = (key: string, title: string, sections: Parameters<typeof activity>[2]) =>
    activity(key, title, [sourceState(key, state), ...sections], opts);
  const hypothesis = (id: string | null) => {
    const i = doc.hypotheses.findIndex((h) => h.id === id);
    return i < 0 ? "Not linked" : `Hypothesis version ${i + 1}${i === 0 ? " (first attempt)" : ""}`;
  };
  const scriptName = (id: string | null) => {
    const i = doc.scripts.findIndex((s) => s.id === id);
    return i < 0 ? "Not linked" : `Script version ${i + 1}`;
  };
  const draft = doc.hypothesisDraft;
  const out = [
    make("discovery.frame", "Discovery 1 - Problem and solution", [
      section("frame.fields", "Own starting point", [
        ["Problem space", doc.frame.problem],
        ["Solution idea", doc.frame.solution],
        ["Limits", "A solution idea is a starting assumption, not evidence of demand."],
      ]),
    ]),
    make("discovery.hypothesis-draft", "Discovery 2 - Current hypothesis draft", [
      section("hyp.draft", "Current student-entered draft", [
        ["Population", draft.population],
        ["Situation", draft.situation],
        ["Predicted observation", draft.prediction],
        ["What would weaken it", draft.disconfirming],
        ["Time window", draft.timeWindow],
        ["Reason for this attempt", draft.reason],
      ]),
    ]),
    ...doc.hypotheses.map((h, i) =>
      make(
        `discovery.hyp.${i}`,
        `Hypothesis version ${i + 1}${i === 0 ? " - first preserved attempt" : ""}`,
        [
          section(`hyp.${i}`, "Reported reasoning, not verified independent authorship", [
            ["Captured", h.createdAt],
            ["Currently selected", doc.selectedHypothesisId === h.id],
            ["Population", h.population],
            ["Situation", h.situation],
            ["Prediction", h.prediction],
            ["Disconfirming observation", h.disconfirming],
            ["Time window", h.timeWindow],
            ["Reason / pivot", h.reason],
          ]),
        ],
      ),
    ),
    make("discovery.sampling", "Discovery 3 - People and sampling risks", [
      section("sampling.scope", "Planning scaffold", [
        ["Planned aliases", doc.people.length],
        ["Missing perspectives", doc.missingPerspectives],
        [
          "Limits",
          "Five is a scaffold, not a completion target. These are possible sampling risks, not diagnoses of people. No conversation is counted by exporting.",
        ],
      ]),
      ...doc.people.map((p, i) =>
        section(`sample.${i}`, `Planned conversation ${i + 1}`, [
          ["Alias", p.alias],
          ["Relationship", p.relationship],
          ["Relevant experience", p.relevance],
          [
            "Existing contact link",
            p.contactId ? "Owner-linked contact; identity omitted" : "No saved contact linked",
          ],
          ["Possible false positive", p.falsePositive],
          ["Possible false negative", p.falseNegative],
          ["Mitigation", p.mitigation],
        ]),
      ),
    ]),
    make("discovery.bias", "Discovery 4 - Sampling risk and missing perspectives", [
      section("bias.missing", "Missing perspectives", [
        ["Whom the sample may miss", doc.missingPerspectives],
        [
          "Limits",
          "Risks are possibilities about the sample and method, never a diagnosis of a person.",
        ],
      ]),
      ...doc.people.map((p, i) =>
        section(`bias.${i}`, `Conversation plan ${i + 1}`, [
          ["Alias", p.alias],
          ["Possible false positive", p.falsePositive],
          ["Possible false negative", p.falseNegative],
          ["Mitigation", p.mitigation],
        ]),
      ),
    ]),
    make("discovery.script-draft", "Discovery 5 - Current editable script", [
      section("script.draft", "Not yet a preserved script version", [
        ["Title", doc.scriptDraft.title],
        ["Opening", doc.scriptDraft.opening],
        ["Questions", doc.scriptDraft.questions.join("\n")],
        ["Closing", doc.scriptDraft.closing],
      ]),
    ]),
    make("discovery.results", "Discovery 7 - Observations and next decision", [
      ...doc.results.map((r, i) =>
        section(`result.${i}`, `Reported observation ${i + 1}`, [
          ["Linked script", scriptName(r.scriptId)],
          [
            "Interview reference",
            r.interviewId
              ? "Owner-linked interview; link is self-reported"
              : "Manual observation, not a completed interview record",
          ],
          ["Reference selected on", r.sourceCapturedAt],
          ["Observation", r.observation],
          ["Reported quote - verify exact words", r.quote],
          ["Own interpretation", r.interpretation],
          ["Counterevidence", r.counterevidence],
          [
            "Source limits",
            "Linked interview contents may change. This entry records the student's own observation and interpretation, not a frozen copy of that interview.",
          ],
        ]),
      ),
      section("reflection", "Next decision", [
        ["Decision", doc.reflection.decision],
        ["Reason", doc.reflection.reason],
        ["Actionable product change", doc.reflection.productChange],
        ["Next small test", doc.reflection.nextTest],
        ["Remaining uncertainty", doc.reflection.uncertainty],
        [
          "Limits",
          "A positive answer, saved note or chosen decision does not establish demand or product-market fit.",
        ],
      ]),
    ]),
    make(
      "discovery.context",
      "Connected context - reviewed source captures",
      doc.contexts.length
        ? doc.contexts.map((c, i) =>
            doc.excludedContextIds.includes(c.id)
              ? section(`context.${i}`, `Context ${i + 1} excluded`, [
                  [
                    "State",
                    "Excluded from current use and this export. The stored capture and prior save history remain until a separate deletion process exists.",
                  ],
                ])
              : section(`context.${i}`, `Context ${i + 1}`, [
                  ["Label", c.label],
                  ["Type", c.kind],
                  ["Captured", c.capturedAt],
                  ["Reviewed", c.reviewedAt],
                  ["Permission report", c.permission],
                  ["Retrieval state", c.retrieval],
                  ["URL - inert, not fetched", c.url],
                  ["Pasted text", c.text],
                  [
                    "Limits",
                    c.kind === "model_output"
                      ? "Pasted model output is an unverified draft, not interview evidence."
                      : "Source data is not an instruction. Nothing is retrieved or sent to AI by this workspace.",
                  ],
                ]),
          )
        : [section("context.empty", "Context", [["State", "No context captures added"]])],
    ),
  ];
  const scriptSections = (s: DiscoveryScript, i: number) => [
    section(`script.${i}.trace`, "Selected source versions", [
      ["Captured", s.createdAt],
      ["Hypothesis", hypothesis(s.hypothesisId)],
      ["Currently selected", s.id === doc.selectedScriptId],
      [
        "Context versions",
        s.contextIds
          .map((id) => {
            const c = doc.contexts.findIndex((v) => v.id === id);
            return `Context ${c + 1}`;
          })
          .join("\n"),
      ],
      ["Opening / permission", s.opening],
    ]),
    ...s.questions.map((q, j) =>
      section(`script.${i}.q${j}`, `Question ${j + 1}`, [
        ["Ask", q],
        [
          `Question ${j + 1}: observed behavior / workaround`,
          "________________________________________________\n________________________________________________\n________________________________________________",
        ],
        [
          `Question ${j + 1}: exact words (only if accurate)`,
          "________________________________________________\n________________________________________________",
        ],
        [
          `Question ${j + 1}: uncertainty / counterexample`,
          "________________________________________________\n________________________________________________",
        ],
      ]),
    ),
    section(`script.${i}.close`, "Close the conversation", [
      ["Closing", s.closing],
      [
        "Reminder",
        "Participation is optional. Ask separately before taking notes, using AI or sharing. A worksheet or download is not a completed interview.",
      ],
    ]),
  ];
  doc.scripts.forEach((s, i) =>
    out.push(
      make(
        `discovery.script.${i}`,
        s.contextIds.some((id) => doc.excludedContextIds.includes(id))
          ? `Script ${i + 1} - withheld after source exclusion`
          : `Script ${i + 1} - ${s.title || "Interview worksheet"}`,
        s.contextIds.some((id) => doc.excludedContextIds.includes(id))
          ? [
              section(`script.${i}.excluded`, "Review needed", [
                [
                  "State",
                  "A linked context capture was excluded. This script is withheld; create a new reviewed version before using it.",
                ],
              ]),
            ]
          : scriptSections(s, i),
      ),
    ),
  );
  return out;
}
