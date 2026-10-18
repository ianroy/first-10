import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ProjectSelectionProvider } from "@/lib/project-selection";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user)
      throw redirect({
        to: "/auth",
        search: {
          view:
            location.pathname === "/admin"
              ? "admin"
              : location.pathname === "/teacher" || location.pathname === "/classes"
                ? "educator"
                : "student",
          ...(location.pathname === "/classes" ? { next: "/classes" as const } : {}),
        },
      });
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
