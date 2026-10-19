import { GuestField as F, GuestSelect as S } from "@/components/guest/GuestFields";
import { Button } from "@/components/ui/button";
import { createEmptyGuestGrowth, type GuestGrowthDocument } from "@/lib/guest-growth/contracts";
export function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold">
      {label}
      <input
        aria-label={label}
        className="min-h-11 w-full rounded-xl border bg-background px-3 font-normal"
        inputMode="numeric"
        placeholder="Unknown"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(null);
          else if (/^(0|[1-9]\d*)$/.test(v) && Number(v) <= 1000000) onChange(Number(v));
        }}
      />
      <span className="block text-xs font-normal text-muted-foreground">
        Leave blank for unknown; zero is a reported zero.
      </span>
    </label>
  );
}
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold">
      {label}
      <input
        aria-label={label}
        type="date"
        className="min-h-11 w-full rounded-xl border bg-background px-3 font-normal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  );
}
function Choices<T extends string>({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <S
      label={label}
      value={value}
      onChange={(v) => {
        const found = values.find((x) => x === v);
        if (found) onChange(found);
      }}
    >
      {values.map((v) => (
        <option key={v} value={v}>
          {v.replaceAll("_", " ")}
        </option>
      ))}
    </S>
  );
}
function Row({
  title,
  children,
  remove,
}: {
  title: string;
  children: React.ReactNode;
  remove: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{title}</h4>
        <button
          type="button"
          className="min-h-10 text-sm text-muted-foreground underline"
          onClick={remove}
        >
          Remove {title.toLowerCase()}
        </button>
      </div>
      {children}
    </div>
  );
}
export function GrowthEditor({
  document: d,
  onChange,
}: {
  document: GuestGrowthDocument;
  onChange: (d: GuestGrowthDocument) => void;
}) {
  switch (d.kind) {
    case "learning": {
      const edit = (next: typeof d) =>
        onChange({ ...next, reviewState: "draft", reviewedAt: null });
      return (
        <div className="space-y-6">
          <Choices
            label="Learning form"
            value={d.form}
            values={["learning", "synthesis"]}
            onChange={(form) => edit({ ...d, form })}
          />
          <F
            label="Deidentified observation summary"
            value={d.observations}
            max={3000}
            hint="Summarize in your own words. Do not paste private interview notes or participant quotes."
            onChange={(observations) => edit({ ...d, observations })}
          />
          <F
            label="Your interpretation"
            value={d.interpretation}
            max={3000}
            onChange={(interpretation) => edit({ ...d, interpretation })}
          />
          {d.patterns.map((p, i) => (
            <Row
              key={i}
              title={`Pattern ${i + 1}`}
              remove={() => edit({ ...d, patterns: d.patterns.filter((_, j) => j !== i) })}
            >
              <F
                label={`Pattern ${i + 1} observation`}
                value={p.observationSummary}
                max={1200}
                onChange={(v) =>
                  edit({
                    ...d,
                    patterns: d.patterns.map((x, j) =>
                      j === i ? { ...x, observationSummary: v } : x,
                    ),
                  })
                }
              />
              <F
                label={`Pattern ${i + 1} interpretation`}
                value={p.interpretation}
                max={1200}
                onChange={(v) =>
                  edit({
                    ...d,
                    patterns: d.patterns.map((x, j) => (j === i ? { ...x, interpretation: v } : x)),
                  })
                }
              />
              <F
                label={`Pattern ${i + 1} limitations`}
                value={p.limitations}
                max={1000}
                onChange={(v) =>
                  edit({
                    ...d,
                    patterns: d.patterns.map((x, j) => (j === i ? { ...x, limitations: v } : x)),
                  })
                }
              />
            </Row>
          ))}
          <Button
            variant="outline"
            disabled={d.patterns.length >= 8}
            onClick={() =>
              edit({
                ...d,
                patterns: [
                  ...d.patterns,
                  { observationSummary: "", interpretation: "", limitations: "" },
                ],
              })
            }
          >
            Add authored pattern
          </Button>
          <F
            label="Objections — one per line (up to 8)"
            value={d.objections.join("\n")}
            max={8007}
            onChange={(v) => {
              const rows = v === "" ? [] : v.split("\n");
              if (rows.length <= 8 && rows.every((s) => Array.from(s).length <= 1000))
                edit({ ...d, objections: rows });
            }}
          />
          <F
            label="Best-fit hypotheses — one per line (up to 8)"
            value={d.bestFit.join("\n")}
            max={8007}
            onChange={(v) => {
              const rows = v === "" ? [] : v.split("\n");
              if (rows.length <= 8 && rows.every((s) => Array.from(s).length <= 1000))
                edit({ ...d, bestFit: rows });
            }}
          />
          <div className="grid gap-5 xl:grid-cols-2">
            <F
              label="What contradicts this?"
              value={d.counterevidence}
              onChange={(counterevidence) => edit({ ...d, counterevidence })}
            />
            <F
              label="What remains uncertain?"
              value={d.uncertainty}
              onChange={(uncertainty) => edit({ ...d, uncertainty })}
            />
          </div>
          {d.proposedChanges.map((c, i) => (
            <Row
              key={i}
              title={`Proposed change ${i + 1}`}
              remove={() =>
                edit({ ...d, proposedChanges: d.proposedChanges.filter((_, j) => j !== i) })
              }
            >
              <F
                label={`Change ${i + 1} title`}
                value={c.title}
                max={120}
                onChange={(v) =>
                  edit({
                    ...d,
                    proposedChanges: d.proposedChanges.map((x, j) =>
                      j === i ? { ...x, title: v } : x,
                    ),
                  })
                }
              />
              <F
                label={`Change ${i + 1} reason`}
                value={c.reason}
                max={1000}
                onChange={(v) =>
                  edit({
                    ...d,
                    proposedChanges: d.proposedChanges.map((x, j) =>
                      j === i ? { ...x, reason: v } : x,
                    ),
                  })
                }
              />
              <F
                label={`Change ${i + 1} next step`}
                value={c.nextStep}
                max={1000}
                onChange={(v) =>
                  edit({
                    ...d,
                    proposedChanges: d.proposedChanges.map((x, j) =>
                      j === i ? { ...x, nextStep: v } : x,
                    ),
                  })
                }
              />
            </Row>
          ))}
          <Button
            variant="outline"
            disabled={d.proposedChanges.length >= 8}
            onClick={() =>
              edit({
                ...d,
                proposedChanges: [...d.proposedChanges, { title: "", reason: "", nextStep: "" }],
              })
            }
          >
            Add proposed change
          </Button>
          <F
            label="Your next falsifiable test"
            value={d.nextTest}
            onChange={(nextTest) => edit({ ...d, nextTest })}
          />
          <div className="rounded-xl border bg-primary/5 p-4">
            <p className="text-sm">
              Reported review: <strong>{d.reviewState}</strong>
              {d.reviewedAt ? ` · ${d.reviewedAt}` : ""}. Editing resets this report; it does not
              verify learning.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              disabled={!d.title.trim() || !d.interpretation.trim() || !d.nextTest.trim()}
              onClick={() =>
                onChange({ ...d, reviewState: "reviewed", reviewedAt: new Date().toISOString() })
              }
            >
              Mark my review complete
            </Button>
          </div>
        </div>
      );
    }
    case "experiment":
      return (
        <div className="space-y-6">
          <F
            label="Falsifiable experiment hypothesis"
            value={d.hypothesis}
            onChange={(hypothesis) => onChange({ ...d, hypothesis })}
          />
          <F
            label="One change to test"
            value={d.change}
            onChange={(change) => onChange({ ...d, change })}
          />
          <F
            label="Relevant experiment audience"
            value={d.audience}
            max={1500}
            onChange={(audience) => onChange({ ...d, audience })}
          />
          <F
            label="Procedure — what will you actually do?"
            value={d.procedure}
            max={3000}
            onChange={(procedure) => onChange({ ...d, procedure })}
          />
          <F
            label="Primary experiment measure"
            value={d.criterion.measure}
            max={1000}
            onChange={(measure) => onChange({ ...d, criterion: { ...d.criterion, measure } })}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <CountField
              label="Experiment baseline"
              value={d.criterion.baseline}
              onChange={(baseline) => onChange({ ...d, criterion: { ...d.criterion, baseline } })}
            />
            <CountField
              label="Experiment target"
              value={d.criterion.target}
              onChange={(target) => onChange({ ...d, criterion: { ...d.criterion, target } })}
            />
            <Choices
              label="Experiment unit"
              value={d.criterion.unit}
              values={["people", "sessions", "events", "other", "unknown"]}
              onChange={(unit) => onChange({ ...d, criterion: { ...d.criterion, unit } })}
            />
          </div>
          {(["repeatIf", "reviseIf", "stopIf"] as const).map((k) => (
            <F
              key={k}
              label={
                k === "repeatIf"
                  ? "Repeat the experiment if…"
                  : k === "reviseIf"
                    ? "Revise the experiment if…"
                    : "Stop the experiment if…"
              }
              value={d.criterion[k]}
              max={1000}
              onChange={(v) => onChange({ ...d, criterion: { ...d.criterion, [k]: v } })}
            />
          ))}
          <DateField
            label="Experiment review date"
            value={d.criterion.reviewOn}
            onChange={(reviewOn) => onChange({ ...d, criterion: { ...d.criterion, reviewOn } })}
          />
          <div className="space-y-5 rounded-2xl border bg-muted/30 p-5">
            <h4 className="text-lg font-bold">Report what happened separately</h4>
            <p className="text-sm text-muted-foreground">
              These are your reports, not independently observed outcomes. Keep predicted results in
              the hypothesis.
            </p>
            <Choices
              label="Reported experiment state"
              value={d.state}
              values={["planned", "running_reported", "completed_reported", "stopped_reported"]}
              onChange={(state) => {
                if (state === "planned") {
                  if (
                    d.state !== "planned" &&
                    !window.confirm(
                      "Clear the local reported outcome and return this draft to planned? Saved revisions remain separate.",
                    )
                  )
                    return;
                  const blank = createEmptyGuestGrowth("experiment");
                  onChange({
                    ...d,
                    state,
                    reportedStartOn: null,
                    reportedResult: blank.reportedResult,
                  });
                } else onChange({ ...d, state });
              }}
            />
            {d.state !== "planned" && (
              <>
                <DateField
                  label="Reported experiment start"
                  value={d.reportedStartOn}
                  onChange={(reportedStartOn) => onChange({ ...d, reportedStartOn })}
                />
                <F
                  label="Reported experiment result"
                  value={d.reportedResult.summary}
                  max={3000}
                  onChange={(summary) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, summary } })
                  }
                />
                <DateField
                  label="Experiment result reported on"
                  value={d.reportedResult.reportedOn}
                  onChange={(reportedOn) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, reportedOn } })
                  }
                />
                <CountField
                  label="Reported experiment count"
                  value={d.reportedResult.count}
                  onChange={(count) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, count } })
                  }
                />
                <F
                  label="Experiment result limitations"
                  value={d.reportedResult.limitations}
                  onChange={(limitations) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, limitations } })
                  }
                />
                <Choices
                  label="Reported experiment decision"
                  value={d.reportedResult.decision}
                  values={["unknown", "repeat", "revise", "stop"]}
                  onChange={(decision) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, decision } })
                  }
                />
                <F
                  label="Experiment next action"
                  value={d.reportedResult.nextAction}
                  onChange={(nextAction) =>
                    onChange({ ...d, reportedResult: { ...d.reportedResult, nextAction } })
                  }
                />
              </>
            )}
          </div>
        </div>
      );
    case "pipeline_contact":
      return (
        <div className="space-y-5">
          <F
            label="Contact alias or role"
            value={d.alias}
            max={80}
            hint="Use a non-identifying role or alias. No email addresses, phone numbers or profiles."
            onChange={(alias) => onChange({ ...d, alias })}
          />
          <Choices
            label="Relationship to this alias"
            value={d.relationship}
            values={["unknown", "friend", "classmate", "introduced", "community", "other"]}
            onChange={(relationship) => onChange({ ...d, relationship })}
          />
          <F
            label="Relevant experience"
            value={d.relevantExperience}
            max={1500}
            onChange={(relevantExperience) => onChange({ ...d, relevantExperience })}
          />
          <F
            label="Why this alias fits"
            value={d.fitReason}
            max={1500}
            onChange={(fitReason) => onChange({ ...d, fitReason })}
          />
          <F
            label="How you found this alias"
            value={d.source}
            max={1000}
            onChange={(source) => onChange({ ...d, source })}
          />
          <Choices
            label="Reported pipeline status"
            value={d.status}
            values={["to_contact", "contacted", "replied", "tried", "active", "paying"]}
            onChange={(status) => onChange({ ...d, status })}
          />
          <DateField
            label="Pipeline status reported on"
            value={d.reportedOn}
            onChange={(reportedOn) => onChange({ ...d, reportedOn })}
          />
          <F
            label="Basis for this reported status"
            value={d.statusBasis}
            max={1500}
            onChange={(statusBasis) => onChange({ ...d, statusBasis })}
          />
          <F
            label="Pipeline uncertainty"
            value={d.uncertainty}
            max={1500}
            onChange={(uncertainty) => onChange({ ...d, uncertainty })}
          />
          <F
            label="Pipeline next action"
            value={d.nextAction}
            max={1000}
            onChange={(nextAction) => onChange({ ...d, nextAction })}
          />
          <p className="rounded-xl border p-4 text-sm">
            Tried, active and paying are manually reported statuses. They do not verify use or
            payment.
          </p>
        </div>
      );
    case "survey":
      return (
        <div className="space-y-5">
          <F
            label="Survey purpose"
            value={d.purpose}
            max={1500}
            onChange={(purpose) => onChange({ ...d, purpose })}
          />
          <F
            label="Survey audience"
            value={d.audience}
            max={1500}
            onChange={(audience) => onChange({ ...d, audience })}
          />
          <F
            label="Survey introduction"
            value={d.introduction}
            onChange={(introduction) => onChange({ ...d, introduction })}
          />
          <F
            label="Survey permission reminder"
            value={d.permissionReminder}
            max={1000}
            onChange={(permissionReminder) => onChange({ ...d, permissionReminder })}
          />
          <p className="rounded-xl border bg-primary/5 p-4 text-sm">
            Unsent question drafts. This app does not host a survey or collect responses.
          </p>
          {d.questions.map((q, i) => (
            <Row
              key={q.id}
              title={`Survey question ${i + 1}`}
              remove={() => onChange({ ...d, questions: d.questions.filter((x) => x.id !== q.id) })}
            >
              <F
                label={`Survey question ${i + 1} prompt`}
                value={q.prompt}
                max={1000}
                onChange={(prompt) =>
                  onChange({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...x, prompt } : x)),
                  })
                }
              />
              <F
                label={`Survey question ${i + 1} purpose`}
                value={q.purpose}
                max={500}
                onChange={(purpose) =>
                  onChange({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...x, purpose } : x)),
                  })
                }
              />
              <Choices
                label={`Survey question ${i + 1} format`}
                value={q.format}
                values={["open_text", "single_choice", "scale"]}
                onChange={(format) => {
                  const base = { id: q.id, prompt: q.prompt, purpose: q.purpose };
                  const next =
                    format === "open_text"
                      ? { ...base, format }
                      : format === "single_choice"
                        ? { ...base, format, options: ["", ""] }
                        : {
                            ...base,
                            format,
                            minimum: 1 as const,
                            maximum: 5 as const,
                            lowLabel: "",
                            highLabel: "",
                          };
                  onChange({ ...d, questions: d.questions.map((x) => (x.id === q.id ? next : x)) });
                }}
              />
              {q.format === "single_choice" && (
                <>
                  <F
                    label={`Survey question ${i + 1} options — one per line`}
                    value={q.options.join("\n")}
                    max={725}
                    onChange={(v) => {
                      const options = v.split("\n");
                      if (options.length <= 6 && options.every((x) => Array.from(x).length <= 120))
                        onChange({
                          ...d,
                          questions: d.questions.map((x) =>
                            x.id === q.id ? { ...q, options } : x,
                          ),
                        });
                    }}
                    hint="Use 2–6 distinct non-empty options."
                  />
                </>
              )}
              {q.format === "scale" && (
                <>
                  <Choices
                    label={`Survey question ${i + 1} scale maximum`}
                    value={String(q.maximum) as "5" | "7"}
                    values={["5", "7"]}
                    onChange={(v) =>
                      onChange({
                        ...d,
                        questions: d.questions.map((x) =>
                          x.id === q.id ? { ...q, maximum: v === "5" ? 5 : 7 } : x,
                        ),
                      })
                    }
                  />
                  <F
                    label={`Survey question ${i + 1} low label (1)`}
                    value={q.lowLabel}
                    max={120}
                    onChange={(lowLabel) =>
                      onChange({
                        ...d,
                        questions: d.questions.map((x) => (x.id === q.id ? { ...q, lowLabel } : x)),
                      })
                    }
                  />
                  <F
                    label={`Survey question ${i + 1} high label`}
                    value={q.highLabel}
                    max={120}
                    onChange={(highLabel) =>
                      onChange({
                        ...d,
                        questions: d.questions.map((x) =>
                          x.id === q.id ? { ...q, highLabel } : x,
                        ),
                      })
                    }
                  />
                </>
              )}
            </Row>
          ))}
          <Button
            variant="outline"
            disabled={d.questions.length >= 12}
            onClick={() =>
              onChange({
                ...d,
                questions: [
                  ...d.questions,
                  { id: crypto.randomUUID(), format: "open_text", prompt: "", purpose: "" },
                ],
              })
            }
          >
            Add survey question
          </Button>
        </div>
      );
    case "referral":
      return (
        <div className="space-y-5">
          <F
            label="Referral recipient alias"
            value={d.recipientAlias}
            max={80}
            onChange={(recipientAlias) => onChange({ ...d, recipientAlias })}
          />
          <F
            label="Referral recipient role"
            value={d.recipientRole}
            max={500}
            onChange={(recipientRole) => onChange({ ...d, recipientRole })}
          />
          <F
            label="Who would be a relevant introduction?"
            value={d.relevantPersonCriteria}
            max={1500}
            onChange={(relevantPersonCriteria) => onChange({ ...d, relevantPersonCriteria })}
          />
          <F
            label="Referral builder disclosure"
            value={d.builderDisclosure}
            max={1000}
            onChange={(builderDisclosure) => onChange({ ...d, builderDisclosure })}
          />
          <F
            label="Referral context"
            value={d.context}
            max={1500}
            onChange={(context) => onChange({ ...d, context })}
          />
          <F
            label="Specific referral ask"
            value={d.specificAsk}
            onChange={(specificAsk) => onChange({ ...d, specificAsk })}
          />
          <F
            label="Referral message draft"
            value={d.body}
            max={4000}
            onChange={(body) => onChange({ ...d, body })}
          />
          <F
            label="Respectful referral exit"
            value={d.respectfulExit}
            max={1000}
            onChange={(respectfulExit) => onChange({ ...d, respectfulExit })}
          />
          <p className="rounded-xl border bg-primary/5 p-4 text-sm">
            Unsent draft. You choose whether and how to approach someone outside this app.
          </p>
        </div>
      );
    case "onboarding":
      return (
        <div className="space-y-5">
          <F
            label="Onboarding audience"
            value={d.audience}
            max={1500}
            onChange={(audience) => onChange({ ...d, audience })}
          />
          <F
            label="User goal"
            value={d.userGoal}
            max={1500}
            onChange={(userGoal) => onChange({ ...d, userGoal })}
          />
          <F
            label="First useful action"
            value={d.firstAction}
            max={1500}
            onChange={(firstAction) => onChange({ ...d, firstAction })}
          />
          <F
            label="What would you observe as success?"
            value={d.successObservationPlan}
            max={1500}
            onChange={(successObservationPlan) => onChange({ ...d, successObservationPlan })}
          />
          <F
            label="Walkthrough prompt"
            value={d.walkthroughPrompt}
            onChange={(walkthroughPrompt) => onChange({ ...d, walkthroughPrompt })}
          />
          <F
            label="Anticipated hesitation"
            value={d.anticipatedHesitation}
            max={1500}
            onChange={(anticipatedHesitation) => onChange({ ...d, anticipatedHesitation })}
          />
          <p className="rounded-xl border bg-primary/5 p-4 text-sm">
            Unsent research prompts. No session is tracked and no answers are collected here.
          </p>
          {d.questions.map((q, i) => (
            <Row
              key={q.id}
              title={`Onboarding question ${i + 1}`}
              remove={() => onChange({ ...d, questions: d.questions.filter((x) => x.id !== q.id) })}
            >
              <Choices
                label={`Onboarding question ${i + 1} timing`}
                value={q.when}
                values={["before", "during", "after"]}
                onChange={(when) =>
                  onChange({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...q, when } : x)),
                  })
                }
              />
              <F
                label={`Onboarding question ${i + 1} prompt`}
                value={q.prompt}
                max={1000}
                onChange={(prompt) =>
                  onChange({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...q, prompt } : x)),
                  })
                }
              />
              <F
                label={`Onboarding question ${i + 1} purpose`}
                value={q.purpose}
                max={500}
                onChange={(purpose) =>
                  onChange({
                    ...d,
                    questions: d.questions.map((x) => (x.id === q.id ? { ...q, purpose } : x)),
                  })
                }
              />
            </Row>
          ))}
          <Button
            variant="outline"
            disabled={d.questions.length >= 12}
            onClick={() =>
              onChange({
                ...d,
                questions: [
                  ...d.questions,
                  { id: crypto.randomUUID(), prompt: "", purpose: "", when: "before" },
                ],
              })
            }
          >
            Add onboarding question
          </Button>
        </div>
      );
  }
}
