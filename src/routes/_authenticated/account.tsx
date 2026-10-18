import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setOwnedProjectArchived } from "@/lib/project-lifecycle";
import { AppShell, Card } from "@/components/AppShell";
import { OwnerSavedWorkExport } from "@/components/OwnerSavedWorkExport";
import { InvitationPanel } from "@/components/invitations/InvitationPanel";
import {
  useContacts,
  useInterviews,
  useLearnings,
  useExperiments,
  useProject,
  useProjects,
  type Project,
} from "@/lib/data";
import { CurrentProjectContext } from "@/lib/current-project";
import { useProjectSelection } from "@/lib/project-selection";
import { ArrowUpRight, FolderOpen, Plus, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account & saved work — First Ten" }] }),
  component: Account,
});

function Account() {
  const selection = useProjectSelection();
  const projects = useProjects();
  const current = useProject();
  const navigate = useNavigate();
  const project = current.error ? null : (current.data ?? null);
  const exportProject = selection?.selectedProjectId
    ? projects.data?.find((idea) => idea.id === selection.selectedProjectId)
    : project;
  const [confirmation, setConfirmation] = useState<{ idea: Project; requestId: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setConfirmation(null);
    setBusy(false);
    setNotice("");
  }, [selection?.scopeToken]);
  useEffect(() => {
    if (project && selection && !selection.selectedProjectId) selection.selectProject(project.id);
  }, [project, selection]);
  const requestLifecycle = async () => {
    if (!selection || !confirmation || busy) return;
    const token = selection.scopeToken;
    const { idea, requestId } = confirmation;
    setBusy(true);
    setNotice("");
    const archived = !idea.archived_at;
    const result = await setOwnedProjectArchived(supabase, {
      projectId: idea.id,
      requestId,
      archived,
      expectedRevision: idea.lifecycle_revision,
    });
    if (!selection.isCurrentScope(token)) return;
    // Read current owner-authorized rows even after an idempotent replay: an old
    // acknowledgement must never overwrite a newer restore/archive in the cache.
    try {
      const latest = await projects.refetch({ throwOnError: true });
      await current.refetch();
      if (!selection.isCurrentScope(token)) return;
      if (result.ok) {
        const actual = latest.data?.find((row) => row.id === idea.id);
        setNotice(
          actual
            ? `${actual.name} is ${actual.archived_at ? "archived" : "active"}. Your saved work is retained.`
            : "Latest saved state refreshed. This idea is unavailable.",
        );
        setConfirmation(null);
      } else if (result.code === "UNAVAILABLE") {
        setNotice(
          "The change could not be confirmed. Review the refreshed list and retry this same request; your saved work has not been deleted.",
        );
      } else {
        setNotice(
          result.code === "REVISION_CONFLICT"
            ? "This idea changed in another session. The latest state is shown. Review it and choose the action again."
            : "This change is unavailable. Review your ideas and sign-in before trying again.",
        );
        setConfirmation(null);
      }
    } catch {
      if (selection.isCurrentScope(token))
        setNotice("Latest saved state could not be refreshed. Retry before making another change.");
    } finally {
      if (selection.isCurrentScope(token)) setBusy(false);
    }
  };
  return (
    <CurrentProjectContext.Provider value={project}>
      <AppShell title="Account & saved work">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Your private ideas
            </p>
            <h2 className="mt-2 text-3xl font-bold">Pick up where you left off.</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Each idea keeps its own people, conversations, learnings and marketing plan. Only you
              can open these projects.
            </p>
          </div>
          <Link
            to="/setup"
            search={{ new: true }}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          >
            <Plus className="size-5" aria-hidden="true" />
            New idea
          </Link>
        </div>
        {current.error && (
          <div role="alert" className="rounded-xl border bg-card p-5">
            <p className="font-semibold">The selected idea is unavailable.</p>
            <p className="mt-2 text-sm">
              Choose another idea below. We have not switched projects or changed your saved work.
            </p>
          </div>
        )}
        {notice && (
          <p
            role="status"
            aria-label="Idea lifecycle result"
            className="rounded-xl border bg-card p-4 text-sm"
          >
            {notice}
          </p>
        )}
        {confirmation && (
          <section
            aria-label="Confirm idea lifecycle change"
            className="rounded-2xl border border-primary bg-card p-5"
          >
            <h3 className="text-lg font-bold">
              {confirmation.idea.archived_at ? "Restore" : "Archive"} {confirmation.idea.name}?
            </h3>
            <p className="mt-2 text-sm">
              {confirmation.idea.archived_at
                ? "Return this idea to your active list. Its people, conversations and saved work are retained."
                : "Keep all saved work and stop new edits, generations and access grants, including from already open sessions. Owner review, export, withdrawal and restore remain available. A request authorized before archive may still finish; it cannot save new content into the archived idea."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                disabled={busy}
                onClick={() => void requestLifecycle()}
                className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
              >
                {busy
                  ? "Checking saved state…"
                  : confirmation.idea.archived_at
                    ? "Confirm restore"
                    : "Confirm archive"}
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmation(null)}
                className="min-h-11 rounded-xl border px-4 font-semibold"
              >
                Cancel
              </button>
            </div>
          </section>
        )}
        <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <h3 className="text-xl font-bold">My ideas</h3>
            {projects.isLoading ? (
              <p role="status" className="mt-4">
                Opening your ideas…
              </p>
            ) : projects.error ? (
              <div role="alert" className="mt-4">
                <p>Your ideas could not be loaded. Try again before making changes.</p>
                <button
                  className="mt-3 min-h-11 font-semibold underline"
                  onClick={() => void projects.refetch()}
                >
                  Try again
                </button>
              </div>
            ) : !projects.data?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Your first idea starts with a name, audience and problem. Create one when you’re
                ready.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {projects.data.map((idea) => (
                  <li
                    key={idea.id}
                    className={`rounded-2xl border p-4 ${project?.id === idea.id ? "border-primary bg-secondary/40" : "bg-background"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h4 className="break-words text-lg font-bold">{idea.name}</h4>
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {idea.description}
                        </p>
                        <p className="mt-3 text-xs font-semibold">
                          Stage {idea.stage}
                          {idea.archived_at ? " · Archived" : " · Active"}
                          {project?.id === idea.id ? " · Current idea" : ""}
                        </p>
                      </div>
                      {!idea.archived_at && (
                        <button
                          disabled={!selection || busy}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold"
                          aria-label={`Open ${idea.name}`}
                          onClick={async () => {
                            selection?.selectProject(idea.id);
                            await navigate({ to: "/dashboard" });
                          }}
                        >
                          Open idea
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        disabled={!selection || busy}
                        aria-label={`${idea.archived_at ? "Restore" : "Archive"} ${idea.name}`}
                        className="inline-flex min-h-11 items-center rounded-xl border bg-card px-4 text-sm font-semibold"
                        onClick={() => {
                          setNotice("");
                          setConfirmation({ idea, requestId: crypto.randomUUID() });
                        }}
                      >
                        {idea.archived_at ? "Restore idea" : "Archive idea"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="space-y-5">
            {project && <ProjectSummary key={project.id} project={project} />}
            <Card>
              <ShieldCheck className="mb-3 size-7" aria-hidden="true" />
              <h3 className="text-xl font-bold">Private to your account</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Saved ideas remain available when you sign in again, including on another device.
                This browser remembers which idea you selected; workspace links open that idea. With
                no selection, your earliest active idea opens. Choose from this list on a different
                device. An archived or unavailable selection stays visible as a recovery prompt
                until you restore it or choose another idea.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                An interview in progress saves at wrap-up. Save edits before leaving a page.
                Creating another idea does not copy or replace existing work. Class workspaces and
                collaboration are still planned.
              </p>
              <Link
                to="/teach"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
              >
                Teaching resources
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Card>
          </div>
        </div>
        {exportProject && (
          <OwnerSavedWorkExport
            key={`${exportProject.user_id}:${exportProject.id}`}
            project={exportProject}
          />
        )}
        {exportProject && (
          <details className="rounded-2xl border bg-card p-5">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Sharing controls · in development
            </summary>
            <InvitationPanel
              key={`invite:${exportProject.user_id}:${exportProject.id}`}
              projectId={exportProject.id}
            />
          </details>
        )}
      </AppShell>
    </CurrentProjectContext.Provider>
  );
}

function ProjectSummary({ project }: { project: Project }) {
  const contacts = useContacts(project.id);
  const interviews = useInterviews(project.id);
  const learnings = useLearnings(project.id);
  const experiments = useExperiments(project.id);
  const pending = [contacts, interviews, learnings, experiments].some((query) => query.isLoading);
  const failed = [contacts, interviews, learnings, experiments].some((query) => query.isError);
  return (
    <Card>
      <FolderOpen className="mb-4 size-7" aria-hidden="true" />
      <h3 className="text-xl font-bold">Saved in {project.name}</h3>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[
          ["People", contacts.data?.length],
          ["Conversations", interviews.data?.filter((item) => item.completed).length],
          ["Learning records", learnings.data?.length],
          ["Experiments", experiments.data?.length],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl bg-muted p-4">
            <p className="text-3xl font-bold">{pending || failed ? "—" : count}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Some records could not be loaded. Your saved work has not been changed.
        </p>
      )}
      <Link
        to="/setup"
        search={{}}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold"
      >
        Edit this idea
      </Link>
    </Card>
  );
}
