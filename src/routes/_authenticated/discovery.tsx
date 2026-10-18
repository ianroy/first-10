import { createFileRoute } from "@tanstack/react-router";
import { RequireProject } from "@/components/RequireProject";
import { DiscoveryWorkspace } from "@/components/discovery/DiscoveryWorkspace";
export const Route = createFileRoute("/_authenticated/discovery")({
  head: () => ({
    meta: [
      { title: "Discovery cycle — First Ten" },
      {
        name: "description",
        content: "Your hypothesis, sampling map, versioned script and next evidence-led decision.",
      },
    ],
  }),
  component: () => (
    <RequireProject>
      {(project) => (
        <DiscoveryWorkspace key={`${project.user_id}:${project.id}`} project={project} />
      )}
    </RequireProject>
  ),
});
