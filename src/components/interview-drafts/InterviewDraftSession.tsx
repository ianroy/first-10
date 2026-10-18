import { useEffect, useRef, useState } from "react";
import { useInterviewDraft } from "@/lib/useInterviewDraft";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { ConsentFields } from "@/components/ConsentFields";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { AIOrigin } from "@/components/AIOrigin";
import { TAGS, useContacts, useRefresh, type Project } from "@/lib/data";
import { completeInterviewDraft } from "@/lib/interview-drafts.functions";
import { draftErrorText, type InterviewDraftDocument } from "@/lib/interview-drafts";
import { interviewDraftActivities } from "@/lib/export/interview-draft-adapters";
export function InterviewDraftSession({
  project,
  draftId,
  onDone,
}: {
  project: Project;
  draftId: string;
  onDone: () => void;
}) {
  return (
    <ScopedInterviewDraftSession
      key={`${project.user_id}:${project.id}:${draftId}`}
      project={project}
      draftId={draftId}
      onDone={onDone}
    />
  );
}
function ScopedInterviewDraftSession({
  project,
  draftId,
  onDone,
}: {
  project: Project;
  draftId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [action, setAction] = useState<"exit" | "reload" | "complete" | "clear" | null>(null),
    [conducted, setConducted] = useState(false);
  const session = useInterviewDraft({
    ownerId: project.user_id,
    projectId: project.id,
    draftId,
    suspendAutosave: busy || action !== null,
  });
  const {
    record,
    doc,
    contactId,
    dirty,
    conflict,
    error,
    notice,
    accept,
    change,
    setError,
    setNotice,
    setConflict,
  } = session;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setConducted(false);
  }, [record?.revision]);
  async function save(next?: InterviewDraftDocument) {
    setBusy(true);
    await session.save(next);
    if (mounted.current) setBusy(false);
  }
  const {
    data: contacts = [],
    isLoading: contactsLoading,
    error: contactsError,
  } = useContacts(project.id);
  const refresh = useRefresh();
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || busy || session.saving || session.loading,
    enableBeforeUnload: dirty || busy || session.saving || session.loading,
    withResolver: true,
  });
  async function confirm() {
    const next = action;
    setAction(null);
    if (next === "exit") {
      onDone();
      return;
    }
    if (next === "reload") {
      await session.reload();
      return;
    }
    if (next === "clear" && doc) {
      const cleared = structuredClone(doc);
      cleared.answers = cleared.answers.map((a) => ({ ...a, note: "", quote: "" }));
      cleared.tags = [];
      cleared.choices = {
        noteStatus: "withdrawn",
        aiStatus: "withdrawn",
        sharingStatus: "withdrawn",
      };
      change((value) => Object.assign(value, cleared));
      await save(cleared);
      return;
    }
    if (
      next === "complete" &&
      record &&
      !dirty &&
      !session.saving &&
      !session.loading &&
      !session.paused &&
      conducted
    ) {
      setBusy(true);
      setError("");
      const r = await completeInterviewDraft({
        data: { projectId: project.id, draftId, expectedRevision: record.revision },
      }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
      if (!mounted.current) return;
      setBusy(false);
      if (r.ok) {
        accept({
          ...record,
          status: "completed",
          document: null,
          interviewId: r.interviewId,
          completedAt: new Date().toISOString(),
        });
        setNotice(
          r.replayed
            ? "This interview was already completed. No second record was created."
            : "Interview completed once with its saved permission choices.",
        );
        refresh("interviews", "contacts");
      } else {
        setError(draftErrorText[r.code]);
        if (["CONFLICT", "ALREADY_COMPLETED"].includes(r.code)) setConflict(true);
      }
    }
  }
  const i = doc?.currentQuestion ?? 0,
    last = !!doc && i === doc.answers.length,
    missingContact =
      !!contactId &&
      !contactsLoading &&
      !contactsError &&
      !contacts.some((c) => c.id === contactId);
  const label = contacts.find((c) => c.id === contactId)?.first_name;
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Private interview workspace
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {record?.status === "completed"
              ? "Interview completion receipt"
              : label
                ? `Listening to ${label}`
                : "Resume your conversation"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Changes save automatically after a short pause. Only confirmed saves can be resumed;
            keep this page open until saved. Only explicit completion records an interview.
            Questions remain the exact snapshot captured at the start.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || session.saving || session.loading}
          onClick={() => (dirty ? setAction("exit") : onDone())}
        >
          <ArrowLeft />
          Back to preparation
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-destructive/40 p-4 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-5 rounded-xl bg-secondary p-4 text-sm">
          {notice}
        </p>
      )}
      {!record ? (
        <div>
          <p>Opening the saved private draft…</p>
          {error && (
            <Button variant="outline" onClick={session.retryOpening}>
              Retry opening draft
            </Button>
          )}
        </div>
      ) : record.status === "completed" ? (
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-xl font-bold">This draft has already been completed.</h2>
          <p className="mt-3 text-muted-foreground">
            Its duplicate draft notes were cleared when the interview was recorded. Review the
            completed interview and its current processing choices from preparation. This receipt
            will never create another record, even after a retry.
          </p>
          <Button className="mt-5" onClick={onDone}>
            Return to saved interviews
          </Button>
        </div>
      ) : (
        doc && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-secondary px-3 py-1">
                {session.saving
                  ? "Saving…"
                  : session.paused
                    ? "Autosave paused · local work retained"
                    : dirty
                      ? "Unsaved changes · waiting to save"
                      : `Saved revision ${record.revision}`}
              </span>
              <span>Incomplete · excluded from AI evidence</span>
              <Button
                variant="ghost"
                disabled={busy || session.saving || session.loading}
                onClick={() => setAction("reload")}
              >
                Review / reload saved draft
              </Button>
            </div>
            {session.paused && !conflict && (
              <p className="mb-4 text-sm text-muted-foreground">
                Automatic saving is paused. If a result is unconfirmed, Save draft retries that
                exact request first; newer local edits stay here and save only after its
                acknowledgement. Reconnecting does not retry automatically. No private text is
                stored in browser storage.
              </p>
            )}
            {conflict && (
              <section
                className="mb-5 rounded-xl border p-4"
                aria-label="Conflicting interview versions"
              >
                <p className="text-sm">
                  Your local version remains editable and exportable. Compare the current saved
                  version before choosing whether to reload. Permissions are never merged
                  automatically.
                </p>
                <Button
                  variant="outline"
                  disabled={busy || session.loading || session.saving}
                  onClick={() => void session.reload(true)}
                >
                  Compare saved version
                </Button>
                {session.remote && (
                  <div className="mt-4" aria-label="Current remote interview draft">
                    <h2 className="font-semibold">
                      Saved revision {session.remote.revision} · {session.remote.status}
                    </h2>
                    {session.remote.document ? (
                      <>
                        <p className="text-sm">
                          Note permission: {session.remote.document.choices.noteStatus}; AI:{" "}
                          {session.remote.document.choices.aiStatus}; sharing:{" "}
                          {session.remote.document.choices.sharingStatus}.
                        </p>
                        {session.remote.document.answers.map((answer, index) => (
                          <article key={index} className="mt-3 border-t py-3">
                            <h3>{answer.q}</h3>
                            <p className="whitespace-pre-wrap">
                              {answer.note || "No saved observation"}
                            </p>
                            <p className="whitespace-pre-wrap">
                              {answer.quote || "No saved quote"}
                            </p>
                          </article>
                        ))}
                      </>
                    ) : (
                      <p>The saved draft is completed; only its completion receipt remains.</p>
                    )}
                    <p className="mt-3 text-sm">
                      Export or copy your local work before using Review / reload saved draft to
                      replace it deliberately.
                    </p>
                  </div>
                )}
              </section>
            )}
            {missingContact && (
              <div role="alert" className="mb-5 rounded-xl border p-4 text-sm">
                The saved person is no longer available. Keep the notes and explicitly unlink the
                reference before saving or completing.
                <Button
                  className="ml-3"
                  variant="outline"
                  disabled={busy}
                  onClick={session.unlinkContact}
                >
                  Unlink unavailable person
                </Button>
              </div>
            )}
            <AIOrigin originId={record.originId} projectId={project.id} />
            <div
              className="my-5 h-1.5 rounded-full bg-muted"
              role="progressbar"
              aria-label="Interview progress"
              aria-valuemin={0}
              aria-valuemax={doc.answers.length}
              aria-valuenow={i}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(i / doc.answers.length) * 100}%` }}
              />
            </div>
            <fieldset disabled={busy || session.loading} className="space-y-6">
              <details className="rounded-xl border bg-card p-4">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Note, AI and sharing choices
                </summary>
                <ConsentFields
                  value={doc.choices}
                  onChange={(v) =>
                    change((d) => {
                      d.choices = v;
                    })
                  }
                  disabled={busy}
                  label="Choices stored with this private draft"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Choices are your reports, not verified participant consent. Drafts are never sent
                  to AI or shared. Completion carries these exact saved choices to the interview.
                </p>
              </details>
              {doc.choices.noteStatus !== "granted" && (
                <div className="rounded-xl bg-secondary p-4 text-sm">
                  Notes are disabled until reported note permission is granted.{" "}
                  {doc.answers.some((a) => a.note || a.quote) &&
                    "Existing local notes must be cleared before saving a non-granted choice."}
                </div>
              )}
              {last ? (
                <section className="rounded-2xl border bg-card p-6">
                  <h2 className="font-display text-2xl font-bold">Review what you heard</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Statements about willingness to use or pay are not observed use or payment.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {TAGS.map((t) => (
                      <button
                        type="button"
                        key={t}
                        aria-pressed={doc.tags.includes(
                          t as InterviewDraftDocument["tags"][number],
                        )}
                        className={`min-h-12 rounded-xl border p-3 text-left ${doc.tags.includes(t as InterviewDraftDocument["tags"][number]) ? "border-primary bg-primary/10" : ""}`}
                        onClick={() =>
                          change((d) => {
                            const tag = t as InterviewDraftDocument["tags"][number];
                            d.tags = d.tags.includes(tag)
                              ? d.tags.filter((v) => v !== tag)
                              : [...d.tags, tag];
                          })
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <details className="mt-5">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      Review exact saved questions and current notes
                    </summary>
                    {doc.answers.map((a, n) => (
                      <article key={n} className="border-t py-4">
                        <h3 className="font-semibold">
                          {n + 1}. {a.q}
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm">
                          {a.note || "No observation entered"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm italic">
                          {a.quote || "No exact quote entered"}
                        </p>
                      </article>
                    ))}
                  </details>
                  <label className="mt-5 flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={conducted}
                      onChange={(e) => setConducted(e.target.checked)}
                    />
                    I conducted this conversation and reviewed the notes and permission choices.
                    Completion is my report, not independent verification.
                  </label>
                  {dirty && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Save the current draft first. Then confirm that exact saved revision as
                      complete.
                    </p>
                  )}
                </section>
              ) : (
                <section className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      Question {i + 1} of {doc.answers.length}
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-bold leading-tight">
                      {doc.answers[i]?.q}
                    </h2>
                    <p className="mt-4 text-muted-foreground">
                      Ask what happened last time, listen for a workaround and notice a
                      counterexample.
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-card p-5">
                    <label htmlFor="interview-notes" className="text-sm font-semibold">
                      Conversation notes
                    </label>
                    <Textarea
                      id="interview-notes"
                      className="mt-2 min-h-48 text-base"
                      maxLength={6000}
                      value={doc.answers[i]?.note ?? ""}
                      disabled={doc.choices.noteStatus !== "granted"}
                      onChange={(e) =>
                        change((d) => {
                          d.answers[i]!.note = e.target.value;
                        })
                      }
                    />
                    <label htmlFor="interview-quote" className="mt-5 block text-sm font-semibold">
                      Exact quote (optional)
                    </label>
                    <Input
                      id="interview-quote"
                      className="mt-2 min-h-12 text-base"
                      maxLength={2400}
                      value={doc.answers[i]?.quote ?? ""}
                      disabled={doc.choices.noteStatus !== "granted"}
                      onChange={(e) =>
                        change((d) => {
                          d.answers[i]!.quote = e.target.value;
                        })
                      }
                    />
                  </div>
                </section>
              )}
            </fieldset>
            <div className="my-6">
              <OwnerActivityExport
                project={project}
                activities={() =>
                  interviewDraftActivities(
                    project,
                    [{ ...record, contactId, document: doc }],
                    dirty,
                  )
                }
              />
            </div>
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-4">
              <Button
                variant="outline"
                disabled={busy || i === 0}
                onClick={() =>
                  change((d) => {
                    d.currentQuestion--;
                  })
                }
              >
                Back
              </Button>
              {!last && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    change((d) => {
                      d.currentQuestion++;
                    })
                  }
                >
                  Next
                </Button>
              )}
              <Button
                disabled={
                  busy ||
                  session.saving ||
                  session.loading ||
                  (!dirty && !session.paused) ||
                  conflict
                }
                onClick={() => void save()}
              >
                <Save />
                {busy ? "Working…" : "Save draft"}
              </Button>
              {last && (
                <Button
                  disabled={
                    busy ||
                    session.saving ||
                    session.loading ||
                    session.paused ||
                    dirty ||
                    conflict ||
                    !conducted ||
                    doc.choices.noteStatus !== "granted" ||
                    missingContact
                  }
                  onClick={() => setAction("complete")}
                >
                  Complete interview
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={
                  busy || session.saving || session.loading || session.uncertain || conflict
                }
                onClick={() => setAction("clear")}
              >
                Clear notes and save withdrawal
              </Button>
            </div>
          </>
        )
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
              {blocker.status === "blocked" || action === "exit"
                ? "Leave unsaved local changes?"
                : action === "complete"
                  ? "Complete this saved interview once?"
                  : action === "clear"
                    ? "Clear stored draft notes and withdraw permission?"
                    : "Reload the saved draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blocker.status === "blocked" || action === "exit"
                ? "Only the last confirmed save can be resumed. An unconfirmed request may still finish. Keep working to save or export your local changes first."
                : action === "complete"
                  ? "The exact saved revision and its choices will become one completed interview. This is your report of a conversation. No message or AI request is sent."
                  : action === "clear"
                    ? "All notes, quotes and tags in this draft will be cleared and all three choices set to withdrawn. The current saved draft has no historical raw-note copies. Downloaded or previously completed copies cannot be recalled."
                    : "Successful reload replaces local changes with the saved revision. If loading fails, your current local text stays here."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
                else void confirm();
              }}
            >
              {blocker.status === "blocked" || action === "exit"
                ? "Leave without saving"
                : action === "complete"
                  ? "Confirm completion"
                  : action === "clear"
                    ? "Clear notes and withdraw"
                    : "Reload saved draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
