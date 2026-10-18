import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  Lightbulb,
  Save,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TeachingConcepts } from "./TeachingConcepts";
import { DemoClassOverview } from "./DemoClassOverview";
import { CLASSROOM_DEMO_PROJECT_ID } from "@/lib/demo/classroom";
import { teachingKit } from "./resources";
import { loadTeacherPlan, saveTeacherPlan } from "@/lib/teacher.functions";
import {
  createEmptyTeacherPlan,
  teacherPlanSchema,
  type TeacherPlanV1,
  type TeacherPlanRecord,
  type SaveTeacherPlanInput,
} from "@/lib/teacher-plan";

const starterObjectives = [
  "Distinguish an observation from an interpretation and name a remaining uncertainty.",
  "Ask a neutral question about recent behavior and use counterevidence to choose a next step.",
  "Connect a reachable audience, a permitted channel and a truthful asset to one useful action.",
  "Revise a decision after peer feedback and explain what changed or stayed the same.",
];
const starterAssignment =
  "Before opening the scaffold or using optional AI, write and organize your own first plan for the fictional StudyLoop case. Examine the four source cards, including Nora’s counterexample. Separate observations from interpretations, then choose a next test. Design a $0 channel and content experiment with one useful action. Ask a peer to follow it, revise one choice, and reflect on what remains unknown. Use the paper or private simulated alternative if you prefer; no customer contact, spending or AI is required.";
const starterAssessment =
  "Use the four-criterion teaching-kit rubric: question quality; source vs interpretation; revision and decision; participant respect and honest reporting. Give one supported observation, one uncertainty and one next action the student can choose. Assess reasoning and revision, not revenue, contacts, AI use or visual polish.";
const agenda = [
  {
    time: "00–10",
    title: "Think before the template",
    detail:
      "Frame the problem for two minutes. Give five minutes for individual notes and self-named headings, then three minutes to compare structures.",
    artifact: "Original notes · worksheet A",
  },
  {
    time: "10–30",
    title: "Work with evidence",
    detail:
      "Read the four fictional source cards. Separate observations from interpretations, discuss Nora’s counterexample and alternatives, and write a neutral recent-behavior question.",
    artifact: "Source → uncertainty → decision",
  },
  {
    time: "30–50",
    title: "Design a $0 marketing test",
    detail:
      "Choose an audience and useful action. Compare two channels and access unknowns. Draft one truthful asset, then bound a test and its manual measures.",
    artifact: "Two routes · one asset · proposed test",
  },
  {
    time: "50–60",
    title: "Peer check, revise, reflect",
    detail:
      "50–54: a partner identifies the audience and next action without an explanation. 54–57: swap. 57–59: revise. 59–60: write an exit reflection.",
    artifact: "Observed misunderstanding · revision · unknown",
  },
];
const rubric = [
  {
    title: "Question quality",
    prompt: "Does the question ask neutrally about a recent behavior or workaround?",
  },
  {
    title: "Source vs interpretation",
    prompt:
      "Can a peer trace the source and distinguish the interpretation, counterevidence and unknowns?",
  },
  {
    title: "Revision and decision",
    prompt:
      "Does the learner explain what changed, stayed or stopped, and the next test or alternative?",
  },
  {
    title: "Respect and honest reporting",
    prompt:
      "Are permissions, data minimization, truthful claims, simulations and unknowns visible?",
  },
];

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:p-8">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      )}
      <h2 className="mt-1 text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
