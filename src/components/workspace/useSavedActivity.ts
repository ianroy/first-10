import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SavedActivity } from "./saved-activity";

/** A narrow owner-scoped index: never fetch interview documents, scripts or notes here. */
export function useSavedActivity(userId: string, projectId: string) {
  return useQuery({
    queryKey: ["workspace-saved-activity", userId, projectId],
    retry: false,
    queryFn: async ({ signal }) => {
      const verified = await supabase.auth.getUser();
      if (signal.aborted || verified.error || verified.data.user?.id !== userId)
        throw new Error("Your account could not be verified.");
      const results = await Promise.allSettled([
        supabase
          .from("discovery_workspaces")
          .select("user_id,project_id,updated_at,revision")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .abortSignal(signal)
          .maybeSingle(),
        supabase
          .from("interview_drafts")
          .select("user_id,project_id,updated_at,revision")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .abortSignal(signal)
          .maybeSingle(),
        supabase
          .from("marketing_plans")
          .select("user_id,project_id,updated_at,revision")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .abortSignal(signal)
          .maybeSingle(),
      ]);
      if (signal.aborted) throw new Error("Workspace changed.");
      const known: SavedActivity[] = [];
      let incomplete = false;
      const kinds = ["discovery", "interview", "marketing"] as const;
      results.forEach((result, index) => {
        if (result.status === "rejected" || result.value.error) {
          incomplete = true;
          return;
        }
        const row = result.value.data;
        if (!row) return;
        if (
          row.user_id !== userId ||
          row.project_id !== projectId ||
          !Number.isSafeInteger(row.revision) ||
          row.revision < 1 ||
          !Number.isFinite(Date.parse(row.updated_at))
        ) {
          incomplete = true;
          return;
        }
        known.push({ kind: kinds[index]!, savedAt: row.updated_at, revision: row.revision });
      });
      return { known, incomplete };
    },
  });
}
