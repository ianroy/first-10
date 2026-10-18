import { InterviewDraftList } from "@/components/interview-drafts/InterviewDraftList";
import { InterviewDraftSession } from "@/components/interview-drafts/InterviewDraftSession";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAI } from "@/lib/ai.functions";
import { useAIIntent } from "@/hooks/useAIIntent";
import { recordedAIOutput } from "@/lib/ai/saved-output";
import { AIOrigin } from "@/components/AIOrigin";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { projectActivities, interviewActivities, section } from "@/lib/export/adapters";
import { SavedConsentFields } from "@/components/ConsentFields";
import { type ConsentScope } from "@/lib/consent";
import { AppShell, Card, DraftBadge, Empty, PrivacyNote } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useContacts, useInterviews, useLearnings, useRefresh, type Project } from "@/lib/data";

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
  const [draftId, setDraftId] = useState<string | null>(null);
  if (draftId)
    return (
      <InterviewDraftSession
        key={`${p.user_id}:${p.id}:${draftId}`}
        project={p}
        draftId={draftId}
        onDone={() => setDraftId(null)}
      />
    );
  return <Prep p={p} questions={questions} onStart={setDraftId} />;
}

function Prep({
  p,
  questions,
  onStart,
}: {
  p: Project;
  questions: string[];
  onStart: (id: string) => void;
}) {
  const gen = useServerFn(generateAI);
  const intent = useAIIntent(p.id, "questions");
  const refresh = useRefresh();
  const { data: contacts = [] } = useContacts(p.id);
  const { data: interviews = [] } = useInterviews(p.id);
  const { data: learnings = [] } = useLearnings(p.id);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [draftOrigin, setDraftOrigin] = useState<string | null | undefined>(undefined);
  const [privacyTarget, setPrivacyTarget] = useState(`project:${p.id}`);
  const privacyRecords = [
    { kind: "project" as const, id: p.id, label: "This idea" },
    ...contacts.map((c) => ({
      kind: "contact" as const,
      id: c.id,
      label: `Contact: ${c.first_name}`,
    })),
    ...interviews.map((iv, index) => ({
      kind: "interview" as const,
      id: iv.id,
      label: `Interview ${index + 1}`,
    })),
    ...learnings.map((l, index) => ({
      kind: "learning" as const,
      id: l.id,
      label: `Learning: ${l.title || index + 1}`,
    })),
  ];
  const selectedPrivacy =
    privacyRecords.find((r) => `${r.kind}:${r.id}` === privacyTarget) ?? privacyRecords[0]!;
  const privacyScope: ConsentScope = {
    projectId: p.id,
    targetKind: selectedPrivacy.kind,
    targetId: selectedPrivacy.id,
  };
  const qs = draft ?? questions;
  const exportActivities = () => {
    const script = projectActivities({
      ...p,
      questions: qs,
      questions_origin_id: draftOrigin === undefined ? p.questions_origin_id : draftOrigin,
    }).find((offer) => offer.activity.key === "questions")!;
    script.activity.title = draft
      ? "Interview script - current unsaved edits"
      : "Interview script - saved questions";
    script.activity.sections.push(
      section("questions.fieldwork", "Before the conversation", [
        [
          "Opening",
          "Explain what you are learning. Ask whether it is okay to take notes. Participation is optional; people may skip a question or stop.",
        ],
        [
          "Listen for",
          "A recent concrete situation, actual behavior, workarounds and a counterexample. Avoid pitching or hypothetical willingness to pay.",
        ],
        [
          "Save state",
          draft
            ? "Current unsaved editor contents; exporting does not save these questions."
            : "Questions saved in this idea; interviewing and permission are not verified by this PDF.",
        ],
        [
          "Field notes",
          "For each question, record observations, exact words only when accurate, and uncertainty. Do not include sensitive identifying details.",
        ],
      ]),
    );
    return [script, ...interviewActivities(p, interviews)];
  };

  const save = async (list: string[]) => {
    const { error } = await supabase
      .from("projects")
      .update({
        questions: list.filter((q) => q.trim()),
        questions_origin_id: draftOrigin === undefined ? p.questions_origin_id : draftOrigin,
      })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft(null);
    setDraftOrigin(undefined);
    refresh("project");
    toast.success("Questions saved");
  };

  const requestQuestions = async () => {
    const operationId = intent.begin();
    if (!operationId) return;
    setBusy(true);
    try {
      const r = await gen({
        data: { kind: "questions", projectId: p.id, operationId, withOrigin: true },
      });
      if (!intent.isCurrent(operationId)) return;
      const recorded = recordedAIOutput("questions", r);
      setDraft(recorded.data.questions);
      setDraftOrigin(recorded.originId);
      intent.succeeded(operationId);
    } catch (e) {
      intent.failed(operationId);
      if (intent.isCurrent(operationId)) toast.error((e as Error).message);
    } finally {
      if (intent.isCurrent(operationId)) setBusy(false);
    }
  };

  return (
    <AppShell title="Interview">
      <p className="max-w-2xl text-muted-foreground">
        Prepare a few useful questions, listen for a recent example and keep observations separate
        from your interpretation.
      </p>
      <Card>
        <h2 className="text-lg font-bold">Privacy and processing choices</h2>
        <p className="my-3 max-w-3xl text-sm text-muted-foreground">
          AI is optional. Idea details require an explicit saved AI choice. Contact and interview
          records need their own choices; notes permission alone never enables AI. Accepted
          summaries are withheld when underlying evidence is unapproved, and withdrawn evidence
          invalidates existing learning permissions. Manual questions, notes and decisions remain
          available.
        </p>
        <label htmlFor="privacy-record" className="block text-sm font-semibold">
          Record to review
        </label>
        <select
          id="privacy-record"
          value={`${selectedPrivacy.kind}:${selectedPrivacy.id}`}
          onChange={(e) => setPrivacyTarget(e.target.value)}
          className="my-3 min-h-11 w-full max-w-xl rounded-lg border bg-background px-3"
        >
          {privacyRecords.map((r) => (
            <option key={`${r.kind}:${r.id}`} value={`${r.kind}:${r.id}`}>
              {r.label}
            </option>
          ))}
        </select>
        <SavedConsentFields
          key={`${p.id}:${selectedPrivacy.kind}:${selectedPrivacy.id}`}
          scope={privacyScope}
          label={selectedPrivacy.label}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Allowed AI content travels through this app to OpenRouter and its routed model provider.
          Keep names and sensitive details out of free text. Withdrawal stops future requests;
          already transmitted content and downloaded copies cannot be recalled.
        </p>
      </Card>
      {intent.uncertain && (
        <div role="status" className="my-4 rounded-xl border p-4 text-sm">
          The previous AI request may have completed. Checking it reuses the same request and cannot
          generate twice. A new request uses additional allowance; manual questions remain
          available.
          <Button
            variant="outline"
            disabled={busy}
            className="ml-3"
            onClick={() => {
              intent.newRequest();
            }}
          >
            Start a new AI request
          </Button>
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Your questions</h2>
              {qs.length > 0 && <DraftBadge />}
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Ask what happened last time and how they handled it. Leave room for disagreement; save
              the pitch for another conversation.
            </p>
            {qs.length > 0 && (
              <AIOrigin
                projectId={p.id}
                originId={draftOrigin === undefined ? p.questions_origin_id : draftOrigin}
              />
            )}
            {qs.length === 0 ? (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft([""]);
                    setDraftOrigin(null);
                  }}
                >
                  Write questions myself
                </Button>
                <Button size="xl" disabled={busy} onClick={requestQuestions}>
                  {busy ? "Writing questions…" : "Write my interview questions"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {qs.map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="pt-2 text-sm font-bold text-primary">{i + 1}</span>
                    <Textarea
                      aria-label={`Question ${i + 1}`}
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
                      aria-label={`Remove question ${i + 1}`}
                      onClick={() => setDraft(qs.filter((_, j) => j !== i))}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
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
                  className="min-h-11 w-full rounded-lg pt-1 text-sm text-muted-foreground underline"
                  disabled={busy}
                  onClick={requestQuestions}
                >
                  {busy ? "Rewriting…" : "Regenerate with AI"}
                </button>
              </div>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <InterviewDraftList
            project={p}
            onResume={onStart}
            canStart={questions.length > 0 && !draft}
          />

          {questions.length === 0 && !draft && <PrivacyNote />}

          <div>
            <h2 className="mb-2 text-lg font-bold">
              Done so far ({interviews.filter((i) => i.completed).length})
            </h2>
            {interviews.length === 0 ? (
              <Empty
                title="No interviews yet"
                body="Start with one relevant person and a time that works for them. Save the interview at wrap-up to add it here."
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
        </div>
      </div>
      <OwnerActivityExport project={p} activities={exportActivities} />
    </AppShell>
  );
}
