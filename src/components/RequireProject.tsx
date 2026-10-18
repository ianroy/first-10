import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useProject, type Project } from "@/lib/data";
import { CurrentProjectContext } from "@/lib/current-project";

export function RequireProject({ children }: { children: (p: Project) => ReactNode }) {
  const { data, isLoading, error, refetch } = useProject();
  if (isLoading)
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
        <h1 className="text-xl font-bold">Your project could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">Check your connection, then try again.</p>
        <button
          className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-primary-foreground"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (!data) return <Navigate to="/setup" />;
  return (
    <CurrentProjectContext.Provider value={data}>{children(data)}</CurrentProjectContext.Provider>
  );
}
