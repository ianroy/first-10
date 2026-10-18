import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Check, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { discoveryActivities } from "@/lib/export/discovery-adapters";
import { isFictionalExportProject } from "@/lib/export/adapters";
import { useContacts, useInterviews, useRefresh, type Project } from "@/lib/data";
import {
  createEmptyDiscovery,
  discoverySchema,
  hypothesisReady,
  type DiscoveryDocument,
  type DiscoveryRecord,
  type SaveDiscoveryInput,
} from "@/lib/discovery";
import { loadDiscovery, saveDiscovery, adoptDiscoveryScript } from "@/lib/discovery.functions";
import { ContextCaptures } from "./ContextCaptures";
import { RemoteContextPanel } from "./RemoteContextPanel";
const steps = [
  "Frame the idea",
  "Make it testable",
  "Map reachable people",
  "Question your sample",
  "Prepare a script",
  "Go and listen",
  "Decide what follows",
];
const hypothesisFields = [
  ["population", "Specific people or population"],
  ["situation", "Situation they experience"],
  ["prediction", "What do you predict you will observe?"],
  ["disconfirming", "What observation would weaken this hypothesis?"],
  ["timeWindow", "Small test window"],
  ["reason", "Why this attempt or pivot?"],
] as const;
function Field({
  label,
  value,
  onChange,
  max = 2000,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-24"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="min-h-11 w-full rounded-lg border bg-background px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
const errors: Record<string, string> = {
  CONFLICT:
    "This workspace changed in another session. Your draft remains here. Export it, then review/reload the saved version before saving again.",
  IDEMPOTENCY_CONFLICT:
    "This retry no longer matches its original request. Your draft remains here; reload the saved state before another save.",
  SOURCE_UNAVAILABLE:
    "A linked contact, interview or context is unavailable. Unlink that reference while keeping your text, then save again.",
  PRESERVED_VERSION:
    "A saved hypothesis, script or source capture cannot be replaced. Reload, then create a new version.",
  ARCHIVED: "This idea is archived. Restore it in Account before saving.",
  INVALID_DOCUMENT: "Check the workspace fields and limits. Your draft remains here.",
  UNAVAILABLE: "The save could not be confirmed. Keep your draft and retry the identical request.",
  NOT_FOUND: "This owner project is unavailable. Your draft has not been saved.",
  UNAUTHENTICATED: "Sign in again before saving. Your local draft is still here.",
};
export function DiscoveryWorkspace({ project }: { project: Project }) {
  const [doc, setDoc] = useState<DiscoveryDocument>(createEmptyDiscovery);
  const [revision, setRevision] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<DiscoveryRecord["history"]>([]);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [contextDirty, setContextDirty] = useState(false);
  const [remoteContextDirty, setRemoteContextDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [action, setAction] = useState<"reload" | "adopt" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const mounted = useRef(true);
  const pending = useRef<{ fingerprint: string; input: SaveDiscoveryInput } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const contacts = useContacts(project.id),
    interviews = useInterviews(project.id);
  const refresh = useRefresh();
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || contextDirty || remoteContextDirty || busy,
    enableBeforeUnload: dirty || contextDirty || remoteContextDirty || busy,
    withResolver: true,
  });
  const selectedHypothesis = doc.hypotheses.find((h) => h.id === doc.selectedHypothesisId);
  const selectedScript = doc.scripts.find((s) => s.id === doc.selectedScriptId);
  const unavailableContext =
    selectedScript?.contextIds.some((id) => doc.excludedContextIds.includes(id)) ?? false;
  function accept(record: DiscoveryRecord | null) {
    setDoc(record?.document ?? createEmptyDiscovery());
    setRevision(record?.revision ?? 0);
    setSavedAt(record?.savedAt ?? null);
    setHistory(record?.history ?? []);
    setDirty(false);
    setConflict(false);
    pending.current = null;
    setContextIds([]);
    setLoaded(true);
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoaded(false);
    void loadDiscovery({ data: { projectId: project.id } })
      .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          accept(result.workspace);
          setError("");
        } else
          setError("Your saved discovery workspace could not be opened. Try again before editing.");
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [project.id, attempt]);
  function update(fn: (next: DiscoveryDocument) => void) {
    if (busy || !loaded) return;
    setDoc((before) => {
      const next = structuredClone(before);
      fn(next);
      return next;
    });
    setDirty(true);
    setNotice("");
    pending.current = null;
    if (!conflict) setError("");
  }
  async function save() {
    if (busy || !loaded || conflict) return;
    const parsed = discoverySchema.safeParse(doc);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the form fields.");
      return;
    }
    const fingerprint = JSON.stringify({ projectId: project.id, revision, document: parsed.data });
    const input =
      pending.current?.fingerprint === fingerprint
        ? pending.current.input
        : {
            projectId: project.id,
            expectedRevision: revision,
            mutationId: crypto.randomUUID(),
            document: parsed.data,
          };
    pending.current = { fingerprint, input };
    setBusy(true);
    setError("");
    const result = await saveDiscovery({ data: input }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) {
      accept(result);
      setNotice(
        (contextDirty || remoteContextDirty
          ? "Workspace saved, but unadded context text is still local and was not saved. "
          : "Workspace saved. ") +
          "Hypothesis and script versions are retained; no interview or external action was recorded.",
      );
    } else {
      setError(errors[result.code] ?? errors["UNAVAILABLE"]!);
      if (["CONFLICT", "IDEMPOTENCY_CONFLICT", "PRESERVED_VERSION"].includes(result.code))
        setConflict(true);
    }
  }
  async function confirmAction() {
    const current = action;
    setAction(null);
    if (current === "reload") {
      setBusy(true);
      const result = await loadDiscovery({ data: { projectId: project.id } }).catch(
        () => ({ ok: false, code: "UNAVAILABLE" }) as const,
      );
      if (!mounted.current) return;
      setBusy(false);
      if (result.ok) {
        accept(result.workspace);
        setError("");
        setNotice("Saved workspace reloaded. Any unadded context text remains local in its form.");
      } else setError("Reload failed. Your draft is still here.");
    } else if (current === "adopt" && selectedScript) {
      setBusy(true);
      const result = await adoptDiscoveryScript({
        data: {
          projectId: project.id,
          expectedRevision: revision,
          scriptId: selectedScript.id,
          expectedQuestions: project.questions as string[] | null,
          expectedOriginId: project.questions_origin_id,
        },
      }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
      if (!mounted.current) return;
      setBusy(false);
      if (result.ok) {
        refresh("project");
        setNotice(
          "Selected manual questions are ready in Interview. Existing interview answers were not changed. Choose a saved person there and ask permission before taking notes.",
        );
      } else {
        setError(errors[result.code] ?? errors["UNAVAILABLE"]!);
        if (result.code === "CONFLICT") refresh("project");
      }
    }
  }
  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function addHypothesis() {
    if (!hypothesisReady(doc.hypothesisDraft)) return;
    update((d) => {
      const h = {
        ...d.hypothesisDraft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      d.hypotheses.push(h);
      d.selectedHypothesisId = h.id;
    });
  }
  function preserveScript() {
    if (
      !selectedHypothesis ||
      !doc.scriptDraft.questions.length ||
      doc.scriptDraft.questions.some((q) => !q.trim())
    )
      return;
    update((d) => {
      const script = {
        ...structuredClone(d.scriptDraft),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        hypothesisId: selectedHypothesis.id,
        contextIds: contextIds.filter((id) => !d.excludedContextIds.includes(id)),
      };
      d.scripts.push(script);
      d.selectedScriptId = script.id;
    });
  }
  return (
    <AppShell title="Discovery cycle">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Your thinking → a conversation → a clearer next move
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold lg:text-4xl">
            Test an idea. Keep what you learn.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start with your own prediction, notice who your sample might miss, then take a neutral
            script into a real conversation. One honest observation is more useful than a completed
            checklist.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={!loaded || busy || conflict || !dirty}>
            <Save aria-hidden="true" />
            {busy ? "Working…" : "Save workspace"}
          </Button>
          <Button variant="outline" onClick={() => setAction("reload")} disabled={busy || !loaded}>
            Review / reload saved
          </Button>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-secondary px-3 py-1">
          {dirty
            ? "Unsaved changes"
            : savedAt
              ? `Saved revision ${revision}`
              : "No saved workspace yet"}
        </span>
        <span className="rounded-full border px-3 py-1">Private to you · manual work</span>
        <span className="rounded-full border px-3 py-1">
          {doc.people.length} of 5 planning slots used · fewer is fine
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-destructive/40 bg-destructive-soft p-4 text-sm"
        >
          {error}
          {!loaded && (
            <Button variant="outline" className="ml-3" onClick={() => setAttempt((n) => n + 1)}>
              Retry opening workspace
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mb-5 rounded-xl bg-secondary p-4 text-sm">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p role="status" className="py-8">
          {error ? "Saved work is unchanged." : "Opening your discovery workspace…"}
        </p>
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[235px_minmax(0,1fr)]">
            <aside className="rounded-2xl border bg-card p-3 lg:sticky lg:top-24">
              <nav aria-label="Discovery steps" className="space-y-1">
                {steps.map((title, i) => (
                  <button
                    key={title}
                    type="button"
                    aria-current={step === i ? "step" : undefined}
                    onClick={() => go(i)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${step === i ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current/25">
                      {i + 1}
                    </span>
                    {title}
                  </button>
                ))}
              </nav>
              <p className="px-3 pt-5 text-xs leading-relaxed text-muted-foreground">
                Move between steps freely. Optional AI feedback is not connected to this workspace
                yet. No source is sent to a model.
              </p>
            </aside>
            <section className="min-w-0 rounded-2xl border bg-card p-5 lg:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Step {step + 1} of 7
              </p>
              <h2
                ref={heading}
                tabIndex={-1}
                className="mt-2 rounded-sm font-display text-2xl font-bold outline-offset-4"
              >
                {steps[step]}
              </h2>
              <fieldset disabled={busy} className="mt-6 space-y-6">
                {step === 0 && (
                  <>
                    <p className="text-muted-foreground">
                      Describe the problem space before defending a solution. You can revise this
                      frame without erasing your first hypothesis.
                    </p>
                    {!doc.frame.problem &&
                      !doc.frame.solution &&
                      (project.problem?.length ?? 0) <= 3000 &&
                      (project.description?.length ?? 0) <= 3000 && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            update((d) => {
                              d.frame.problem = project.problem ?? "";
                              d.frame.solution = project.description ?? "";
                            })
                          }
                        >
                          Use my saved idea brief as an editable starting point
                        </Button>
                      )}
                    <Field
                      label="Problem space in your own words"
                      value={doc.frame.problem}
                      max={3000}
                      onChange={(v) =>
                        update((d) => {
                          d.frame.problem = v;
                        })
                      }
                    />
                    <Field
                      label="Solution idea to investigate"
                      value={doc.frame.solution}
                      max={3000}
                      onChange={(v) =>
                        update((d) => {
                          d.frame.solution = v;
                        })
                      }
                    />
                    <div className="rounded-xl bg-secondary p-4 text-sm">
                      Your selected app idea is “{project.name}”.{" "}
                      <Link to="/setup" className="font-semibold underline">
                        Edit the app brief
                      </Link>{" "}
                      if that broader description changes.
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <p className="text-muted-foreground">
                      Write a prediction that could be wrong. Preserve your first attempt, then try
                      an adjacent explanation or pivot as a new version. These are your reported
                      entries, not proof of independent authorship.
                    </p>
                    <div className="grid gap-5 xl:grid-cols-2">
                      {hypothesisFields.map(([key, label]) => (
                        <Field
                          key={key}
                          label={label}
                          value={doc.hypothesisDraft[key]}
                          max={["population", "situation", "timeWindow"].includes(key) ? 500 : 1000}
                          onChange={(v) =>
                            update((d) => {
                              d.hypothesisDraft[key] = v;
                            })
                          }
                        />
                      ))}
                    </div>
                    <Button
                      onClick={addHypothesis}
                      disabled={
                        !hypothesisReady(doc.hypothesisDraft) || doc.hypotheses.length >= 20
                      }
                    >
                      <Check aria-hidden="true" />
                      {doc.hypotheses.length
                        ? "Preserve a new hypothesis version"
                        : "Preserve my first hypothesis"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Save workspace to retain this version across reloads. Saved versions are
                      immutable; the first stays visible through later pivots. Up to 20 versions.
                    </p>
                    <Select
                      label="Hypothesis to investigate"
                      value={doc.selectedHypothesisId ?? ""}
                      onChange={(v) =>
                        update((d) => {
                          d.selectedHypothesisId = v || null;
                        })
                      }
                    >
                      <option value="">No hypothesis selected</option>
                      {doc.hypotheses.map((h, i) => (
                        <option value={h.id} key={h.id}>
                          Version {i + 1}
                          {i === 0 ? " · First attempt" : ""} — {h.population}
                        </option>
                      ))}
                    </Select>
                    {doc.hypotheses.map((h, i) => (
                      <details key={h.id} className="rounded-xl border p-4">
                        <summary className="min-h-11 cursor-pointer font-semibold">
                          Hypothesis {i + 1}
                          {i === 0 ? " — first attempt retained" : ""}
                        </summary>
                        <dl className="space-y-3 text-sm">
                          {hypothesisFields.map(([k, label]) => (
                            <div key={k}>
                              <dt className="font-semibold">{label}</dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {h[k] || "Not entered"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() =>
                            update((d) => {
                              d.hypothesisDraft = {
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
                          Use version {i + 1} as an editable starting point
                        </Button>
                      </details>
                    ))}
                  </>
                )}
                {(step === 2 || step === 3) && (
                  <>
                    <p className="text-muted-foreground">
                      {step === 2
                        ? "Plan up to five reachable conversations. Use aliases and relevant experience, not personal dossiers. Fewer than five is fine; no contact or interview is created here."
                        : "A false positive could be polite agreement that looks like demand. A false negative could miss a real problem because the situation or test did not fit. Treat these as possibilities about the sample and method, never a diagnosis of a person."}
                    </p>
                    {contacts.error && (
                      <p role="alert" className="text-sm">
                        Saved contacts could not be loaded. Existing links are retained; retry on
                        People before linking another record.
                      </p>
                    )}
                    {doc.people.map((p, i) => (
                      <article key={p.id} className="space-y-4 rounded-xl border bg-background p-5">
                        <h3 className="font-semibold">
                          Conversation plan {i + 1}
                          {p.alias ? ` · ${p.alias}` : ""}
                        </h3>
                        {step === 2 ? (
                          <>
                            <Field
                              label={`Person ${i + 1}: alias`}
                              value={p.alias}
                              max={120}
                              onChange={(v) =>
                                update((d) => {
                                  d.people[i]!.alias = v;
                                })
                              }
                            />
                            <Field
                              label={`Person ${i + 1}: relationship to you`}
                              value={p.relationship}
                              max={500}
                              onChange={(v) =>
                                update((d) => {
                                  d.people[i]!.relationship = v;
                                })
                              }
                            />
                            <Field
                              label={`Person ${i + 1}: relevant experience and why ask`}
                              value={p.relevance}
                              max={1000}
                              onChange={(v) =>
                                update((d) => {
                                  d.people[i]!.relevance = v;
                                })
                              }
                            />
                            <Select
                              label={`Person ${i + 1}: existing private contact (optional)`}
                              value={p.contactId ?? ""}
                              onChange={(v) =>
                                update((d) => {
                                  d.people[i]!.contactId = v || null;
                                })
                              }
                            >
                              <option value="">
                                No linked contact / unlink while keeping text
                              </option>
                              {p.contactId && !contacts.data?.some((c) => c.id === p.contactId) && (
                                <option value={p.contactId}>
                                  Linked contact unavailable — choose unlink
                                </option>
                              )}
                              {contacts.data?.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.first_name || "Unnamed contact"} · Stage {c.stage}
                                </option>
                              ))}
                            </Select>
                          </>
                        ) : (
                          <>
                            {(
                              [
                                ["falsePositive", "Possible false-positive signal"],
                                ["falseNegative", "Possible false-negative signal"],
                                ["mitigation", "How will you reduce this risk?"],
                              ] as const
                            ).map(([k, label]) => (
                              <Field
                                key={k}
                                label={`Person ${i + 1}: ${label}`}
                                value={p[k]}
                                max={1000}
                                onChange={(v) =>
                                  update((d) => {
                                    d.people[i]![k] = v;
                                  })
                                }
                              />
                            ))}
                          </>
                        )}
                        <Button
                          variant="outline"
                          onClick={() =>
                            update((d) => {
                              d.people.splice(i, 1);
                            })
                          }
                        >
                          Remove planning slot {i + 1}
                        </Button>
                      </article>
                    ))}
                    {step === 2 && (
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          disabled={doc.people.length >= 5}
                          onClick={() =>
                            update((d) => {
                              d.people.push({
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
                          Add a reachable-person slot
                        </Button>
                        <Button asChild variant="outline">
                          <Link to="/contacts">Open People to add a saved contact</Link>
                        </Button>
                      </div>
                    )}
                    <Field
                      label="Whose perspective is missing, and how could you reach it?"
                      value={doc.missingPerspectives}
                      onChange={(v) =>
                        update((d) => {
                          d.missingPerspectives = v;
                        })
                      }
                    />
                  </>
                )}
                {step === 4 && (
                  <>
                    <p className="text-muted-foreground">
                      Ask about recent behavior, workarounds and counterexamples. Your selected
                      hypothesis is{" "}
                      {selectedHypothesis ? `“${selectedHypothesis.prediction}”` : "not set yet"}.
                      Every question stays editable.
                    </p>
                    <Field
                      label="Script title"
                      value={doc.scriptDraft.title}
                      max={120}
                      onChange={(v) =>
                        update((d) => {
                          d.scriptDraft.title = v;
                        })
                      }
                    />
                    <Field
                      label="Neutral opening and note-taking permission"
                      value={doc.scriptDraft.opening}
                      max={1500}
                      onChange={(v) =>
                        update((d) => {
                          d.scriptDraft.opening = v;
                        })
                      }
                    />
                    {doc.scriptDraft.questions.map((q, i) => (
                      <div key={i} className="rounded-xl border p-4">
                        <Field
                          label={`Script question ${i + 1}`}
                          value={q}
                          max={1000}
                          onChange={(v) =>
                            update((d) => {
                              d.scriptDraft.questions[i] = v;
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          className="mt-2"
                          onClick={() =>
                            update((d) => {
                              d.scriptDraft.questions.splice(i, 1);
                            })
                          }
                        >
                          Remove question {i + 1}
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={doc.scriptDraft.questions.length >= 20}
                      onClick={() =>
                        update((d) => {
                          d.scriptDraft.questions.push("");
                        })
                      }
                    >
                      Add a question
                    </Button>
                    <Field
                      label="Closing and missing perspectives"
                      value={doc.scriptDraft.closing}
                      max={1500}
                      onChange={(v) =>
                        update((d) => {
                          d.scriptDraft.closing = v;
                        })
                      }
                    />
                    <fieldset className="rounded-xl border p-4">
                      <legend className="px-2 text-sm font-semibold">
                        Context captures referenced by this new version (optional)
                      </legend>
                      {doc.contexts
                        .filter((c) => !doc.excludedContextIds.includes(c.id))
                        .map((c, i) => (
                          <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              checked={contextIds.includes(c.id)}
                              disabled={!c.reviewedAt || c.permission !== "own_or_permitted"}
                              onChange={(e) =>
                                setContextIds((ids) =>
                                  e.target.checked ? [...ids, c.id] : ids.filter((v) => v !== c.id),
                                )
                              }
                            />
                            {c.label || `Context ${i + 1}`}
                            {!c.reviewedAt || c.permission !== "own_or_permitted"
                              ? " · review and storage permission required"
                              : ""}
                          </label>
                        ))}
                      <p className="text-xs text-muted-foreground">
                        References preserve provenance. They do not establish truth or authorize AI
                        processing.
                      </p>
                    </fieldset>
                    <Button
                      onClick={preserveScript}
                      disabled={
                        !selectedHypothesis ||
                        !doc.scriptDraft.questions.length ||
                        doc.scriptDraft.questions.some((q) => !q.trim()) ||
                        doc.scripts.length >= 20
                      }
                    >
                      Preserve this script version
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      A script needs a selected hypothesis and at least one completed question. Save
                      workspace after preserving. Existing versions and completed interview answers
                      stay unchanged.
                    </p>
                  </>
                )}
                {step === 5 && (
                  <>
                    <p className="text-muted-foreground">
                      Choose an exact version. Review and download its PDF worksheet below, then
                      interview with permission. Downloading does not create a contact or count a
                      conversation.
                    </p>
                    <Select
                      label="Script version for fieldwork"
                      value={doc.selectedScriptId ?? ""}
                      onChange={(v) =>
                        update((d) => {
                          d.selectedScriptId = v || null;
                        })
                      }
                    >
                      <option value="">Choose a preserved script</option>
                      {doc.scripts.map((s, i) => (
                        <option key={s.id} value={s.id}>
                          Version {i + 1} · {s.title || "Untitled script"}
                        </option>
                      ))}
                    </Select>
                    {selectedScript && (
                      <article className="space-y-4 rounded-xl bg-secondary p-5">
                        <h3 className="font-semibold">
                          {selectedScript.title || "Selected interview script"}
                        </h3>
                        {unavailableContext ? (
                          <p role="alert">
                            A source capture linked to this script was excluded. Create a new
                            reviewed version before using or exporting it.
                          </p>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap text-sm">{selectedScript.opening}</p>
                            <ol className="list-decimal space-y-3 pl-5">
                              {selectedScript.questions.map((q, i) => (
                                <li key={i} className="whitespace-pre-wrap">
                                  {q}
                                </li>
                              ))}
                            </ol>
                            <p className="whitespace-pre-wrap text-sm">{selectedScript.closing}</p>
                          </>
                        )}
                        <Button
                          variant="outline"
                          onClick={() =>
                            update((d) => {
                              d.scriptDraft = {
                                title: selectedScript.title,
                                opening: selectedScript.opening,
                                questions: [...selectedScript.questions],
                                closing: selectedScript.closing,
                              };
                            })
                          }
                        >
                          Copy selected script into editable draft
                        </Button>
                      </article>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={
                          !selectedScript || dirty || busy || unavailableContext || revision === 0
                        }
                        onClick={() => setAction("adopt")}
                      >
                        <BookOpen aria-hidden="true" />
                        Use this saved script in Interview
                      </Button>
                      <Button asChild variant="outline">
                        <Link to="/interview">Open Interview</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link to="/contacts">Open People</Link>
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      After saving a script, adoption explicitly replaces preparation questions
                      only, after a confirmation. Add a saved contact in People if you want the
                      existing Interview flow; paper interviews and manually reported observations
                      in step 7 are also valid paths.
                    </p>
                  </>
                )}
                {step === 6 && (
                  <>
                    <p className="text-muted-foreground">
                      Bring back what happened. Separate observed behavior and exact words from your
                      interpretation. A linked script or interview is your reported connection, not
                      independent verification.
                    </p>
                    {interviews.error && (
                      <p role="alert">
                        Saved interviews could not be loaded. Keep your observation text; do not
                        guess a source.
                      </p>
                    )}
                    {doc.results.map((r, i) => {
                      const iv = interviews.data?.find((v) => v.id === r.interviewId);
                      const sourceScript = doc.scripts.find((s) => s.id === r.scriptId);
                      const rawAnswers = Array.isArray(iv?.answers) ? iv.answers : [];
                      const actualQuestions = rawAnswers.map((a) =>
                        a && typeof a === "object" && "q" in a ? String(a["q"]) : "",
                      );
                      const differs =
                        iv &&
                        sourceScript &&
                        JSON.stringify(actualQuestions) !== JSON.stringify(sourceScript.questions);
                      return (
                        <article
                          key={r.id}
                          className="space-y-4 rounded-xl border bg-background p-5"
                        >
                          <h3 className="font-semibold">Observation {i + 1}</h3>
                          <div className="grid gap-4 xl:grid-cols-2">
                            <Select
                              label={`Observation ${i + 1}: saved interview (optional)`}
                              value={r.interviewId ?? ""}
                              onChange={(v) =>
                                update((d) => {
                                  d.results[i]!.interviewId = v || null;
                                  d.results[i]!.sourceCapturedAt = v
                                    ? new Date().toISOString()
                                    : null;
                                })
                              }
                            >
                              <option value="">Manual observation / unlink reference</option>
                              {r.interviewId && !iv && (
                                <option value={r.interviewId}>
                                  Linked interview unavailable — choose unlink
                                </option>
                              )}
                              {interviews.data?.map((item, n) => (
                                <option key={item.id} value={item.id}>
                                  Interview {n + 1} ·{" "}
                                  {item.completed ? "Marked complete" : "Incomplete"} ·{" "}
                                  {item.created_at.slice(0, 10)}
                                </option>
                              ))}
                            </Select>
                            <Select
                              label={`Observation ${i + 1}: script version used (self-reported)`}
                              value={r.scriptId ?? ""}
                              onChange={(v) =>
                                update((d) => {
                                  d.results[i]!.scriptId = v || null;
                                })
                              }
                            >
                              <option value="">No script linked</option>
                              {doc.scripts.map((s, n) => (
                                <option key={s.id} value={s.id}>
                                  Script {n + 1} · {s.title}
                                </option>
                              ))}
                            </Select>
                          </div>
                          {iv && (
                            <details className="rounded-lg border p-3">
                              <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                                Read current private source notes
                              </summary>
                              {differs && (
                                <p className="mb-3 text-sm text-destructive">
                                  The recorded questions differ from the linked script version. Keep
                                  that difference visible; no answer is changed.
                                </p>
                              )}
                              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                                {rawAnswers
                                  .map((a) =>
                                    a && typeof a === "object"
                                      ? Object.entries(a)
                                          .filter(([k]) => ["q", "note", "quote"].includes(k))
                                          .map(([k, v]) => `${k}: ${String(v ?? "")}`)
                                          .join("\n")
                                      : "Unrecognized source answer",
                                  )
                                  .join("\n\n")}
                              </pre>
                            </details>
                          )}
                          {(
                            [
                              ["observation", "What happened / observed behavior", 4000],
                              ["quote", "Reported exact quote (verify against the source)", 2000],
                              ["interpretation", "Your interpretation", 2000],
                              ["counterevidence", "Disagreement or counterevidence", 2000],
                            ] as const
                          ).map(([k, label, max]) => (
                            <Field
                              key={k}
                              label={`Observation ${i + 1}: ${label}`}
                              value={r[k]}
                              max={max}
                              onChange={(v) =>
                                update((d) => {
                                  d.results[i]![k] = v;
                                })
                              }
                            />
                          ))}
                          <Button
                            variant="outline"
                            onClick={() =>
                              update((d) => {
                                d.results.splice(i, 1);
                              })
                            }
                          >
                            Remove current observation {i + 1}
                          </Button>
                        </article>
                      );
                    })}
                    <Button
                      variant="outline"
                      disabled={doc.results.length >= 20}
                      onClick={() =>
                        update((d) => {
                          d.results.push({
                            id: crypto.randomUUID(),
                            interviewId: null,
                            scriptId: d.selectedScriptId,
                            sourceCapturedAt: null,
                            observation: "",
                            quote: "",
                            interpretation: "",
                            counterevidence: "",
                          });
                        })
                      }
                    >
                      Add a reported observation
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Manual observations do not create completed interview records or change stage
                      counts. Permission to keep notes, send to AI and share is managed separately
                      in Interview.
                    </p>
                    <Select
                      label="Your next decision"
                      value={doc.reflection.decision ?? ""}
                      onChange={(v) =>
                        update((d) => {
                          d.reflection.decision = (v ||
                            null) as DiscoveryDocument["reflection"]["decision"];
                        })
                      }
                    >
                      <option value="">Still deciding</option>
                      {(["retain", "narrow", "pivot", "test", "stop"] as const).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    {(
                      [
                        ["reason", "What observations support this decision?"],
                        ["productChange", "One actionable product or audience change"],
                        ["nextTest", "Next small test and what would change your mind"],
                        ["uncertainty", "What remains uncertain?"],
                      ] as const
                    ).map(([k, label]) => (
                      <Field
                        key={k}
                        label={label}
                        value={doc.reflection[k]}
                        onChange={(v) =>
                          update((d) => {
                            d.reflection[k] = v;
                          })
                        }
                      />
                    ))}
                  </>
                )}
              </fieldset>
              <div className="mt-8 flex justify-between gap-3 border-t pt-5">
                <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
                  <ArrowLeft aria-hidden="true" />
                  Previous step
                </Button>
                <Button variant="outline" onClick={() => go(step + 1)} disabled={step === 6}>
                  Next step
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </section>
          </div>
          <div className="mt-6 space-y-5">
            <RemoteContextPanel
              key={`${project.user_id}:${project.id}`}
              projectId={project.id}
              ownerId={project.user_id}
              archived={!!project.archived_at}
              disabled={busy}
              onDirtyChange={setRemoteContextDirty}
            />
            <ContextCaptures
              document={doc}
              update={update}
              disabled={busy}
              onDraftChange={setContextDirty}
            />
            <OwnerActivityExport
              project={project}
              activities={() =>
                discoveryActivities(doc, {
                  savedAt,
                  revision,
                  dirty,
                  fictional: isFictionalExportProject(project),
                })
              }
              allowPortfolio
            />
            {history.length > 0 && (
              <details className="rounded-xl border bg-card p-5">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Previous saved revisions ({history.length}, latest three retained)
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saved hypothesis/script versions remain in the current workspace. This short save
                  history is read-only and is not a deletion or restore system.
                </p>
                {history.map((item) => (
                  <div key={item.revision} className="mt-3 border-t pt-3 text-sm">
                    <strong>Revision {item.revision}</strong> · {item.savedAt} ·{" "}
                    {item.document.hypotheses.length} hypothesis versions,{" "}
                    {item.document.scripts.length} script versions
                  </div>
                ))}
              </details>
            )}
          </div>
        </>
      )}
      <AlertDialog
        open={action !== null || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
            if (blocker.status === "blocked") blocker.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blocker.status === "blocked"
                ? "Leave this local draft?"
                : action === "adopt"
                  ? "Replace Interview preparation questions?"
                  : "Reload the saved workspace?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blocker.status === "blocked"
                ? "Unsaved workspace edits or unadded context may be lost. Keep working to save or export them first."
                : action === "adopt"
                  ? "The selected saved manual script will replace the current preparation questions and their AI-origin label. Completed interview answers and preserved discovery versions will remain. No interview will be started or counted."
                  : "This replaces current workspace edits with the latest confirmed save. If loading fails, your draft stays here. Export your current work first if you want to keep it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
                else void confirmAction();
              }}
            >
              {blocker.status === "blocked"
                ? "Leave without saving"
                : action === "adopt"
                  ? "Replace preparation questions"
                  : "Reload saved workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
