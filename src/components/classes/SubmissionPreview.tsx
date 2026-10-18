import { useEffect, useRef, useState } from "react";
import { previewSubmission, submitSnapshot } from "@/lib/submissions.functions";
import {
  submissionMessage,
  type SubmissionSelector,
  type SubmissionPayload,
  type SubmissionView,
  previewSubmissionSchema,
} from "@/lib/submissions/contracts";
import type { z } from "zod";
type Source = z.infer<typeof previewSubmissionSchema>["source"];
export type SubmissionSourceOption = { label: string; selection: SubmissionSelector };
type Props = {
  scopeKey: string;
  classId: string;
  assignmentId: string;
  source: Source;
  sourceOptions: SubmissionSourceOption[];
  threadId?: string;
  onSubmitted?: (submission: SubmissionView) => void;
};
const field = "mt-2 block min-h-11 w-full rounded-xl border bg-background p-3";
const button =
  "min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50";
/** Caller supplies a verified scope key and owner-acquired source options.
 * Server authorization never trusts those options or a presentation role. */
export function SubmissionPreview(props: Props) {
  const identity = JSON.stringify([
    props.scopeKey,
    props.classId,
    props.assignmentId,
    props.source,
    props.threadId,
  ]);
  return <Preview key={identity} {...props} />;
}
function Preview({ classId, assignmentId, source, sourceOptions, threadId, onSubmitted }: Props) {
  const [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState("Discovery check-in");
  const [interpretation, setInterpretation] = useState(""),
    [uncertainty, setUncertainty] = useState(""),
    [decision, setDecision] = useState(""),
    [nextAction, setNextAction] = useState("");
  const [redactions, setRedactions] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [affirmed, setAffirmed] = useState(false);
  const [review, setReview] = useState<{
    fingerprint: string;
    preview: Awaited<ReturnType<typeof previewSubmission>> & { ok: true };
  } | null>(null);
  const thread = useRef(threadId ?? crypto.randomUUID()),
    intent = useRef<{ fingerprint: string; id: string } | null>(null),
    confirmIntent = useRef<{ id: string; previewId: string } | null>(null);
  const epoch = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const specification = {
    source,
    classId,
    assignmentId,
    threadId: thread.current,
    audience: "teacher" as const,
    selections: sourceOptions
      .filter((option) => selected.includes(JSON.stringify(option.selection)))
      .map((option) => option.selection),
    redactions: redactions
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean),
    reflection: { title, interpretation, uncertainty, decision, nextAction },
  };
  const fingerprint = JSON.stringify(specification),
    latest = useRef(fingerprint);
  latest.current = fingerprint;
  const current = review?.fingerprint === fingerprint ? review.preview.data : null;
  return (
    <section
      aria-label="Review a classroom submission"
      className="space-y-5 rounded-2xl border bg-card p-6"
    >
      <div>
        <h2 className="text-xl font-bold">Choose what your teachers receive</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only the exact selected, redacted version below is submitted. Your private projects,
          unselected notes, contacts and later edits stay private. Free text is owner-reported, not
          verified evidence.
        </p>
      </div>
      {source.type === "guest_team" && (
        <p className="rounded-xl border p-4 text-sm">
          Guest activity sources are not ready yet. This foundation cannot submit invented account
          projects or placeholder guest work.
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          setReview(null);
          setAffirmed(false);
          const run = ++epoch.current,
            stamp = fingerprint;
          if (!intent.current || intent.current.fingerprint !== stamp)
            intent.current = { fingerprint: stamp, id: crypto.randomUUID() };
          const result = await previewSubmission({
            data: { ...specification, requestId: intent.current.id },
          });
          if (!alive.current || run !== epoch.current) return;
          setBusy(false);
          if (latest.current !== stamp) return;
          if (result.ok) setReview({ fingerprint: stamp, preview: result });
          else setMessage(submissionMessage(result.code));
        }}
      >
        <fieldset className="space-y-3">
          <legend className="font-semibold">Explicitly selected source fields</legend>
          {sourceOptions.length === 0 && (
            <p className="text-sm">
              No authorized source options were supplied. Save your own work and choose an eligible
              source; no example is substituted.
            </p>
          )}
          {sourceOptions.map((option) => (
            <label
              key={JSON.stringify(option.selection)}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(JSON.stringify(option.selection))}
                onChange={(event) => {
                  setSelected((old) =>
                    event.target.checked
                      ? [...old, JSON.stringify(option.selection)]
                      : old.filter((value) => value !== JSON.stringify(option.selection)),
                  );
                  setAffirmed(false);
                }}
              />
              <span>
                {option.label}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Separate recorded sharing permission is required. Interview notes additionally
                  require note-taking and linked-contact sharing permission.
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-semibold">
          Submission title
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
          />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          {(
            [
              ["Your interpretation", interpretation, setInterpretation, 3000],
              ["Uncertainty / counterevidence", uncertainty, setUncertainty, 2000],
              ["Your decision", decision, setDecision, 2000],
              ["Next action", nextAction, setNextAction, 2000],
            ] as const
          ).map(([label, value, setter, max]) => (
            <label key={label} className="block text-sm font-semibold">
              {label}
              <textarea
                maxLength={max}
                value={value}
                onChange={(event) => setter(event.target.value)}
                className={field + " min-h-24"}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm font-semibold">
          Redact exact phrases (one per line, up to 30)
          <textarea
            value={redactions}
            onChange={(event) => {
              setRedactions(event.target.value);
              setAffirmed(false);
            }}
            className={field + " min-h-24"}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Email addresses and UUID identifiers are removed automatically. Review every word: a
          preview is not permission and does not submit anything.
        </p>
        <button
          className={button}
          disabled={
            busy || specification.selections.length === 0 || source.type !== "account_project"
          }
        >
          Create exact teacher preview
        </button>
      </form>
      {current && (
        <div className="space-y-4 rounded-2xl border border-primary p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Audience: active teachers of this class
          </p>
          <SubmissionPayloadView payload={current.payload} />
          <p className="text-xs text-muted-foreground">
            Preview expires {new Date(current.expiresAt).toLocaleTimeString()}. Source or permission
            changes require a new preview. Teachers cannot retrieve the underlying private records
            through this submission. Changes to class/assignment access, enrollment, association or
            recorded choices require a newly reviewed publication; restoring access alone does not
            restore an older disclosure.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={affirmed}
              onChange={(event) => setAffirmed(event.target.checked)}
            />
            I reviewed this exact version and its audience. I have permission for the selected
            excerpts. I understand that withdrawal blocks future app access but cannot recall copies
            already viewed or downloaded.
          </label>
          <button
            className={button}
            disabled={busy || !affirmed}
            onClick={async () => {
              if (busy || !affirmed) return;
              if (Date.now() >= new Date(current.expiresAt).getTime()) {
                setMessage(submissionMessage("EXPIRED"));
                setReview(null);
                return;
              }
              const run = ++epoch.current,
                stamp = fingerprint;
              setBusy(true);
              setMessage("");
              if (!confirmIntent.current || confirmIntent.current.previewId !== current.id)
                confirmIntent.current = { previewId: current.id, id: crypto.randomUUID() };
              const result = await submitSnapshot({
                data: {
                  previewId: current.id,
                  previewHash: current.hash,
                  requestId: confirmIntent.current.id,
                },
              });
              if (!alive.current || run !== epoch.current) return;
              setBusy(false);
              if (latest.current !== stamp) return;
              if (result.ok) {
                setReview(null);
                setAffirmed(false);
                setMessage(
                  "The selected version was saved. Teacher access is checked on every read; future private edits are not submitted.",
                );
                onSubmitted?.(result.data);
              } else {
                setMessage(submissionMessage(result.code));
                if (result.code !== "UNAVAILABLE") setReview(null);
              }
            }}
          >
            Submit this reviewed version
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="rounded-xl border p-4 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
export function SubmissionPayloadView({ payload }: { payload: SubmissionPayload }) {
  return (
    <article className="space-y-4">
      <h3 className="text-xl font-bold">{payload.title}</h3>
      <p className="text-xs font-semibold text-muted-foreground">
        Selected owner-reported work · not independently verified
      </p>
      {payload.excerpts.map((excerpt) => (
        <section key={excerpt.key} className="rounded-xl border p-4">
          <h4 className="font-semibold">{excerpt.label}</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm">{excerpt.text}</p>
          <p className="mt-2 text-xs text-muted-foreground">{excerpt.evidenceLabel}</p>
        </section>
      ))}
      {(
        [
          ["Interpretation", payload.interpretation],
          ["Uncertainty", payload.uncertainty],
          ["Decision", payload.decision],
          ["Next action", payload.nextAction],
        ] as const
      ).map(([label, text]) => (
        <section key={label}>
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm">{text || "Not entered"}</p>
        </section>
      ))}
    </article>
  );
}
