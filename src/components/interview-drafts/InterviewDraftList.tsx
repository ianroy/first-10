import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/AppShell";
import { useContacts, type Project } from "@/lib/data";
import { createInterviewDraft, listInterviewDrafts } from "@/lib/interview-drafts.functions";
import {
  draftQuestionsSchema,
  draftErrorText,
  type InterviewDraftSummary,
} from "@/lib/interview-drafts";
export function InterviewDraftList({
  project,
  onResume,
  canStart,
}: {
  project: Project;
  onResume: (id: string) => void;
  canStart: boolean;
}) {
  const { data: contacts = [], error: contactsError } = useContacts(project.id);
  const [drafts, setDrafts] = useState<InterviewDraftSummary[] | null>(null);
  const [who, setWho] = useState("");
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    active.current = true;
    let current = true;
    setDrafts(null);
    void listInterviewDrafts({ data: { projectId: project.id } })
      .then((r) => {
        if (!current) return;
        if (r.ok) setDrafts(r.drafts);
        else setError(draftErrorText[r.code]);
      })
      .catch(() => {
        if (current) setError(draftErrorText.UNAVAILABLE);
      });
    return () => {
      active.current = false;
      current = false;
    };
  }, [project.id, attempt]);
  async function start() {
    const q = draftQuestionsSchema.safeParse(project.questions);
    if (!q.success) {
      setError(q.error.issues[0]?.message ?? "Review the saved questions.");
      return;
    }
    const data = {
      projectId: project.id,
      contactId: who === "manual" ? null : who,
      expectedQuestions: q.data,
      expectedOriginId: project.questions_origin_id ?? null,
      noteStatus: asked ? ("granted" as const) : ("unknown" as const),
    };
    const fingerprint = JSON.stringify(data);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    const r = await createInterviewDraft({ data: { ...data, draftId: pending.current.id } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!active.current) return;
    setBusy(false);
    if (r.ok) onResume(r.draft.id);
    else setError(draftErrorText[r.code]);
  }
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-lg font-bold">Resume an interview draft</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Private saved notes keep their original questions. Drafts do not count as interviews or
          enter AI evidence.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {drafts === null ? (
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Retry / refresh drafts
          </Button>
        ) : drafts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No incomplete drafts saved for this idea yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {drafts.map((d, i) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div>
                  <p className="font-semibold">
                    {contacts.find((c) => c.id === d.contactId)?.first_name ||
                      `Private draft ${i + 1}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.answeredCount} of {d.questionCount} questions have notes · revision{" "}
                    {d.revision}
                    <br />
                    Saved {new Date(d.savedAt).toLocaleString()}
                  </p>
                </div>
                <Button variant="outline" onClick={() => onResume(d.id)}>
                  Resume draft {i + 1}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-bold">Start a separate interview draft</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This saves an empty private draft with the exact current saved questions. It does not
          record a completed conversation.
        </p>
        {canStart ? (
          <>
            <label htmlFor="draft-contact" className="mt-4 block text-sm font-semibold">
              Person for this conversation
            </label>
            <select
              id="draft-contact"
              className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              disabled={busy || !!contactsError}
            >
              <option value="">Choose a saved person</option>
              <option value="manual">No linked person — manual conversation</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name || "Unnamed person"} · Stage {c.stage} · {c.status}
                </option>
              ))}
            </select>
            {contactsError && (
              <p className="mt-2 text-sm text-destructive">
                People could not be loaded. Retry from People before starting.
              </p>
            )}
            <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
              <input
                className="mt-1 size-5"
                type="checkbox"
                checked={asked}
                disabled={busy}
                onChange={(e) => setAsked(e.target.checked)}
              />
              I asked if it’s okay to take notes, and they said yes.
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              You may begin without that permission and keep notes disabled. AI and sharing choices
              start unknown.
            </p>
            <Button
              className="mt-4"
              disabled={busy || !who || !!contactsError || drafts === null}
              onClick={() => void start()}
            >
              {busy ? "Opening draft…" : "Begin"}
            </Button>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Save a preparation script before beginning a new draft. Existing drafts can always
            resume their own question snapshot.
          </p>
        )}
      </Card>
    </div>
  );
}
