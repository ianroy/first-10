import { Link, Navigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useProject, SelectedProjectArchivedError, type Project } from "@/lib/data";
import { useProjectSelection } from "@/lib/project-selection";
import { CurrentProjectContext } from "@/lib/current-project";

export function RequireProject({ children }: { children: (p: Project) => ReactNode }) {
  const { data, isLoading, error, refetch } = useProject();
  const selection = useProjectSelection();
  const pinDefault = !!selection && !selection.selectedProjectId && !!data && !error;
  useEffect(() => {
    if (pinDefault && data) selection?.selectProject(data.id);
  }, [pinDefault, data, selection]);
  if (isLoading || pinDefault)
    return (
      <p role="status" className="p-8 text-center text-muted-foreground">
        Opening your project…
      </p>
    );
  if (error)
    return (
      <div
        role="alert"
        className="mx-auto mt-16 max-w-lg rounded-2xl border bg-card p-8 text-center"
      >
        <h1 className="text-xl font-bold">
          {error instanceof SelectedProjectArchivedError
            ? "This idea is archived"
            : "Your project could not be loaded"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof SelectedProjectArchivedError
            ? "Your work is retained. Restore this idea or choose another in Account & saved work."
            : "Check your connection, then try again."}
        </p>
        <button
          className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-primary-foreground"
          onClick={() => void refetch()}
        >
          Try again
        </button>
        <p>
          <Link
            to="/account"
            className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          >
            Account &amp; saved work
          </Link>
        </p>
      </div>
    );
  if (!data) return <Navigate to="/setup" />;
  return (
    <CurrentProjectContext.Provider key={`${data.user_id}:${data.id}`} value={data}>
      {children(data)}
    </CurrentProjectContext.Provider>
  );
}
