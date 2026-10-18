import { createFileRoute } from "@tanstack/react-router";
import { RequireProject } from "@/components/RequireProject";
import { SavedMarketingLab } from "@/components/marketing/SavedMarketingLab";
export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({ meta: [{ title: "$0 Marketing Lab — First Ten" }] }),
  component: () => (
    <RequireProject>
      {(project) => <SavedMarketingLab key={project.id} project={project} />}
    </RequireProject>
  ),
});
