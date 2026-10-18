import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export function useProject() {
  return useQuery({
    queryKey: ["project"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function listHook<T>(table: "contacts" | "interviews" | "learnings" | "experiments" | "outreach") {
  return (projectId?: string) =>
    useQuery({
      queryKey: [table, projectId],
      enabled: !!projectId,
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
}
export const useContacts = listHook<Contact>("contacts");
export const useInterviews = listHook<Interview>("interviews");
export const useLearnings = listHook<Learning>("learnings");
export const useExperiments = listHook<Experiment>("experiments");
export const useOutreach = listHook<Outreach>("outreach");

export function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function stageProgress(contacts: Contact[], interviews: Interview[]) {
  return {
    s1: interviews.filter((i) => i.completed).length,
    s2: contacts.filter((c) => c.stage === 2 && REACHED.includes(c.status)).length,
    s3: contacts.filter((c) => c.stage === 3 && REACHED.includes(c.status)).length,
  };
}
