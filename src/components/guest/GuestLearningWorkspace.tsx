import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, LockKeyhole, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bootstrapGuestSession } from "@/lib/guest-spaces.functions";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import {
  listGuestActivities,
  loadGuestActivity,
  saveGuestActivity,
} from "@/lib/guest-activities/functions";
import {
  createEmptyGuestLearning,
  guestActivityMessage,
  guestLearningDocumentSchema,
  prepareGuestLearningSave,
  type GuestActivityRecord,
  type GuestLearningDocument,
  type SaveGuestActivityInput,
  guestActivityHeaderSchema,
} from "@/lib/guest-activities/contracts";
import type { z } from "zod";
import type { ActivityOffer } from "@/lib/export/adapters";
import { guestLearningActivities } from "@/lib/export/guest-activity-adapters";
import { GuestLearningSteps } from "./GuestLearningSteps";
import { guestSteps } from "./steps";
import { GuestContext } from "./GuestContext";
import { GuestReviewedHandoff } from "./GuestReviewedHandoff";
import { GuestActivityExport } from "./GuestActivityExport";
type Header = z.infer<typeof guestActivityHeaderSchema>;
const fingerprint = (v: unknown) => JSON.stringify(v);
function matches(record: Header, view: Pick<GuestView, "classId" | "teamId" | "principalId">) {
  return (
    record.classId === view.classId &&
    record.teamId === view.teamId &&
    (record.audience === "team_shared" || record.authorPrincipalId === view.principalId)
  );
}
type WorkspaceProps = { view: GuestView; csrf: string; onDirtyChange?: (dirty: boolean) => void };
export function GuestLearningWorkspace(props: WorkspaceProps) {
  const { view, csrf } = props;
  return (
    <Workspace key={`${view.classId}:${view.teamId}:${view.principalId}:${csrf}`} {...props} />
  );
}
function Workspace({ view, csrf, onDirtyChange }: WorkspaceProps) {
  const [headers, setHeaders] = useState<Header[]>([]),
    [record, setRecord] = useState<GuestActivityRecord | null>(null),
    [document, setDocument] = useState<GuestLearningDocument>(createEmptyGuestLearning),
    [activityId, setActivityId] = useState<string>(() => crypto.randomUUID()),
    [audience, setAudience] = useState<"principal_private" | "team_shared">("principal_private"),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [step, setStep] = useState(0),
    [contextDirty, setContextDirty] = useState(false),
    [handoffDirty, setHandoffDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [sharedConfirm, setSharedConfirm] = useState(false),
    [expired, setExpired] = useState(() => Date.now() >= Date.parse(view.accessExpiresAt)),
    [retry, setRetry] = useState(0);
  const alive = useRef(true),
    epoch = useRef(0),
    pending = useRef<{ input: SaveGuestActivityInput; sent: GuestLearningDocument } | null>(null),
    current = useRef(document),
    currentRecord = useRef(record),
    activityRef = useRef(activityId),
    scopeRef = useRef(`${view.classId}:${view.teamId}:${view.principalId}`);
  current.current = document;
  currentRecord.current = record;
  activityRef.current = activityId;
  const { classId, teamId, principalId } = view;
  const normalized = prepareGuestLearningSave(document, record?.document ?? null),
    dirty = fingerprint(normalized) !== fingerprint(record?.document ?? createEmptyGuestLearning());
  const hasUnsavedWork = dirty || contextDirty || handoffDirty || busy || uncertain;
  const dirtyReporter = useRef(onDirtyChange);
  dirtyReporter.current = onDirtyChange;
  useEffect(() => {
    onDirtyChange?.(hasUnsavedWork);
  }, [hasUnsavedWork, onDirtyChange]);
  useEffect(
    () => () => {
      dirtyReporter.current?.(false);
    },
    [],
  );
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || contextDirty || handoffDirty || busy || uncertain,
    enableBeforeUnload: dirty || contextDirty || handoffDirty || busy || uncertain,
    withResolver: true,
  });
  useEffect(() => {
    const timer = setInterval(
      () => setExpired(Date.now() >= Date.parse(view.accessExpiresAt)),
      1000,
    );
    return () => clearInterval(timer);
  }, [view.accessExpiresAt]);
  useEffect(() => {
    alive.current = true;
    const token = ++epoch.current;
    setLoaded(false);
    void listGuestActivities({ data: { csrf } })
      .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
      .then((r) => {
        if (!alive.current || token !== epoch.current) return;
        if (!r.ok) {
          setError(guestActivityMessage(r.code));
          return;
        }
        if (r.data.some((h) => !matches(h, { classId, teamId, principalId }))) {
          setError(
            "This activity list does not match your current class identity. Reopen your access.",
          );
          return;
        }
        setHeaders(r.data);
        setLoaded(true);
        setError("");
      });
    return () => {
      alive.current = false;
      // Request epoch, not a DOM ref: invalidate receipts after scope unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
    };
  }, [csrf, classId, teamId, principalId, retry]);
  function update(fn: (d: GuestLearningDocument) => void) {
    if (!loaded || expired) return;
    setDocument((old) => {
      const next = structuredClone(old);
      fn(next);
      return next;
    });
    setNotice("");
    if (!conflict && !uncertain) setError("");
  }
  function confirmDiscard() {
    return (
      !(dirty || contextDirty || handoffDirty || uncertain) ||
      window.confirm(
        "There is unsaved local work or an unconfirmed save. Export or keep this page to retain it. Discard local edits and change activity?",
      )
    );
  }
  function start(shared: boolean) {
    if (busy || !confirmDiscard()) return;
    epoch.current++;
    pending.current = null;
    setRecord(null);
    setDocument(createEmptyGuestLearning());
    setActivityId(crypto.randomUUID());
    setAudience(shared ? "team_shared" : "principal_private");
    setConflict(false);
    setUncertain(false);
    setContextDirty(false);
    setHandoffDirty(false);
    setSharedConfirm(false);
    setStep(0);
    setError("");
    setNotice(
      shared
        ? "New blank team planning space. No private notes were copied."
        : "New principal-private activity. Only this learner identity can open its source work.",
    );
  }
  async function open(id: string, discard = true) {
    if (busy || (discard && !confirmDiscard())) return;
    const token = ++epoch.current;
    setBusy(true);
    setError("");
    const r = await loadGuestActivity({ data: { csrf, activityId: id } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!alive.current || token !== epoch.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(guestActivityMessage(r.code));
      return;
    }
    if (r.data.id !== id || !matches(r.data, view)) {
      setError("This saved activity does not match the current class identity.");
      return;
    }
    setActivityId(id);
    setAudience(r.data.audience);
    setRecord(r.data);
    setDocument(r.data.document);
    pending.current = null;
    setConflict(false);
    setUncertain(false);
    setContextDirty(false);
    setHandoffDirty(false);
    setSharedConfirm(false);
    setNotice(`Opened saved revision ${r.data.revision}.`);
    setStep(0);
  }
  async function save() {
    if (busy || !loaded || expired || conflict) return;
    let attempt = pending.current;
    if (!attempt) {
      const parsed = guestLearningDocumentSchema.safeParse(
        prepareGuestLearningSave(current.current, currentRecord.current?.document ?? null),
      );
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the activity fields.");
        return;
      }
      attempt = {
        sent: structuredClone(current.current),
        input: {
          csrf,
          activityId,
          audience,
          expectedRevision: record?.revision ?? 0,
          mutationId: crypto.randomUUID(),
          sharedAudienceConfirmed: sharedConfirm,
          document: parsed.data,
        },
      };
      pending.current = attempt;
    }
    const token = ++epoch.current;
    setBusy(true);
    setError("");
    const sent = attempt;
    const r = await saveGuestActivity({ data: sent.input }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!alive.current || token !== epoch.current || activityRef.current !== sent.input.activityId)
      return;
    setBusy(false);
    if (!r.ok) {
      if (r.code === "UNAVAILABLE") {
        setUncertain(true);
      } else {
        pending.current = null;
        setUncertain(false);
        if (r.code === "CONFLICT" || r.code === "IDEMPOTENCY_CONFLICT" || r.code === "CHANGED")
          setConflict(true);
      }
      setError(guestActivityMessage(r.code));
      return;
    }
    const saved = r.data.record;
    if (
      saved.id !== sent.input.activityId ||
      saved.audience !== sent.input.audience ||
      !matches(saved, view)
    ) {
      setConflict(true);
      setUncertain(true);
      setError("The receipt did not match this class activity. Keep local work and reopen access.");
      return;
    }
    pending.current = null;
    setUncertain(false);
    setHeaders((old) => [saved, ...old.filter((h) => h.id !== saved.id)]);
    if (r.data.savedRevision !== saved.revision) {
      setConflict(true);
      setError(
        `This request saved revision ${r.data.savedRevision}, but the current server record is revision ${saved.revision}. Local edits are preserved. Export them, then reload the newer saved version.`,
      );
      return;
    }
    setRecord(saved);
    setSharedConfirm(false);
    if (fingerprint(current.current) === fingerprint(sent.sent)) {
      setDocument(saved.document);
      setNotice(`Saved revision ${saved.revision}${r.data.replayed ? " · confirmed retry" : ""}.`);
    } else {
      setDocument(prepareGuestLearningSave(current.current, saved.document));
      setNotice(
        `Revision ${saved.revision} saved. Edits made while saving are still local; save again to keep them.`,
      );
    }
  }
  async function authorizeExport() {
    const capturedId = activityId,
      baseline = record,
      capturedScope = scopeRef.current;
    guestLearningDocumentSchema.parse(current.current);
    if (expired || Date.now() >= Date.parse(view.accessExpiresAt))
      throw new Error("Class access ended. Guest source export is no longer available.");
    const session = await bootstrapGuestSession();
    if (
      !alive.current ||
      capturedScope !== scopeRef.current ||
      capturedId !== activityRef.current ||
      !session.ok ||
      !session.data ||
      session.csrf !== csrf ||
      session.data.classId !== view.classId ||
      session.data.teamId !== view.teamId ||
      session.data.principalId !== view.principalId ||
      session.data.accessExpiresAt !== view.accessExpiresAt
    )
      throw new Error("Your class identity or access changed. Reopen access before exporting.");
    if (baseline) {
      const r = await loadGuestActivity({ data: { csrf, activityId: capturedId } });
      if (
        !alive.current ||
        capturedId !== activityRef.current ||
        !r.ok ||
        !matches(r.data, view) ||
        r.data.revision !== baseline.revision ||
        fingerprint(r.data.document) !== fingerprint(baseline.document)
      )
        throw new Error(
          "This saved source or its permission changed. Reload and review before exporting.",
        );
    }
  }
  if (!loaded)
    return (
      <section className="rounded-2xl border bg-card p-7">
        <h2 className="text-xl font-bold">Your classroom learning space</h2>
        {error ? (
          <>
            <p role="alert" className="my-4">
              {error}
            </p>
            <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
              Retry activity list
            </Button>
          </>
        ) : (
          <p role="status" className="mt-4">
            Opening your scoped activity list…
          </p>
        )}
      </section>
    );
  const shared = audience === "team_shared";
  let exportOffers: ActivityOffer[] = [];
  let exportInvalid = false;
  try {
    exportOffers = guestLearningActivities(
      document,
      {
        savedAt: record?.savedAt ?? null,
        ...(record ? { revision: record.revision } : {}),
        dirty,
        fictional: /\bfictional\b/i.test(
          [view.className, view.teamAlias, view.principalAlias].join(" "),
        ),
      },
      audience,
    );
  } catch {
    exportInvalid = true;
  }

  return (
    <section aria-label="Guest learning workspace" className="space-y-6">
      <header className="rounded-2xl border bg-card p-6 xl:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              First Ten · classroom learning studio
            </p>
            <h2 className="mt-2 text-3xl font-bold">One conversation. A clearer next move.</h2>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Frame an idea, test an assumption and decide what to try next. Your own thinking comes
              first. This seven-step manual space does not call AI or contact anyone.
            </p>
          </div>
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              {shared ? <Users className="size-4" /> : <LockKeyhole className="size-4" />}
              {shared ? "Team-shared planning" : "Principal-private work"}
            </p>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              {shared
                ? "Current and future teammates can read and edit this space. Keep raw interviews and identifying participant details in a separate private activity."
                : "This learner identity can open the source work. Teachers see only separately reviewed submitted copies."}
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm">
          Access ends <strong>{new Date(view.accessExpiresAt).toLocaleString()}</strong>. Return
          with your private recovery key while the class is open. Export before this deadline;
          post-expiry access ends. Requested retention of {view.retentionDays} days is not a promise
          of automatic deletion or continued access.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" disabled={busy || expired} onClick={() => start(false)}>
            New private activity
          </Button>
          <Button variant="outline" disabled={busy || expired} onClick={() => start(true)}>
            New blank team planning space
          </Button>
        </div>
        {headers.length > 0 && (
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-semibold">Open saved activity</span>
            <select
              className="min-h-11 w-full rounded-lg border bg-background px-3"
              value={record?.id ?? ""}
              disabled={busy || expired}
              onChange={(e) => {
                if (e.target.value) void open(e.target.value);
              }}
            >
              <option value="">Current new activity</option>
              {headers.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {h.audience === "principal_private" ? "Private" : "Team-shared"} activity {i + 1}{" "}
                  · revision {h.revision} · {new Date(h.savedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {expired && (
        <p role="alert" className="rounded-xl border border-destructive p-5">
          Class access has ended. Current local text is still shown, but saving, sharing and source
          export require active access. Do not assume retained records can be reopened after expiry.
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <nav
          aria-label="Seven learning steps"
          className="rounded-2xl border bg-card p-3 xl:sticky xl:top-5"
        >
          {guestSteps.map((title, i) => (
            <button
              key={title}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${step === i ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                {i + 1}
              </span>
              {title}
            </button>
          ))}
          <p className="p-3 text-xs text-muted-foreground">
            The steps guide inquiry. Progress is not a validation score or proof of demand.
          </p>
        </nav>
        <div className="min-w-0 space-y-5">
          <article className="rounded-2xl border bg-card p-6 xl:p-8">
            <div className="mb-6 flex items-center gap-3">
              <BookOpen className="size-6 text-primary" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Step {step + 1} of 7
                </p>
                <h3 className="text-2xl font-bold">{guestSteps[step]}</h3>
              </div>
            </div>
            <fieldset disabled={expired}>
              <GuestLearningSteps
                key={activityId}
                step={step}
                document={document}
                update={update}
                shared={shared}
              />
            </fieldset>
            <div className="mt-7 flex justify-between gap-3 border-t pt-5">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft />
                Previous
              </Button>
              <Button variant="outline" disabled={step === 6} onClick={() => setStep((s) => s + 1)}>
                Next
                <ArrowRight />
              </Button>
            </div>
          </article>
          <GuestContext
            key={`context:${activityId}`}
            document={document.discovery}
            disabled={expired}
            shared={shared}
            onDraftChange={setContextDirty}
            update={(fn) => update((n) => fn(n.discovery))}
          />
          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <h3 className="font-bold">Separate processing and sharing choices</h3>
            <p className="text-sm text-muted-foreground">
              These choices cover this activity's own material. Interview choices are separate. AI
              is off in this class; reporting permission does not enable it. A sharing choice alone
              never grants access.
              {shared &&
                " Changing this choice does not turn a team planning space private or remove teammates. Its current and future team audience stays in place; this choice controls new reviewed-copy eligibility."}
            </p>
            <fieldset disabled={expired} className="grid gap-4 lg:grid-cols-2">
              {(
                [
                  ["ai", "External AI processing"],
                  ["sharing", "Sharing selected activity material"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-2 text-sm">
                  <span className="block font-semibold">{label}</span>
                  <select
                    className="min-h-11 w-full rounded-lg border bg-background px-3"
                    value={document.permissions[key]}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "unknown" || v === "granted" || v === "withdrawn")
                        update((n) => {
                          n.permissions[key] = v;
                        });
                    }}
                  >
                    <option value="unknown">Unknown / not asked</option>
                    <option value="granted">Reported permission granted</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <p className="text-sm font-semibold">
              {record ? `Last saved revision ${record.revision}` : "New activity · not saved"}
              {dirty ? " · unsaved edits" : ""}
            </p>
            {shared && !record && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={sharedConfirm}
                  onChange={(e) => setSharedConfirm(e.target.checked)}
                />
                I understand this blank planning activity and future edits will be visible to
                current and future teammates. No private notes were copied here.
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  busy ||
                  expired ||
                  conflict ||
                  (!dirty && !uncertain && Boolean(record)) ||
                  (shared && !record && !sharedConfirm)
                }
                onClick={() => void save()}
              >
                <Save />
                {busy ? "Saving…" : uncertain ? "Retry the identical save" : "Save activity"}
              </Button>
              {(record || conflict) && (
                <Button
                  variant="outline"
                  disabled={busy || expired}
                  onClick={() => void open(record?.id ?? activityId)}
                >
                  Reload saved version
                </Button>
              )}
            </div>
            {uncertain && (
              <p className="text-sm">
                The last save is unconfirmed. Retry keeps its exact document and request ID, even if
                you edited afterward. Later edits remain local until that receipt is resolved.
              </p>
            )}
            {(contextDirty || handoffDirty) && (
              <p className="text-xs text-muted-foreground">
                Unadded context or reviewed-copy form text is local only and is not included in Save
                activity.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
          </section>
          {exportInvalid ? (
            <p role="status" className="rounded-xl border p-5 text-sm">
              The current draft needs valid field lengths, exact scripts and permission choices
              before a PDF can be prepared. Remove likely secrets. Your local text remains here; no
              saved work was changed.
            </p>
          ) : (
            <GuestActivityExport
              key={`export:${activityId}`}
              offers={exportOffers}
              team={shared}
              authorizeDownload={authorizeExport}
            />
          )}
          <GuestReviewedHandoff
            key={`handoff:${activityId}`}
            view={view}
            csrf={csrf}
            record={record}
            dirty={dirty || busy || expired || conflict || uncertain}
            onDraftChange={setHandoffDirty}
          />
        </div>
      </div>
      {blocker.status === "blocked" && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Keep your unsaved activity"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
        >
          <div className="max-w-lg space-y-5 rounded-2xl bg-background p-7">
            <h2 className="text-xl font-bold">Keep your unsaved activity?</h2>
            <p>
              Local edits, unadded context or an unconfirmed save will be lost if you leave. Save or
              export while access is active.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => blocker.reset()}>Keep working</Button>
              <Button variant="outline" onClick={() => blocker.proceed()}>
                Leave without saving
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
