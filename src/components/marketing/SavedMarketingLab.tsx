import { workspaceWriteError } from "@/lib/write-errors";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { marketingActivities } from "@/lib/export/plan-adapters";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarketingPlanExport } from "./MarketingPlanExport";
import { TestPlanner } from "@/components/marketing-lab/TestPlanner";
import { DestinationBuilder } from "./DestinationBuilder";
import { ContentReadiness } from "./ContentReadiness";
import { invalidateChangedLaunchReviews } from "@/lib/marketing-planning";
import { ManualMeasurements } from "./ManualMeasurements";
import { LiveMarketingPractice } from "./LiveMarketingPractice";
import { loadMarketingPlan, saveMarketingPlan } from "@/lib/marketing.functions";
import {
  createEmptyMarketingPlan,
  canCompleteStudentFirst,
  marketingPlanSchema,
  type MarketingPlanV1,
  type MarketingChannel,
  type MarketingAsset,
  type SaveMarketingPlanInput,
} from "@/lib/marketing-plan";
import type { Project } from "@/lib/data";
import { Check, ArrowRight, Save, Map, FileText, Lightbulb } from "lucide-react";
const steps = ["Think first", "Map channels", "Make content", "Plan the test", "Review learning"];
const uid = () => crypto.randomUUID();
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {help && <span className="block text-xs leading-relaxed text-muted-foreground">{help}</span>}
    </label>
  );
}
function channel(): MarketingChannel {
  return {
    id: uid(),
    name: "",
    medium: "physical",
    place: null,
    url: null,
    sourceIds: [],
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
  };
}
function asset(channelId: string): MarketingAsset {
  return {
    id: uid(),
    channelId,
    format: "community_post",
    ownHook: "",
    truthfulSupport: "",
    supportSourceIds: [],
    body: "",
    builderDisclosure: "",
    cta: "",
    destinationUrl: null,
    firstUsefulAction: "",
    aiOrigin: null,
    review: {
      truthful: false,
      disclosedBuilder: false,
      accessChecked: false,
      destinationChecked: false,
      checkedAt: null,
    },
    walkthrough: {
      mode: null,
      understoodAudience: "",
      actionObserved: "",
      hesitation: "",
      revisionMade: "",
      checkedOn: null,
    },
  };
}
export function SavedMarketingLab({ project }: { project: Project }) {
  const [plan, setPlan] = useState<MarketingPlanV1 | null>(null);
  const [revision, setRevision] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [practiceState, setPracticeState] = useState({ busy: false, hasDraft: false });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadAsk, setReloadAsk] = useState(false);
  const [missingSources, setMissingSources] = useState(false);
  const [serverCanWrite, setServerCanWrite] = useState(project.stage >= 2);
  const canWrite = serverCanWrite && project.stage >= 2;
  const pendingSave = useRef<{ fingerprint: string; input: SaveMarketingPlanInput } | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || busy || practiceState.busy || practiceState.hasDraft,
    enableBeforeUnload: dirty || busy || practiceState.busy || practiceState.hasDraft,
    withResolver: true,
  });
  async function load() {
    setLoading(true);
    setError("");
    const result = await loadMarketingPlan({ data: { projectId: project.id } });
    setLoading(false);
    if (!result.ok) {
      setError("Your saved plan could not be opened. It has not been replaced. Try loading again.");
      return;
    }
    setServerCanWrite(result.canWrite);
    pendingSave.current = null;
    setPlan(result.plan?.document ?? createEmptyMarketingPlan());
    setRevision(result.plan?.revision ?? 0);
    setSavedAt(result.plan?.savedAt ?? null);
    setMissingSources(result.sourceStatus.some((source) => source.status !== "available"));
    setDirty(false);
    setReloadAsk(false);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadMarketingPlan({ data: { projectId: project.id } }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        setError(
          "Your saved plan could not be opened. It has not been replaced. Try loading again.",
        );
        return;
      }
      setServerCanWrite(result.canWrite);
      pendingSave.current = null;
      setPlan(result.plan?.document ?? createEmptyMarketingPlan());
      setRevision(result.plan?.revision ?? 0);
      setSavedAt(result.plan?.savedAt ?? null);
      setMissingSources(result.sourceStatus.some((source) => source.status !== "available"));
      setDirty(false);
    });
    return () => {
      active = false;
    };
  }, [project.id]);
  function update(mutator: (next: MarketingPlanV1) => void) {
    if (!plan || busy || !canWrite) return;
    const next = structuredClone(plan);
    mutator(next);
    invalidateChangedLaunchReviews(plan, next);
    pendingSave.current = null;
    setPlan(next);
    setDirty(true);
    setError("");
  }
  async function save(complete = false) {
    if (!plan || busy || !canWrite) return;
    const parsed = marketingPlanSchema.safeParse(plan);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the plan fields before saving.");
      return;
    }
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({
      projectId: project.id,
      expectedRevision: revision,
      completeStudentFirst: complete,
      document: plan,
    });
    const input =
      pendingSave.current?.fingerprint === fingerprint
        ? pendingSave.current.input
        : {
            projectId: project.id,
            expectedRevision: revision,
            mutationId: uid(),
            completeStudentFirst: complete,
            document: plan,
          };
    pendingSave.current = { fingerprint, input };
    const result = await saveMarketingPlan({ data: input });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "STAGE_LOCKED" || result.code === "ARCHIVED") setServerCanWrite(false);
      setError(
        result.code === "ARCHIVED" || result.code === "BUSY"
          ? workspaceWriteError(result)
          : result.code === "CONFLICT"
            ? "A newer version was saved elsewhere. Your edits are still here. Review or load the saved version before continuing."
            : result.code === "STAGE_LOCKED"
              ? "Saving opens at Stage 2. Your draft has not been submitted."
              : "This save was not confirmed. Your edits are still here; try again. Do not leave until you have a confirmed save.",
      );
      return;
    }
    pendingSave.current = null;
    setPlan(result.document);
    setRevision(result.revision);
    setSavedAt(result.savedAt);
    setDirty(false);
    if (complete) setStep(1);
  }
  if (loading)
    return (
      <AppShell title="$0 Marketing Lab">
        <p role="status">Opening your saved plan…</p>
      </AppShell>
    );
  if (!plan)
    return (
      <AppShell title="$0 Marketing Lab">
        <Card>
          <p role="alert">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try loading again
          </Button>
        </Card>
      </AppShell>
    );
  const complete = Boolean(plan.studentFirst.completedAt);
  return (
    <AppShell title="$0 Marketing Lab">
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Keep your unsaved work?</AlertDialogTitle>
          <AlertDialogDescription>
            Stay here to save your manual plan edits or copy any temporary AI practice text you want
            to keep. Save draft saves the plan, not the AI practice preview. Leaving discards
            unsaved edits and temporary practice drafts.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (blocker.status === "blocked") blocker.reset();
              }}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || practiceState.busy}
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Next 50 · a small test, a useful decision
          </p>
          <h2 className="mt-2 text-3xl font-bold">Find the right place. Make something useful.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Map a reachable audience to a channel, create truthful content and decide what you will
            learn in a week. $0 cash still costs time and effort. Nothing is posted or sent for you.
          </p>
        </div>
        <div className="min-w-48 text-sm">
          <p role="status" aria-live="polite" className="font-semibold">
            {busy
              ? "Saving…"
              : dirty
                ? "Unsaved edits"
                : savedAt
                  ? `Saved · revision ${revision}`
                  : "Not saved yet"}
          </p>
          {savedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(savedAt).toLocaleString()}
            </p>
          )}
          <Button
            className="mt-3 gap-2"
            onClick={() => void save()}
            disabled={busy || !dirty || !canWrite}
          >
            <Save className="size-4" />
            Save draft
          </Button>
        </div>
      </div>
      {!canWrite && (
        <Card>
          <h3 className="font-bold">Saving is unavailable</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Saving a Marketing Lab plan requires an active idea at Stage 2. If this idea was
            archived, restore it in Account & saved work. Your current draft remains available to
            review and export.
          </p>
          <Link
            to="/demo"
            search={{ view: "marketing" }}
            className="mt-3 inline-flex min-h-11 items-center font-semibold underline"
          >
            Explore the marketing example
          </Link>
        </Card>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-destructive-soft p-4 text-sm"
        >
          <p>{error}</p>
          {revision > 0 && (
            <button
              className="mt-2 min-h-11 font-semibold underline"
              onClick={() => setReloadAsk(true)}
            >
              Load saved version
            </button>
          )}
        </div>
      )}
      {reloadAsk && (
        <Card>
          <p>
            Loading the saved version will replace your unsaved edits on this page. Copy any text
            you want to keep first.
          </p>
          <div className="mt-3 flex gap-3">
            <Button onClick={() => void load()}>Replace with saved version</Button>
            <Button variant="outline" onClick={() => setReloadAsk(false)}>
              Keep editing
            </Button>
          </div>
        </Card>
      )}
      {missingSources && (
        <p role="note" className="rounded-xl border bg-accent/30 p-4 text-sm">
          Some linked source records are missing or no longer accepted. Review their claims before
          using this plan.
        </p>
      )}
      <nav
        aria-label="Marketing plan steps"
        className="grid gap-2 rounded-2xl border bg-card p-2 md:grid-cols-5"
      >
        {steps.map((label, index) => (
          <button
            key={label}
            onClick={() => setStep(index)}
            disabled={index > 0 && !complete}
            aria-current={step === index ? "step" : undefined}
            className={`flex min-h-14 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold disabled:opacity-45 ${step === index ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
              {index === 0 && complete ? <Check className="size-3" /> : index + 1}
            </span>
            {label}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy || !canWrite} className="min-w-0 space-y-5">
        {project.id === "f1d00000-0000-4000-8000-000000000010" && complete && (
          <div hidden={step !== 2}>
            <LiveMarketingPractice projectId={project.id} onStateChange={setPracticeState} />
          </div>
        )}
        {step === 0 && (
          <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <Lightbulb className="mb-3 size-7" />
              <h3 className="text-2xl font-bold">Your thinking comes first</h3>
              <p className="my-3 text-sm leading-relaxed text-muted-foreground">
                Start from what you know, before examples or AI. Your original thinking is preserved
                when you complete this step.
              </p>
              <fieldset disabled={complete} className="space-y-4">
                <Field
                  label="What have you noticed?"
                  help="Keep observations, assumptions and unknowns distinguishable."
                >
                  <Textarea
                    value={plan.studentFirst.notes.map((note) => note.text).join("\n")}
                    onChange={(event) =>
                      update((next) => {
                        next.studentFirst.notes = [
                          {
                            id: next.studentFirst.notes[0]?.id ?? uid(),
                            columnId: null,
                            text: event.target.value,
                          },
                        ];
                      })
                    }
                  />
                </Field>
                <Field label="Who is your reachable audience?">
                  <Input
                    value={plan.studentFirst.audience}
                    onChange={(event) =>
                      update((next) => {
                        next.studentFirst.audience = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="What useful action could they take?">
                  <Input
                    value={plan.studentFirst.usefulAction}
                    onChange={(event) =>
                      update((next) => {
                        next.studentFirst.usefulAction = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field
                  label="Where might you reach them?"
                  help="One channel idea per line. Include places you can actually access."
                >
                  <Textarea
                    value={plan.studentFirst.channelIdeas.join("\n")}
                    onChange={(event) =>
                      update((next) => {
                        next.studentFirst.channelIdeas = event.target.value.split("\n");
                      })
                    }
                  />
                </Field>
              </fieldset>
              {complete ? (
                <p className="mt-4 text-sm font-semibold">
                  Original thinking preserved. Refine the plan in the next steps.
                </p>
              ) : (
                <Button
                  className="mt-5 gap-2"
                  disabled={!canCompleteStudentFirst(plan.studentFirst)}
                  onClick={() => void save(true)}
                >
                  Preserve my thinking & continue
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </Card>
            <Card>
              <h3 className="text-xl font-bold">What this lab helps you practice</h3>
              <ol className="mt-4 space-y-4 text-sm leading-relaxed">
                <li>1. Choose a specific audience and a useful action.</li>
                <li>2. Investigate a physical or digital channel and its access rules.</li>
                <li>3. Make an honest message, demo or invitation.</li>
                <li>4. Set a time limit and a measure you can observe.</li>
                <li>5. Use the result to repeat, revise or stop.</li>
              </ol>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                AI is optional. This lab saves your own work. The workshop’s AI practice uses only
                the fictional StudyLoop case. AI proposals grounded in private project evidence
                remain planned.
              </p>
            </Card>
          </div>
        )}
        {step === 1 && (
          <>
            <Card>
              <Map className="mb-3 size-7" />
              <h3 className="text-2xl font-bold">Audience → places → useful action</h3>
              {plan.channels.length === 0 && !plan.audience.beachhead && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() =>
                    update((next) => {
                      next.audience.beachhead = next.studentFirst.audience;
                      next.audience.usefulAction = next.studentFirst.usefulAction;
                      next.channels = next.studentFirst.channelIdeas
                        .filter(Boolean)
                        .slice(0, 8)
                        .map((name) => ({ ...channel(), name }));
                    })
                  }
                >
                  Use my initial audience and channel ideas
                </Button>
              )}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Field label="Beachhead audience">
                  <Input
                    value={plan.audience.beachhead}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.beachhead = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="What situation are they in?">
                  <Input
                    value={plan.audience.situation}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.situation = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Value proposition">
                  <Textarea
                    value={plan.audience.valueProposition}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.valueProposition = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="First useful action">
                  <Textarea
                    value={plan.audience.usefulAction}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.usefulAction = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Assumptions (one per line)">
                  <Textarea
                    value={plan.audience.assumptions.join("\n")}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.assumptions = event.target.value.split("\n");
                      })
                    }
                  />
                </Field>
                <Field label="What remains unknown? (one per line)">
                  <Textarea
                    value={plan.audience.unknowns.join("\n")}
                    onChange={(event) =>
                      update((next) => {
                        next.audience.unknowns = event.target.value.split("\n");
                      })
                    }
                  />
                </Field>
              </div>
            </Card>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              {plan.channels.map((item, index) => (
                <Card key={item.id}>
                  <h3 className="mb-4 text-lg font-bold">Channel {index + 1}</h3>
                  <div className="space-y-4">
                    <Field label={`Channel ${index + 1} name`}>
                      <Input
                        value={item.name}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.name = event.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} type`}>
                      <select
                        className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                        value={item.medium}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.medium = event.target.value as
                              "physical" | "digital";
                          })
                        }
                      >
                        <option value="physical">Physical</option>
                        <option value="digital">Digital</option>
                      </select>
                    </Field>
                    <Field label={`Channel ${index + 1} exact place`}>
                      <Input
                        value={item.place ?? ""}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.place = event.target.value || null;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} URL (optional)`}>
                      <Input
                        type="url"
                        value={item.url ?? ""}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.url = event.target.value || null;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} estimated minutes`}>
                      <Input
                        type="number"
                        min={0}
                        max={10080}
                        value={item.estimatedMinutes ?? ""}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.estimatedMinutes =
                              event.target.value === "" ? null : Number(event.target.value);
                          })
                        }
                      />
                    </Field>
                    <Field
                      label={`Channel ${index + 1} resources needed`}
                      help="One existing resource per line. $0 does not mean free printing, travel or tools."
                    >
                      <Textarea
                        value={item.resourcesNeeded.join("\n")}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.resourcesNeeded = event.target.value.split("\n");
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} unknowns`}>
                      <Textarea
                        value={item.unknowns.join("\n")}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.unknowns = event.target.value.split("\n");
                          })
                        }
                      />
                    </Field>
                    <Field
                      label={`Channel ${index + 1} observation`}
                      help="What have you actually seen here? Do not invent member counts or permission."
                    >
                      <Textarea
                        value={item.observation}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.observation = event.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} audience fit`}>
                      <Textarea
                        value={item.fitReason}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.fitReason = event.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} access`}>
                      <select
                        className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                        value={item.access.state}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.access.state = event.target
                              .value as MarketingChannel["access"]["state"];
                          })
                        }
                      >
                        {[
                          "unknown",
                          "needs_permission",
                          "requested",
                          "allowed",
                          "not_required",
                          "denied",
                        ].map((value) => (
                          <option key={value} value={value}>
                            {value.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={`Channel ${index + 1} access checked on`}
                      help="Required when access is allowed or permission is not required."
                    >
                      <Input
                        type="date"
                        value={item.access.checkedOn ?? ""}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.access.checkedOn = event.target.value || null;
                          })
                        }
                      />
                    </Field>
                    <Field label={`Channel ${index + 1} rules and permission notes`}>
                      <Textarea
                        value={item.access.rulesNote}
                        onChange={(event) =>
                          update((next) => {
                            next.channels[index]!.access.rulesNote = event.target.value;
                          })
                        }
                      />
                    </Field>
                  </div>
                </Card>
              ))}
            </div>
            <Button
              variant="outline"
              disabled={plan.channels.length >= 8}
              onClick={() =>
                update((next) => {
                  next.channels.push(channel());
                })
              }
            >
              Add a channel
            </Button>
            <Card>
              <div className="grid gap-4 lg:grid-cols-2">
                {(["primaryId", "alternativeId"] as const).map((key) => (
                  <Field
                    key={key}
                    label={key === "primaryId" ? "Primary channel" : "Alternative channel"}
                  >
                    <select
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                      value={plan.selection[key] ?? ""}
                      onChange={(event) =>
                        update((next) => {
                          next.selection[key] = event.target.value || null;
                        })
                      }
                    >
                      <option value="">Choose a channel</option>
                      {plan.channels.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || "Unnamed channel"}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <div className="mt-4">
                <Field label="Why this primary channel? What would make the alternative better?">
                  <Textarea
                    value={plan.selection.reason}
                    onChange={(event) =>
                      update((next) => {
                        next.selection.reason = event.target.value;
                      })
                    }
                  />
                </Field>
              </div>
            </Card>
          </>
        )}
        {step === 2 && (
          <>
            <Card>
              <FileText className="mb-3 size-7" />
              <h3 className="text-2xl font-bold">Make a truthful invitation</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Use a hook, honest support and one useful action. Name your relationship to the
                project. Check the channel rules and destination before sending anything yourself.
              </p>
              <Button
                className="mt-4"
                disabled={!plan.selection.primaryId || plan.assets.length >= 6}
                onClick={() =>
                  update((next) => {
                    if (next.selection.primaryId) next.assets.push(asset(next.selection.primaryId));
                  })
                }
              >
                Add content for primary channel
              </Button>
            </Card>
            {plan.assets.map((item, index) => (
              <Card key={item.id}>
                <h3 className="mb-4 text-lg font-bold">Content draft {index + 1}</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label={`Draft ${index + 1} format`}>
                    <select
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                      value={item.format}
                      onChange={(event) =>
                        update((next) => {
                          next.assets[index]!.format = event.target
                            .value as MarketingAsset["format"];
                        })
                      }
                    >
                      {[
                        "community_post",
                        "organizer_email",
                        "dm",
                        "social_caption",
                        "flyer",
                        "demo_script",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {(
                    [
                      ["ownHook", "Your own hook"],
                      ["truthfulSupport", "What can you honestly support?"],
                      ["builderDisclosure", "Disclose your role as the builder"],
                      ["cta", "Call to action"],
                      ["firstUsefulAction", "First useful action"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={`Draft ${index + 1}: ${label}`}>
                      <Textarea
                        value={item[key]}
                        onChange={(event) =>
                          update((next) => {
                            next.assets[index]![key] = event.target.value;
                            next.assets[index]!.review = {
                              truthful: false,
                              disclosedBuilder: false,
                              accessChecked: false,
                              destinationChecked: false,
                              checkedAt: null,
                            };
                          })
                        }
                      />
                    </Field>
                  ))}
                  <div className="lg:col-span-2">
                    <Field label={`Draft ${index + 1}: Full content`}>
                      <Textarea
                        rows={6}
                        value={item.body}
                        onChange={(event) =>
                          update((next) => {
                            next.assets[index]!.body = event.target.value;
                            next.assets[index]!.review = {
                              truthful: false,
                              disclosedBuilder: false,
                              accessChecked: false,
                              destinationChecked: false,
                              checkedAt: null,
                            };
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label={`Draft ${index + 1}: Destination URL (optional)`}>
                    <Input
                      type="url"
                      value={item.destinationUrl ?? ""}
                      onChange={(event) =>
                        update((next) => {
                          next.assets[index]!.destinationUrl = event.target.value || null;
                          next.assets[index]!.review = {
                            truthful: false,
                            disclosedBuilder: false,
                            accessChecked: false,
                            destinationChecked: false,
                            checkedAt: null,
                          };
                        })
                      }
                    />
                  </Field>
                  <DestinationBuilder
                    label={`Draft ${index + 1}`}
                    url={item.destinationUrl}
                    onAdopt={(url) =>
                      update((next) => {
                        next.assets[index]!.destinationUrl = url;
                        next.assets[index]!.review.destinationChecked = false;
                        next.assets[index]!.review.checkedAt = null;
                      })
                    }
                  />
                  <Field
                    label={`Draft ${index + 1}: Peer or self walkthrough notes`}
                    help="What did they understand, where did they hesitate, and what did you revise?"
                  >
                    <Textarea
                      value={item.walkthrough.revisionMade}
                      onChange={(event) =>
                        update((next) => {
                          next.assets[index]!.walkthrough.revisionMade = event.target.value;
                        })
                      }
                    />
                  </Field>
                </div>
                <ContentReadiness
                  asset={item}
                  index={index}
                  change={(mutate) => update((next) => mutate(next.assets[index]!))}
                />
              </Card>
            ))}
          </>
        )}
        {step === 3 && <TestPlanner plan={plan} update={update} />}
        <OwnerActivityExport
          project={project}
          activities={() =>
            marketingActivities(plan, {
              savedAt,
              revision,
              dirty,
              fictional: project.id === "f1d00000-0000-4000-8000-000000000010",
            })
          }
        />
        {step === 4 && (
          <Card>
            <h3 className="text-2xl font-bold">What did you learn?</h3>
            <ManualMeasurements
              plan={plan}
              update={update}
              fictional={project.id === "f1d00000-0000-4000-8000-000000000010"}
            />
            <p className="my-4 text-sm text-muted-foreground">
              Record what you actually observed, including no participation. Unknown is different
              from zero. Classmate practice is not external adoption. Saved records remain drafts;
              no outcome is automatically verified.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Repeat, revise or stop?">
                <select
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  value={plan.reflection.decision ?? ""}
                  onChange={(event) =>
                    update((next) => {
                      next.reflection.decision =
                        (event.target.value as "repeat" | "revise" | "stop") || null;
                    })
                  }
                >
                  <option value="">Not decided</option>
                  <option value="repeat">Repeat</option>
                  <option value="revise">Revise</option>
                  <option value="stop">Stop</option>
                </select>
              </Field>
              <Field label="Review recorded on">
                <Input
                  type="date"
                  value={plan.reflection.reviewedOn ?? ""}
                  onChange={(event) =>
                    update((next) => {
                      next.reflection.reviewedOn = event.target.value || null;
                    })
                  }
                />
              </Field>
              {(
                [
                  ["learned", "Observed result and what you learned"],
                  ["uncertainty", "Limits, counterexamples and unknowns"],
                  ["nextAction", "Your next action"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Textarea
                    rows={4}
                    value={plan.reflection[key]}
                    onChange={(event) =>
                      update((next) => {
                        next.reflection[key] = event.target.value;
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              No visits, signups, returning users or conversion rates are inferred from a saved
              plan.
            </p>
          </Card>
        )}
      </fieldset>
      {step === 4 && (
        <MarketingPlanExport
          key={project.id}
          plan={plan}
          projectName={project.name}
          fictional={project.id === "f1d00000-0000-4000-8000-000000000010"}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">
          Explicit saves · private to this project · no automatic outreach
        </p>
        <div className="flex gap-3">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button disabled={step === 4 || !complete} onClick={() => setStep(step + 1)}>
            Next step
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