function PlanComparison({ plan }: { plan: TeacherPlanV1 }) {
  const values = [
    ["Class / lesson", plan.className],
    ["Audience", plan.audience],
    ["Objectives", plan.learningObjectives.join("\n")],
    ["Assignment", plan.assignment],
    ["Session", `${plan.sessionMinutes} minutes`],
    ["Planned capacity", plan.plannedLearners === null ? "Not set" : String(plan.plannedLearners)],
    ["Date", plan.scheduledOn ?? "Not set"],
    ["Assessment", plan.assessment],
    ["Facilitator notes", plan.facilitatorNotes],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt className="font-semibold">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
            {value || "Not written yet"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TeacherPlanner({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const prefix = useId();
  const [document, setDocument] = useState<TeacherPlanV1>(createEmptyTeacherPlan);
  const [revision, setRevision] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [feedbackDirty, setFeedbackDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [latest, setLatest] = useState<TeacherPlanRecord | null>(null);
  const pendingSave = useRef<{ fingerprint: string; input: SaveTeacherPlanInput } | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || feedbackDirty || busy,
    enableBeforeUnload: dirty || feedbackDirty || busy,
    withResolver: true,
  });

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError(null);
    void loadTeacherPlan({ data: { projectId } })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(
            "We couldn’t load this lesson plan. Your saved work has not been replaced. Try again before editing.",
          );
          return;
        }
        setDocument(result.plan?.document ?? createEmptyTeacherPlan());
        setRevision(result.plan?.revision ?? 0);
        setSavedAt(result.plan?.savedAt ?? null);
        setDirty(false);
        setLoaded(true);
      })
      .catch(() => {
        if (active)
          setError(
            "We couldn’t load this lesson plan. Your saved work has not been replaced. Try again before editing.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, loadAttempt]);

  function update<K extends keyof TeacherPlanV1>(key: K, value: TeacherPlanV1[K]) {
    if (busy) return;
    setDocument((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    pendingSave.current = null;
    if (!conflict) setError(null);
  }
  function fillStarter() {
    if (busy) return;
    setDocument((previous) => ({
      ...previous,
      className: previous.className || "Evidence to action: a $0 experiment",
      learningObjectives: previous.learningObjectives.some((value) => value.trim())
        ? previous.learningObjectives
        : [...starterObjectives],
      assignment: previous.assignment || starterAssignment,
      assessment: previous.assessment || starterAssessment,
    }));
    setDirty(true);
    pendingSave.current = null;
    if (!conflict) setError(null);
  }
  async function save() {
    if (busy || conflict || !loaded) return;
    const parsed = teacherPlanSchema.safeParse(document);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        `Check ${issue?.path[0] === "learningObjectives" ? "learning objectives (up to 8, 500 characters each)" : (issue?.path[0] ?? "your plan")}: ${issue?.message ?? "Some details are invalid."} Your draft is still here.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    const fingerprint = JSON.stringify({
      projectId,
      expectedRevision: revision,
      document: parsed.data,
    });
    const input =
      pendingSave.current?.fingerprint === fingerprint
        ? pendingSave.current.input
        : {
            projectId,
            expectedRevision: revision,
            mutationId: crypto.randomUUID(),
            document: parsed.data,
          };
    pendingSave.current = { fingerprint, input };
    try {
      const result = await saveTeacherPlan({ data: input });
      if (!result.ok) {
        if (result.code === "CONFLICT" || result.code === "IDEMPOTENCY_CONFLICT") {
          setConflict(true);
          setError(
            "A newer or different save needs your review. Your draft is still here. Review the saved version before saving again.",
          );
        } else if (result.code === "UNAUTHENTICATED")
          setError(
            "Your session needs attention. Copy any unsaved work before signing in again. This draft has not been discarded.",
          );
        else if (result.code === "NOT_FOUND")
          setError(
            "This project is no longer available to this account. Your draft is still here; no save was confirmed.",
          );
        else if (result.code === "INVALID_PLAN")
          setError(
            "The plan could not be accepted. Check the field limits and try again. Your draft is still here.",
          );
        else
          setError(
            "We couldn’t confirm the save. Your draft is still here. Retry Save plan to check the same request safely.",
          );
        return;
      }
      setDocument(result.document);
      setRevision(result.revision);
      setSavedAt(result.savedAt);
      setDirty(false);
      pendingSave.current = null;
    } catch {
      setError(
        "We couldn’t confirm the save. Your draft is still here. Retry Save plan to check the same request safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reviewSaved() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await loadTeacherPlan({ data: { projectId } });
      if (!result.ok) {
        setError(
          "The saved version could not be loaded. Your draft has not been replaced. Try reviewing again.",
        );
        return;
      }
      setLatest(result.plan);
      setReviewOpen(true);
    } catch {
      setError(
        "The saved version could not be loaded. Your draft has not been replaced. Try reviewing again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resolveConflict(useSaved: boolean) {
    if (useSaved) setDocument(latest?.document ?? createEmptyTeacherPlan());
    setRevision(latest?.revision ?? 0);
    setSavedAt(latest?.savedAt ?? null);
    setDirty(!useSaved);
    setConflict(false);
    setError(null);
    setReviewOpen(false);
    pendingSave.current = null;
  }
  const textField = (
    key: "className" | "audience" | "assignment" | "assessment" | "facilitatorNotes",
    label: string,
    max: number,
    rows = 1,
    hint?: string,
  ) => {
    const id = `${prefix}-${key}`;
    const common = {
      id,
      value: document[key],
      maxLength: max,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        update(key, event.target.value),
      "aria-describedby": hint ? `${id}-hint` : undefined,
    };
    return (
      <Field id={id} label={label} hint={hint}>
        {rows === 1 ? (
          <Input {...common} />
        ) : (
          <Textarea {...common} rows={rows} className="resize-y leading-relaxed" />
        )}
      </Field>
    );
  };

  return (
    <AppShell title="Educator dashboard">
      <div className="space-y-7 pb-10">
        {projectId === CLASSROOM_DEMO_PROJECT_ID && (
          <DemoClassOverview onDraftChange={setFeedbackDirty} />
        )}
        <header
          id="private-lesson-plan"
          className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Teach the process · keep the thinking
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
              Your private lesson plan
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Plan an experience where students act, examine evidence and explain their next choice.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Private plan for <span className="font-semibold text-foreground">{projectName}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 xl:items-end">
            <Button
              onClick={() => void save()}
              disabled={!loaded || busy || conflict || (!dirty && revision > 0)}
              aria-busy={busy}
            >
              <Save aria-hidden="true" />
              {busy ? "Working…" : "Save plan"}
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {dirty
                ? "Unsaved edits"
                : savedAt
                  ? `Saved · revision ${revision}`
                  : loaded
                    ? "New plan · not saved yet"
                    : "Loading your plan…"}
            </p>
            {savedAt && (
              <time dateTime={savedAt} className="text-xs text-muted-foreground">
                Last confirmed save: {new Date(savedAt).toLocaleString()}
              </time>
            )}
          </div>
        </header>
        <div className="rounded-xl border border-border bg-secondary px-5 py-4">
          <p className="font-semibold">
            Planning workspace — enrollment and student submissions are not connected yet
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            This plan is private to your account and project. Planned capacity is a planning
            estimate; nothing here enrolls students, assigns work or records grades.
          </p>
        </div>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <p className="max-w-3xl text-sm leading-relaxed">{error}</p>
            {!loaded ? (
              <Button variant="outline" onClick={() => setLoadAttempt((value) => value + 1)}>
                Retry loading
              </Button>
            ) : conflict ? (
              <Button variant="outline" disabled={busy} onClick={() => void reviewSaved()}>
                Review saved version
              </Button>
            ) : null}
          </div>
        )}
        {loaded && (
          <Tabs defaultValue="plan" className="space-y-6">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted p-1.5 sm:w-auto">
              <TabsTrigger value="plan" className="min-h-11 gap-2 px-4">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Lesson plan
              </TabsTrigger>
              <TabsTrigger value="run-of-show" className="min-h-11 gap-2 px-4">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Agenda & feedback
              </TabsTrigger>
              <TabsTrigger value="preview" className="min-h-11 gap-2 px-4">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Student task preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="plan" className="mt-0">
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
                <fieldset disabled={busy} className="min-w-0 space-y-6">
                  <legend className="sr-only">Lesson planning details</legend>
                  <Panel title="Set the scene" eyebrow="01 · Context">
                    <div className="mt-6 space-y-5">
                      {textField("className", "Class / lesson name", 120)}
                      {textField(
                        "audience",
                        "Who is this lesson for?",
                        1000,
                        3,
                        "Experience, context and access needs. Avoid student names or personal information.",
                      )}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field id={`${prefix}-minutes`} label="Session length (minutes)">
                          <Input
                            id={`${prefix}-minutes`}
                            type="number"
                            min={1}
                            max={480}
                            value={document.sessionMinutes}
                            onChange={(event) =>
                              update(
                                "sessionMinutes",
                                event.target.value === "" ? 0 : Number(event.target.value),
                              )
                            }
                          />
                        </Field>
                        <Field
                          id={`${prefix}-capacity`}
                          label="Planned capacity"
                          hint="Estimate only; no roster."
                        >
                          <Input
                            id={`${prefix}-capacity`}
                            type="number"
                            min={0}
                            max={10000}
                            value={document.plannedLearners ?? ""}
                            aria-describedby={`${prefix}-capacity-hint`}
                            onChange={(event) =>
                              update(
                                "plannedLearners",
                                event.target.value === "" ? null : Number(event.target.value),
                              )
                            }
                          />
                        </Field>
                        <Field id={`${prefix}-date`} label="Planned date (optional)">
                          <Input
                            id={`${prefix}-date`}
                            type="date"
                            value={document.scheduledOn ?? ""}
                            onChange={(event) => update("scheduledOn", event.target.value || null)}
                          />
                        </Field>
                      </div>
                    </div>
                  </Panel>
                  <Panel title="Make the learning visible" eyebrow="02 · Purpose & practice">
                    <div className="mt-6 space-y-5">
                      <Field
                        id={`${prefix}-objectives`}
                        label="Learning objectives"
                        hint="One per line. Up to 8 objectives, 500 characters each. Describe what learners will practice or explain."
                      >
                        <Textarea
                          id={`${prefix}-objectives`}
                          rows={5}
                          value={document.learningObjectives.join("\n")}
                          aria-describedby={`${prefix}-objectives-hint`}
                          onChange={(event) =>
                            update(
                              "learningObjectives",
                              event.target.value ? event.target.value.split("\n") : [],
                            )
                          }
                        />
                      </Field>
                      {textField(
                        "assignment",
                        "Student task / assignment",
                        4000,
                        7,
                        "Start with students’ own thinking. Then add evidence, a decision, a small test and reflection.",
                      )}
                      {textField(
                        "assessment",
                        "Assessment & feedback approach",
                        2000,
                        5,
                        "Assess reasoning and revision. The teaching-kit rubric is available in Agenda & feedback.",
                      )}
                    </div>
                  </Panel>
                  <Panel title="Your facilitation notes" eyebrow="03 · For you">
                    <div className="mt-5">
                      {textField(
                        "facilitatorNotes",
                        "Private facilitator notes",
                        4000,
                        5,
                        "Excluded from the student task preview. Keep sensitive student information out of this plan.",
                      )}
                    </div>
                  </Panel>
                </fieldset>
                <aside className="space-y-6 xl:sticky xl:top-6">
                  <section className="rounded-2xl bg-primary p-7 text-primary-foreground">
                    <BookOpen className="h-7 w-7" aria-hidden="true" />
                    <p className="mt-5 text-xs font-semibold uppercase tracking-widest">
                      A ready starting point
                    </p>
                    <h2 className="mt-2 text-2xl font-bold leading-snug">
                      Evidence → decision → next test.
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed">
                      Use a 60-minute StudyLoop lesson with a fictional case, a $0 marketing
                      experiment and a peer check.
                    </p>
                    <Button
                      className="mt-6 w-full"
                      variant="secondary"
                      disabled={busy}
                      onClick={fillStarter}
                    >
                      <Lightbulb aria-hidden="true" />
                      Fill empty fields from lesson
                    </Button>
                    <p className="mt-3 text-xs leading-relaxed">
                      Adds a title, objectives, assignment and assessment where blank. Preserves
                      your writing and session settings. Save to keep the plan.
                    </p>
                  </section>
                  <section className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="text-lg font-bold">Bring the materials</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Teaching kit v{teachingKit.version} · paper and private simulation
                      alternatives included.
                    </p>
                    <a
                      className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-primary hover:bg-accent"
                      href={teachingKit.printablePdf}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open printable teaching kit{" "}
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <a
                      className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
                      href={teachingKit.printableHtml}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read the accessible HTML kit{" "}
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                      Opens in a new tab. No app account, AI or spending required to use the kit.
                    </p>
                  </section>
                  <div className="rounded-2xl border border-border p-6">
                    <p className="font-semibold">Leave room for a different answer.</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Use Nora’s counterexample to ask what the evidence changes. A stopped idea or
                      revised question can be a useful learning outcome.
                    </p>
                  </div>
                </aside>
              </div>
            </TabsContent>
            <TabsContent value="run-of-show" className="mt-0 space-y-6">
              <Panel title="A 60-minute run of show" eyebrow="Reference lesson · teaching kit v1.0">
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  A reference agenda to adapt, not a claim that a class has run.{" "}
                  {document.sessionMinutes !== 60 &&
                    `Your plan is ${document.sessionMinutes} minutes; adapt the timings before teaching.`}
                </p>
                <ol className="mt-6 grid gap-4 lg:grid-cols-2">
                  {agenda.map((item) => (
                    <li key={item.time} className="rounded-xl border border-border p-5">
                      <p className="font-mono text-sm font-semibold text-primary">
                        {item.time} min
                      </p>
                      <h3 className="mt-2 text-xl font-bold">{item.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                      <p className="mt-4 flex items-start gap-2 text-sm font-medium">
                        <FileText
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {item.artifact}
                      </p>
                    </li>
                  ))}
                </ol>
                <a
                  className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
                  href="/teaching/first-ten-teaching-kit.html#instructor-guide-1"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the instructor guide <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Panel>
              <Panel title="Give feedback on the reasoning" eyebrow="Peer check · four criteria">
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Ask a peer for one supported observation, one uncertainty and one next action the
                  learner can choose. The full rubric uses 0–3 per criterion; this workspace does
                  not record or automate grades.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {rubric.map((item) => (
                    <article className="rounded-xl bg-muted/60 p-5" key={item.title}>
                      <h3 className="font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.prompt}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="mt-5 text-sm leading-relaxed">
                  Offer equivalent paper, solo, oral or simulated paths. Do not grade customer
                  totals, revenue, spending, network size, AI use or polish.
                </p>
                <a
                  className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
                  href="/teaching/first-ten-teaching-kit.html#assessment-rubric-1"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the full rubric & source notes{" "}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Panel>
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              <section className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border bg-secondary px-7 py-5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Preview only · nothing assigned or shared
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Reflects your current draft. Facilitator notes are excluded.
                  </p>
                </div>
                <article aria-label="Student task preview" className="space-y-7 p-7 sm:p-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                      Your learning task
                    </p>
                    <h2 className="mt-3 text-3xl font-bold">
                      {document.className || "Your lesson title"}
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {document.sessionMinutes} minutes
                      {document.scheduledOn ? ` · ${document.scheduledOn}` : ""}
                    </p>
                  </div>
                  {document.audience && (
                    <div>
                      <h3 className="font-bold">Who this is for</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                        {document.audience}
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-bold">What you’ll practice</h3>
                    {document.learningObjectives.some((item) => item.trim()) ? (
                      <ul className="mt-4 space-y-3">
                        {document.learningObjectives
                          .filter((item) => item.trim())
                          .map((item, index) => (
                            <li className="flex gap-3" key={index}>
                              <Check
                                className="mt-1 h-4 w-4 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              <span className="whitespace-pre-wrap break-words leading-relaxed">
                                {item}
                              </span>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-muted-foreground">
                        Add learning objectives in your lesson plan.
                      </p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Your assignment</h3>
                    <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                      {document.assignment || "Write the student task in your lesson plan."}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-6">
                    <h3 className="font-bold">How feedback will work</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                      {document.assessment || "Add your assessment and feedback approach."}
                    </p>
                  </div>
                </article>
              </section>
            </TabsContent>
          </Tabs>
        )}
        <details className="rounded-2xl border border-border bg-card p-6">
          <summary className="cursor-pointer text-lg font-bold">
            Six teaching principles behind the lesson
          </summary>
          <p className="my-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A teaching rationale, not evidence of measured learning gains. Use these principles to
            choose how to facilitate and what to ask learners to explain.
          </p>
          <TeachingConcepts />
          <a
            className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            href="/teaching/first-ten-teaching-kit.html#assessment-rubric-1"
            target="_blank"
            rel="noreferrer"
          >
            Teaching rationale & source notes
          </a>
        </details>
      </div>
      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Review before saving again</AlertDialogTitle>
            <AlertDialogDescription>
              Your local draft is preserved. Keeping it for the next save will replace the reviewed
              saved version only after you press Save plan. A further competing change will trigger
              another review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            <section className="rounded-xl border border-border p-4">
              <h3 className="mb-4 font-bold">Your unsaved draft</h3>
              <PlanComparison plan={document} />
            </section>
            <section className="rounded-xl border border-border p-4">
              <h3 className="mb-4 font-bold">Saved version · revision {latest?.revision ?? 0}</h3>
              <PlanComparison plan={latest?.document ?? createEmptyTeacherPlan()} />
            </section>
          </div>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Keep reviewing later</AlertDialogCancel>
            <Button variant="outline" onClick={() => resolveConflict(true)}>
              Use saved version
            </Button>
            <AlertDialogAction onClick={() => resolveConflict(false)}>
              Keep my draft for next save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep your unsaved work?</AlertDialogTitle>
            <AlertDialogDescription>
              Stay here to save your lesson plan or copy any local practice comments. Leaving
              discards unsaved plan changes and all local feedback drafts. Lesson-plan saves do not
              save the practice comments. No lesson is assigned to students from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (blocker.status === "blocked") blocker.reset();
              }}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
