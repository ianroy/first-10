import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceIdentity } from "@/lib/project-selection";
import type { Tables } from "@/integrations/supabase/types";

export type Project = Tables<"projects">;
export type Contact = Tables<"contacts">;
export type Interview = Tables<"interviews">;
export type Learning = Tables<"learnings">;
export type Experiment = Tables<"experiments">;
export type Outreach = Tables<"outreach">;
export type Answer = { q: string; note: string; quote: string };

export const TAGS = [
  "has problem",
  "current workaround",
  "would use",
  "would pay",
  "gave referral",
];
export const PIPELINE = [
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "tried", label: "Tried it" },
  { key: "active", label: "Active" },
  { key: "paying", label: "Paying" },
];
export const REACHED = ["tried", "active", "paying"];

export class SelectedProjectUnavailableError extends Error {
  constructor() {
    super("This selected project is unavailable. Choose another idea in Account & saved work.");
    this.name = "SelectedProjectUnavailableError";
  }
}

export function useProject() {
  const scope = useWorkspaceIdentity();
  const query = useQuery({
    queryKey: ["project", scope.userId, scope.selectedProjectId],
    enabled: !!scope.userId,
    retry: false,
    queryFn: async () => {
      let request = supabase.from("projects").select("*").eq("user_id", scope.userId!);
      if (scope.selectedProjectId) request = request.eq("id", scope.selectedProjectId);
      const { data, error } = await request.order("created_at").order("id").limit(1).maybeSingle();
      if (error) throw error;
      if (!data && scope.selectedProjectId) throw new SelectedProjectUnavailableError();
      return data;
    },
  });
  return {
    ...query,
    isLoading: !scope.ready || query.isLoading,
    error: scope.error ?? query.error,
  };
}

export function useProjects() {
  const scope = useWorkspaceIdentity();
  const query = useQuery({
    queryKey: ["projects", scope.userId],
    enabled: !!scope.userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", scope.userId!)
        .order("created_at")
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    ...query,
    isLoading: !scope.ready || query.isLoading,
    error: scope.error ?? query.error,
  };
}

function listHook<T>(table: "contacts" | "interviews" | "learnings" | "experiments" | "outreach") {
  return (projectId?: string) => {
    const scope = useWorkspaceIdentity();
    return useQuery({
      queryKey: [table, scope.userId, projectId],
      enabled: !!scope.userId && !!projectId,
      queryFn: async () => {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("project_id", projectId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as T[];
      },
    });
  };
}
export const useContacts = listHook<Contact>("contacts");
export const useInterviews = listHook<Interview>("interviews");
export const useLearnings = listHook<Learning>("learnings");
export const useExperiments = listHook<Experiment>("experiments");
export const useOutreach = listHook<Outreach>("outreach");

export function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    keys.forEach((k) => {
      void qc.invalidateQueries({ queryKey: [k] });
      if (k === "project") void qc.invalidateQueries({ queryKey: ["projects"] });
    });
}

export function stageProgress(contacts: Contact[], interviews: Interview[]) {
  return {
    s1: interviews.filter((i) => i.completed).length,
    s2: contacts.filter((c) => c.stage === 2 && REACHED.includes(c.status)).length,
    s3: contacts.filter((c) => c.stage === 3 && REACHED.includes(c.status)).length,
  };
}
