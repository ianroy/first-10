import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
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
                          {project?.id === idea.id ? " · Current idea" : ""}
                        </p>
                      </div>
                      <button
                        disabled={!selection}
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
                This browser remembers which idea you selected; choose it from this list on a
                different device.
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
