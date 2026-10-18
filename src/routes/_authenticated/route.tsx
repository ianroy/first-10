import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ProjectSelectionProvider } from "@/lib/project-selection";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedWorkspace,
});

function AuthenticatedWorkspace() {
  const { user } = Route.useRouteContext();
  return (
    <ProjectSelectionProvider userId={user.id}>
      <Outlet />
    </ProjectSelectionProvider>
  );
}
