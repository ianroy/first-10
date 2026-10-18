import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAI } from "@/lib/ai.functions";
import { validateAIOutput } from "@/lib/ai/contracts";
import { AppShell, Card, DraftBadge, Empty, PrivacyNote } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TAGS,
  useContacts,
  useInterviews,
  useRefresh,
  type Answer,
  type Project,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/interview")({
  head: () => ({
    meta: [
      { title: "Interview mode — First Ten" },
      { name: "description", content: "One question per screen, quick notes and tags." },
    ],
  }),
  component: () => <RequireProject>{(p) => <InterviewPage p={p} />}</RequireProject>,
});

function InterviewPage({ p }: { p: Project }) {
  const questions = (p.questions as string[]) ?? [];
  const [session, setSession] = useState<{ contactId: string | null } | null>(null);
  if (session)
    return (
      <Session
        p={p}
        questions={questions}
        contactId={session.contactId}
        onDone={() => setSession(null)}
      />
    );
  return <Prep p={p} questions={questions} onStart={(contactId) => setSession({ contactId })} />;
}

function Prep({
  p,
  questions,
  onStart,
}: {
  p: Project;
  questions: string[];
  onStart: (id: string | null) => void;
}) {
  const gen = useServerFn(generateAI);
  const refresh = useRefresh();
  const { data: contacts = [] } = useContacts(p.id);
  const { data: interviews = [] } = useInterviews(p.id);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [who, setWho] = useState("");
  const [asked, setAsked] = useState(false);
  const qs = draft ?? questions;
  const pending = contacts.filter((c) => c.stage === 1 && c.status !== "interviewed");

  const save = async (list: string[]) => {
    const { error } = await supabase
      .from("projects")
      .update({ questions: list.filter((q) => q.trim()) })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft(null);
    refresh("project");
    toast.success("Questions saved");
  };

  return (
    <AppShell title="Interview">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Your questions</h2>
          {qs.length > 0 && <DraftBadge />}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Ask about what people did, not what they would do. Never pitch.
        </p>
        {qs.length === 0 ? (
          <Button
            size="xl"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await gen({ data: { kind: "questions", projectId: p.id } });
                setDraft(validateAIOutput("questions", r).questions);
              } catch (e) {
                toast.error((e as Error).message);
              }
              setBusy(false);
            }}
          >
            {busy ? "Writing questions…" : "Write my interview questions"}
          </Button>
        ) : (
          <div className="space-y-2">
            {qs.map((q, i) => (
              <div key={i} className="flex gap-2">
                <span className="pt-2 text-sm font-bold text-primary">{i + 1}</span>
                <Textarea
                  value={q}
                  rows={2}
                  onChange={(e) => {
                    const n = [...qs];
                    n[i] = e.target.value;
                    setDraft(n);
                  }}
                  className="rounded-xl"
                />
                <button
                  aria-label="Remove question"
                  onClick={() => setDraft(qs.filter((_, j) => j !== i))}
                  className="text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDraft([...qs, ""])}
              >
                <Plus /> Add
              </Button>
              {draft && (
                <Button className="flex-1 rounded-xl" onClick={() => save(draft)}>
                  Save questions
                </Button>
              )}
            </div>
            <button
              className="w-full pt-1 text-xs text-muted-foreground underline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await gen({ data: { kind: "questions", projectId: p.id } });
                  setDraft(validateAIOutput("questions", r).questions);
                } catch (e) {
                  toast.error((e as Error).message);
                }
                setBusy(false);
              }}
            >
              {busy ? "Rewriting…" : "Regenerate with AI"}
            </button>
          </div>
        )}
      </Card>

      {questions.length > 0 && !draft && (
        <Card>
          <h2 className="text-lg font-bold">Start an interview</h2>
          {pending.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No one left on your list.{" "}
              <Link to="/contacts" className="text-primary underline">
                Add people
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setWho(c.id)}
                  className={`rounded-full border px-4 py-2 text-sm ${who === c.id ? "border-primary bg-primary text-primary-foreground" : ""}`}
                >
                  {c.first_name}
                </button>
              ))}
            </div>
          )}
          <label className="mt-4 flex items-start gap-3 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
            <input
              type="checkbox"
              checked={asked}
              onChange={(e) => setAsked(e.target.checked)}
              className="mt-0.5 size-5 accent-primary"
            />
            I asked if it’s okay to take notes, and they said yes.
          </label>
          <Button size="xl" className="mt-3" disabled={!who || !asked} onClick={() => onStart(who)}>
            Begin
          </Button>
        </Card>
      )}

      {questions.length === 0 && !draft && <PrivacyNote />}

      <div>
        <h2 className="mb-2 text-lg font-bold">
          Done so far ({interviews.filter((i) => i.completed).length})
        </h2>
        {interviews.length === 0 ? (
          <Empty
            title="No interviews yet"
            body="Coffee, lunch, after class — 15 minutes is plenty. You’ve got this."
          />
        ) : (
          <ul className="space-y-2">
            {interviews.map((iv) => {
              const c = contacts.find((x) => x.id === iv.contact_id);
              return (
                <li key={iv.id} className="rounded-2xl border bg-card p-4">
                  <p className="font-semibold">{c?.first_name ?? "Someone"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {iv.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Session({
  p,
  questions,
  contactId,
  onDone,
}: {
  p: Project;
  questions: string[];
  contactId: string | null;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(
    questions.map((q) => ({ q, note: "", quote: "" })),
  );
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const last = i === questions.length;
  const set = (k: "note" | "quote", v: string) =>
    setAnswers((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const finish = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("interviews")
      .insert({ project_id: p.id, contact_id: contactId, answers, tags, completed: true });
    if (!error && contactId)
      await supabase.from("contacts").update({ status: "interviewed" }).eq("id", contactId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh("interviews", "contacts");
    toast.success("Interview saved. Nice work! ");
    onDone();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 pt-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">
          {last ? "Wrap up" : `Question ${i + 1} of ${questions.length}`}
        </p>
        <button
          aria-label="Exit"
          onClick={() => confirm("Leave without saving?") && onDone()}
          className="p-2"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(i / questions.length) * 100}%` }}
        />
      </div>
      <div className="flex-1 py-6">
        {!last ? (
          <>
            <h1 className="text-3xl font-bold leading-tight">{questions[i]}</h1>
            <Textarea
              value={answers[i]?.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Quick notes…"
              rows={5}
              className="mt-6 rounded-2xl text-base"
            />
            <Input
              value={answers[i]?.quote ?? ""}
              onChange={(e) => set("quote", e.target.value)}
              placeholder="“Exact words they said” (optional)"
              className="mt-3 h-12 rounded-xl text-base italic"
            />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">What did you hear?</h1>
            <p className="mt-1 text-muted-foreground">Tap all that apply.</p>
            <div className="mt-5 grid gap-2">
              {TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))
                  }
                  className={`rounded-2xl border-2 p-4 text-left text-base font-semibold capitalize ${tags.includes(t) ? "border-primary bg-primary/10" : "bg-card"}`}
                >
                  {tags.includes(t) ? "✓ " : ""}
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="pb-safe sticky bottom-0 flex gap-2 bg-background pt-2">
        <Button
          variant="outline"
          size="xl"
          className="w-1/3"
          disabled={i === 0}
          onClick={() => setI(i - 1)}
        >
          Back
        </Button>
        {last ? (
          <Button size="xl" className="flex-1" disabled={saving} onClick={finish}>
            {saving ? "Saving…" : "Save interview"}
          </Button>
        ) : (
          <Button size="xl" className="flex-1" onClick={() => setI(i + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
