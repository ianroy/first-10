import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useProject, type Project } from "@/lib/data";

export function RequireProject({ children }: { children: (p: Project) => ReactNode }) {
  const { data, isLoading, error } = useProject();
  if (isLoading) return <p className="p-8 text-center text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-8 text-center text-destructive">Couldn’t load your app. Try refreshing.</p>;
  if (!data) return <Navigate to="/setup" />;
  return <>{children(data)}</>;
}
