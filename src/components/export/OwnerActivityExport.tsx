import { useCallback, useContext } from "react";
import { useProjectSelection } from "@/lib/project-selection";
import { CurrentProjectContext } from "@/lib/current-project";
import { supabase } from "@/integrations/supabase/client";
import { markProjectOffers, type ActivityOffer } from "@/lib/export/adapters";
import { ActivityExportLauncher } from "./ActivityExportLauncher";

/** Caller supplies current owner-loaded records; this guard prevents stale cross-account/project rendering. */
type Props = {
  project: { id: string; user_id: string; checklist?: unknown };
  activities: ActivityOffer[] | (() => ActivityOffer[]);
  allowPortfolio?: boolean;
};
export function OwnerActivityExport(props: Props) {
  if (!props.project.id || !props.project.user_id) return null;
  return <VerifiedOwnerExport {...props} />;
}
function VerifiedOwnerExport({ project, activities, allowPortfolio = false }: Props) {
  const selection = useProjectSelection();
  const resolved = useContext(CurrentProjectContext);
  // Authenticated route/provider already verified identity. Never start an additional auth/network
  // lifecycle from an export mount, and never infer identity from the caller's project prop.
  const scope =
    selection ?? (resolved ? { userId: resolved.user_id, selectedProjectId: resolved.id } : null);
  const resolveOrigin = useCallback(
    async (originId: string) => {
      const { data, error } = await supabase.rpc("get_ai_generation_origin", {
        p_project_id: project.id,
        p_origin_id: originId,
      });
      if (error) throw new Error("Origin unavailable");
      return data;
    },
    [project.id],
  );
  if (
    !scope ||
    !scope.userId ||
    scope.userId !== project.user_id ||
    (scope.selectedProjectId && scope.selectedProjectId !== project.id)
  )
    return null;
  let offers: ActivityOffer[];
  try {
    offers = typeof activities === "function" ? activities() : activities;
  } catch {
    return (
      <p role="alert" className="mt-4 rounded-lg border p-3 text-sm">
        This activity export is unavailable because its source scope could not be verified. Reopen
        this project before exporting; your work is unchanged.
      </p>
    );
  }
  return (
    <ActivityExportLauncher
      key={`${scope.userId}:${project.id}`}
      activities={markProjectOffers(project, offers)}
      resolveOrigin={resolveOrigin}
      allowPortfolio={allowPortfolio}
    />
  );
}
