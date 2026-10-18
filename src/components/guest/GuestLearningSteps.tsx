import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hypothesisReady, type DiscoveryDocument } from "@/lib/discovery";
import type { GuestLearningDocument } from "@/lib/guest-activities/contracts";
import { GuestChoice, GuestField, GuestSelect } from "./GuestFields";

const hypothesisFields = [
  ["population", "Specific people", 500],
  ["situation", "Situation they experience", 500],
  ["prediction", "What do you predict you will observe?", 1000],
  ["disconfirming", "What observation would weaken it?", 1000],
  ["timeWindow", "Test window", 500],
  ["reason", "Reason for this attempt or pivot", 1000],
] as const;
type Props = {
  step: number;
  document: GuestLearningDocument;
  update: (fn: (d: GuestLearningDocument) => void) => void;
  shared: boolean;
};
export function GuestLearningSteps({ step, document: doc, update, shared }: Props) {
  const d = doc.discovery,
    hypothesis = d.hypotheses.find((h) => h.id === d.selectedHypothesisId),
    script = d.scripts.find((s) => s.id === d.selectedScriptId),
    [interviewId, setInterviewId] = useState(""),
    [withdrawId, setWithdrawId] = useState<string | null>(null);
  const interview = doc.interviews.find((i) => i.id === (interviewId || doc.interviews.at(-1)?.id));
  const edit = (fn: (next: DiscoveryDocument) => void) => update((next) => fn(next.discovery));
  if (step === 0)
    return (
      <div className="space-y-5">
        <GuestField
          label="What is your problem space?"
          value={d.frame.problem}
          max={3000}
          onChange={(v) =>
            edit((n) => {
              n.frame.problem = v;
            })
          }
          hint="Describe a situation people experience. Keep the solution separate from what you have observed."
        />
        <GuestField
          label="What is your solution idea?"
          value={d.frame.solution}
          max={3000}
          onChange={(v) =>
            edit((n) => {
              n.frame.solution = v;
            })
          }
          hint="An idea is a starting assumption, not evidence that someone needs or will pay for it."
        />
        <aside className="rounded-xl bg-primary/5 p-5 text-sm">
          Start with one useful conversation. You can change direction after learning something
          unexpected. No interview or demand is counted by completing this form.
        </aside>
      </div>
    );
  if (step === 1)
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Write your own first falsifiable hypothesis before feedback. A useful hypothesis names an
          observable behavior, a setting and something that could prove it wrong. AI feedback and
          adjacent suggestions are not enabled in this class.
        </p>
        <div className="grid gap-5 xl:grid-cols-2">
          {hypothesisFields.map(([key, label, max]) => (
            <GuestField
              key={key}
              label={label}
              value={d.hypothesisDraft[key]}
              max={max}
              onChange={(v) =>
                edit((n) => {
                  n.hypothesisDraft[key] = v;
                })
              }
            />
          ))}
        </div>
        <Button
          disabled={!hypothesisReady(d.hypothesisDraft) || d.hypotheses.length >= 20}
          onClick={() =>
            edit((n) => {
              const h = {
                ...n.hypothesisDraft,
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
              };
              n.hypotheses.push(h);
              n.selectedHypothesisId = h.id;
            })
          }
        >
          {d.hypotheses.length
            ? "Preserve a new hypothesis / pivot"
            : "Preserve my first hypothesis"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Preserved versions cannot be overwritten. Save activity to keep a new version after
          closing this page.
        </p>
        {d.hypotheses.map((h, i) => (
          <article key={h.id} className="rounded-xl border p-5">
            <p className="font-semibold">
              Version {i + 1}
              {i === 0 ? " · your first attempt" : " · a new attempt"}
              {h.id === d.selectedHypothesisId ? " · selected" : ""}
            </p>
            <p className="my-3 text-sm">
              {h.population} · {h.situation}
              <br />
              {h.prediction}
              <br />
              Weaker if: {h.disconfirming}
              <br />
              Window: {h.timeWindow}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                edit((n) => {
                  n.selectedHypothesisId = h.id;
                  n.hypothesisDraft = {
                    population: h.population,
                    situation: h.situation,
                    prediction: h.prediction,
                    disconfirming: h.disconfirming,
                    timeWindow: h.timeWindow,
                    reason: h.reason,
                  };
                })
              }
            >
              Use hypothesis {i + 1} as starting draft
            </Button>
          </article>
        ))}
      </div>
    );
  if (step === 2)
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Map up to five people you can reach. Use aliases or roles. Knowing you is different from
          having experienced the problem; no email or identifying profile is needed.
        </p>
        {d.people.map((p, i) => (
          <article key={p.id} className="rounded-xl border p-5">
            <h3 className="mb-4 font-semibold">Reachable person {i + 1}</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              {(
                [
                  ["alias", "Person alias / role", 120],
                  ["relationship", "How do you know them?", 500],
                  ["relevance", "What relevant experience do they have?", 1000],
                ] as const
              ).map(([key, label, max]) => (
                <GuestField
                  key={key}
                  label={`${label} ${i + 1}`}
                  value={p[key]}
                  max={max}
                  onChange={(v) =>
                    edit((n) => {
                      n.people[i]![key] = v;
                    })
                  }
                />
              ))}
            </div>
            <Button
              className="mt-3"
              variant="ghost"
              size="sm"
              onClick={() =>
                edit((n) => {
                  n.people.splice(i, 1);
                })
              }
            >
              Remove person {i + 1} from this plan
            </Button>
          </article>
        ))}
        <Button
          variant="outline"
          disabled={d.people.length >= 5}
          onClick={() =>
            edit((n) => {
              n.people.push({
                id: crypto.randomUUID(),
                alias: "",
                relationship: "",
                relevance: "",
                contactId: null,
                falsePositive: "",
                falseNegative: "",
                mitigation: "",
              });
            })
          }
        >
          Add a reachable person ({d.people.length}/5)
        </Button>
        <p className="text-xs text-muted-foreground">
          Five is a planning scaffold, not proof that the sample represents a market.
        </p>
      </div>
    );
  if (step === 3)
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          A false positive might be polite praise from someone helping you. A false negative might
          come from someone outside the problem situation. These are sampling risks, never judgments
          about a person.
        </p>
        {d.people.length === 0 && (
          <p>Add aliases in “Map five people” before mapping their sampling risks.</p>
        )}
        {d.people.map((p, i) => (
          <article key={p.id} className="rounded-xl border p-5">
            <h3 className="mb-4 font-semibold">{p.alias || `Person ${i + 1}`}</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              {(
                [
                  ["falsePositive", "What might create a false positive?"],
                  ["falseNegative", "What might create a false negative?"],
                  ["mitigation", "How will you reduce this risk?"],
                ] as const
              ).map(([key, label]) => (
                <GuestField
                  key={key}
                  label={`${label} Person ${i + 1}`}
                  value={p[key]}
                  max={1000}
                  onChange={(v) =>
                    edit((n) => {
                      n.people[i]![key] = v;
                    })
                  }
                />
              ))}
            </div>
          </article>
        ))}
        <GuestField
          label="Whose perspective is missing?"
          value={d.missingPerspectives}
          onChange={(v) =>
            edit((n) => {
              n.missingPerspectives = v;
            })
          }
        />
      </div>
    );
  if (step === 4)
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Ask about a recent real situation, its consequences and existing workarounds. Invite
          disagreement before explaining the solution. Editing a draft creates a new version when
          you preserve it.
        </p>
        <GuestSelect
          label="Hypothesis for the next script"
          value={d.selectedHypothesisId ?? ""}
          onChange={(v) =>
            edit((n) => {
              n.selectedHypothesisId = v || null;
            })
          }
        >
          <option value="">Preserve and choose a hypothesis first</option>
          {d.hypotheses.map((h, i) => (
            <option key={h.id} value={h.id}>
              Hypothesis {i + 1}: {h.prediction.slice(0, 90)}
            </option>
          ))}
        </GuestSelect>
        <GuestField
          label="Script title"
          value={d.scriptDraft.title}
          max={120}
          onChange={(v) =>
            edit((n) => {
              n.scriptDraft.title = v;
            })
          }
        />
        <GuestField
          label="Opening and permission request"
          value={d.scriptDraft.opening}
          max={1500}
          onChange={(v) =>
            edit((n) => {
              n.scriptDraft.opening = v;
            })
          }
        />
        <GuestField
          label="Interview questions (one per line)"
          value={d.scriptDraft.questions.join("\n")}
          max={20000}
          onChange={(v) =>
            edit((n) => {
              n.scriptDraft.questions = v.split("\n");
            })
          }
          hint="Up to 20 questions, 1,000 characters each. Empty lines are removed when you preserve."
        />
        <GuestField
          label="Closing question"
          value={d.scriptDraft.closing}
          max={1500}
          onChange={(v) =>
            edit((n) => {
              n.scriptDraft.closing = v;
            })
          }
        />
        <Button
          disabled={
            !hypothesis || !d.scriptDraft.questions.some((q) => q.trim()) || d.scripts.length >= 20
          }
          onClick={() =>
            edit((n) => {
              if (!n.selectedHypothesisId) return;
              const s = {
                ...n.scriptDraft,
                questions: n.scriptDraft.questions.map((q) => q.trim()).filter(Boolean),
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                hypothesisId: n.selectedHypothesisId,
                contextIds: n.contexts
                  .filter(
                    (c) =>
                      c.reviewedAt &&
                      c.permission === "own_or_permitted" &&
                      !n.excludedContextIds.includes(c.id),
                  )
                  .map((c) => c.id),
              };
              n.scripts.push(s);
              n.selectedScriptId = s.id;
            })
          }
        >
          Preserve this script version
        </Button>
        <p className="text-xs text-muted-foreground">
          Only reviewed, permitted, non-excluded context captures are linked to this version. No
          content is generated or fetched.
        </p>
        {d.scripts.map((s, i) => (
          <article key={s.id} className="rounded-xl border p-5">
            <p className="font-semibold">
              Script {i + 1} · {s.title || "Untitled"}
              {s.id === d.selectedScriptId ? " · selected" : ""}
            </p>
            <ol className="my-3 list-inside list-decimal space-y-2 text-sm">
              {s.questions.map((q, j) => (
                <li key={j}>{q}</li>
              ))}
            </ol>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                edit((n) => {
                  n.selectedScriptId = s.id;
                  n.scriptDraft = {
                    title: s.title,
                    opening: s.opening,
                    questions: [...s.questions],
                    closing: s.closing,
                  };
                })
              }
            >
              Select script {i + 1} / copy to editable draft
            </Button>
          </article>
        ))}
      </div>
    );
  if (step === 5)
    return (
      <div className="space-y-5">
        <aside className="rounded-xl bg-primary/5 p-5 text-sm">
          Save activity, then use Export activity PDFs below to print the exact preserved script and
          blank interview worksheet. Go and conduct the real conversation. Preparing, printing or
          saving a draft never counts as interviewing.
        </aside>
        <GuestSelect
          label="Exact script for an interview"
          value={d.selectedScriptId ?? ""}
          onChange={(v) =>
            edit((n) => {
              n.selectedScriptId = v || null;
            })
          }
        >
          <option value="">Choose a preserved script</option>
          {d.scripts.map((s, i) => (
            <option key={s.id} value={s.id}>
              Script {i + 1}: {s.title || "Untitled"}
            </option>
          ))}
        </GuestSelect>
        {shared ? (
          <p className="rounded-xl border p-5 text-sm">
            This is a team-shared planning space. Raw interviews and participant quotes stay in your
            separate principal-private activity. Create or open that activity above to capture a
            conversation.
          </p>
        ) : (
          <>
            <Button
              disabled={
                !script ||
                script.contextIds.some((id) => d.excludedContextIds.includes(id)) ||
                doc.interviews.length >= 20
              }
              onClick={() => {
                if (!script) return;
                const id = crypto.randomUUID();
                update((n) => {
                  n.interviews.push({
                    id,
                    alias: "",
                    scriptId: script.id,
                    capturedAt: new Date().toISOString(),
                    completed: false,
                    answers: script.questions.map((q) => ({ q, note: "", quote: "" })),
                    choices: { note: "unknown", ai: "unknown", sharing: "unknown", revision: 1 },
                  });
                });
                setInterviewId(id);
              }}
            >
              Start a private interview draft
            </Button>
            {doc.interviews.length > 0 && (
              <GuestSelect
                label="Saved or current interview draft"
                value={interview?.id ?? ""}
                onChange={setInterviewId}
              >
                {doc.interviews.map((i, j) => (
                  <option key={i.id} value={i.id}>
                    Interview {j + 1} · {i.alias || "Alias not entered"} ·{" "}
                    {i.completed ? "completed" : "draft"}
                  </option>
                ))}
              </GuestSelect>
            )}
            {interview && (
              <article className="space-y-5 rounded-xl border p-5">
                <p className="text-sm font-semibold">
                  {interview.completed
                    ? "Completed report · exact answers preserved"
                    : "Private draft · not a completed conversation"}
                </p>
                <GuestField
                  label="Interview alias / role"
                  value={interview.alias}
                  max={120}
                  disabled={interview.completed}
                  onChange={(v) =>
                    update((n) => {
                      n.interviews.find((i) => i.id === interview.id)!.alias = v;
                    })
                  }
                />
                <div className="grid gap-4 xl:grid-cols-3">
                  {(
                    [
                      ["note", "Permission to take notes"],
                      ["ai", "Permission for external AI processing"],
                      ["sharing", "Permission to share selected interview material"],
                    ] as const
                  ).map(([key, label]) => (
                    <GuestChoice
                      key={key}
                      label={label}
                      value={interview.choices[key]}
                      disabled={
                        key === "note" &&
                        (interview.completed || interview.answers.some((a) => a.note || a.quote))
                      }
                      onChange={(v) =>
                        update((n) => {
                          n.interviews.find((i) => i.id === interview.id)!.choices[key] = v;
                        })
                      }
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  These are separate owner-reported choices, not independent verification of
                  consent. AI remains off even if permission is reported. Changing sharing does not
                  itself grant anyone access.
                </p>
                {interview.answers.map((a, j) => (
                  <section key={j} className="space-y-4 rounded-lg bg-muted/40 p-4">
                    <h3 className="font-semibold">
                      {j + 1}. {a.q}
                    </h3>
                    <GuestField
                      label={`Question ${j + 1}: observation / notes`}
                      value={a.note}
                      max={4000}
                      disabled={interview.completed || interview.choices.note !== "granted"}
                      onChange={(v) =>
                        update((n) => {
                          n.interviews.find((i) => i.id === interview.id)!.answers[j]!.note = v;
                        })
                      }
                    />
                    <GuestField
                      label={`Question ${j + 1}: exact quote (only if accurate)`}
                      value={a.quote}
                      disabled={interview.completed || interview.choices.note !== "granted"}
                      onChange={(v) =>
                        update((n) => {
                          n.interviews.find((i) => i.id === interview.id)!.answers[j]!.quote = v;
                        })
                      }
                    />
                  </section>
                ))}
                {!interview.completed && (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={interview.completed}
                      disabled={interview.choices.note !== "granted"}
                      onChange={(e) => {
                        if (e.target.checked)
                          update((n) => {
                            n.interviews.find((i) => i.id === interview.id)!.completed = true;
                          });
                      }}
                    />
                    I conducted this conversation and reviewed these exact answers. Preserve them as
                    a completed report when I save.
                  </label>
                )}
                <Button variant="outline" size="sm" onClick={() => setWithdrawId(interview.id)}>
                  Withdraw and clear this interview's notes
                </Button>
                {withdrawId === interview.id && (
                  <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
                    <p>
                      Clear all answers and dependent result text, remove completion, and mark
                      note/AI/sharing choices withdrawn? Previously downloaded or submitted copies
                      are not recalled. Withdraw reviewed copies separately below. Save activity to
                      keep this change.
                    </p>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        update((n) => {
                          const target = n.interviews.find((i) => i.id === interview.id)!;
                          target.completed = false;
                          target.answers = target.answers.map((a) => ({
                            ...a,
                            note: "",
                            quote: "",
                          }));
                          target.choices = {
                            ...target.choices,
                            note: "withdrawn",
                            ai: "withdrawn",
                            sharing: "withdrawn",
                          };
                          n.discovery.results = n.discovery.results.map((r) =>
                            r.interviewId === interview.id
                              ? {
                                  ...r,
                                  interviewId: null,
                                  sourceCapturedAt: null,
                                  observation: "",
                                  quote: "",
                                  interpretation: "",
                                  counterevidence: "",
                                }
                              : r,
                          );
                        });
                        setWithdrawId(null);
                      }}
                    >
                      Confirm clear and withdrawal
                    </Button>
                    <Button variant="ghost" onClick={() => setWithdrawId(null)}>
                      Keep this interview
                    </Button>
                  </div>
                )}
              </article>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Separate what happened from what you think it means. Preserve disagreement and uncertainty.
        A favorable answer is not observed use, payment or product-market fit.
      </p>
      {d.results.map((r, i) => (
        <article key={r.id} className="space-y-4 rounded-xl border p-5">
          <h3 className="font-semibold">Observation {i + 1}</h3>
          {!shared && (
            <GuestSelect
              label={`Source for observation ${i + 1}`}
              value={r.interviewId ?? ""}
              onChange={(v) =>
                edit((n) => {
                  const target = n.results[i]!;
                  const source = doc.interviews.find(
                    (t) => t.id === v && t.completed && t.choices.note === "granted",
                  );
                  target.interviewId = source?.id ?? null;
                  target.scriptId = source?.scriptId ?? n.selectedScriptId;
                  target.sourceCapturedAt = source?.capturedAt ?? null;
                })
              }
            >
              <option value="">Manual observation · not a completed interview record</option>
              {doc.interviews
                .filter((t) => t.completed && t.choices.note === "granted")
                .map((t, j) => (
                  <option key={t.id} value={t.id}>
                    Completed report {j + 1} · {t.alias || "Alias not entered"}
                  </option>
                ))}
            </GuestSelect>
          )}
          {(
            [
              ["observation", "What happened?", 4000],
              ["quote", "Exact words (only if accurate)", 2000],
              ["interpretation", "Your interpretation", 2000],
              ["counterevidence", "Counterevidence / alternative explanation", 2000],
            ] as const
          )
            .filter(([key]) => !shared || key !== "quote")
            .map(([key, label, max]) => (
              <GuestField
                key={key}
                label={`${label} Observation ${i + 1}`}
                value={r[key]}
                max={max}
                onChange={(v) =>
                  edit((n) => {
                    n.results[i]![key] = v;
                  })
                }
              />
            ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((n) => {
                n.results.splice(i, 1);
              })
            }
          >
            Remove observation {i + 1}
          </Button>
        </article>
      ))}
      <Button
        variant="outline"
        disabled={d.results.length >= 20}
        onClick={() =>
          edit((n) => {
            n.results.push({
              id: crypto.randomUUID(),
              interviewId: null,
              scriptId: n.selectedScriptId,
              sourceCapturedAt: null,
              observation: "",
              quote: "",
              interpretation: "",
              counterevidence: "",
            });
          })
        }
      >
        Add an observation
      </Button>
      <GuestSelect
        label="What will you do next?"
        value={d.reflection.decision ?? ""}
        onChange={(v) =>
          edit((n) => {
            n.reflection.decision =
              v === "retain" || v === "narrow" || v === "pivot" || v === "test" || v === "stop"
                ? v
                : null;
          })
        }
      >
        <option value="">Not decided</option>
        <option value="retain">Retain the current direction</option>
        <option value="narrow">Narrow the audience or problem</option>
        <option value="pivot">Pivot the approach</option>
        <option value="test">Test another uncertainty</option>
        <option value="stop">Stop this direction</option>
      </GuestSelect>
      {(
        [
          ["reason", "Why this decision?"],
          ["productChange", "Actionable product next step"],
          ["nextTest", "Next small test: behavior, people and time"],
          ["uncertainty", "What remains unknown?"],
        ] as const
      ).map(([key, label]) => (
        <GuestField
          key={key}
          label={label}
          value={d.reflection[key]}
          onChange={(v) =>
            edit((n) => {
              n.reflection[key] = v;
            })
          }
        />
      ))}
    </div>
  );
}
