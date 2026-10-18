import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { useContacts, useInterviews, useLearnings, useExperiments, type Project } from "@/lib/data";
import { ArrowUpRight, FolderOpen, ShieldCheck } from "lucide-react";
export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account & saved work — First Ten" }] }),
  component: () => <RequireProject>{(project) => <Account project={project} />}</RequireProject>,
});
function Account({ project }: { project: Project }) {
  const contacts = useContacts(project.id);
  const interviews = useInterviews(project.id);
  const learnings = useLearnings(project.id);
  const experiments = useExperiments(project.id);
  const pending = [contacts, interviews, learnings, experiments].some((query) => query.isLoading);
  const failed = [contacts, interviews, learnings, experiments].some((query) => query.isError);
  return (
    <AppShell title="Account & saved work">
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <FolderOpen className="mb-5 size-8" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your current project
          </p>
          <h2 className="mt-2 text-3xl font-bold">{project.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {project.description}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
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
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
            >
              Return to workspace
              <ArrowUpRight className="size-4" />
            </Link>
            <Link
              to="/setup"
              className="inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold"
            >
              Edit project details
            </Link>
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <ShieldCheck className="mb-3 size-7" aria-hidden="true" />
            <h2 className="text-xl font-bold">Private to your account</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your saved project, completed interviews and reviewed drafts remain available when you
              sign in again, including on another device.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An interview in progress saves at wrap-up. Save edits before leaving a page. Keep
              sensitive personal information out of notes.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-bold">One idea at a time</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This version opens your earliest project. Separate ideas, project switching, class
              workspaces and collaboration are planned. You can edit the current project details,
              but that does not create a separate workspace.
            </p>
            <Link
              to="/teach"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
            >
              Teaching resources
              <ArrowUpRight className="size-4" />
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
