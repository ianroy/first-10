import { createFileRoute } from "@tanstack/react-router";
import { RequireProject } from "@/components/RequireProject";
import { TeacherPlanner } from "@/components/teaching/TeacherPlanner";

export const Route = createFileRoute("/_authenticated/teacher")({
  head: () => ({ meta: [{ title: "Educator dashboard — First Ten" }] }),
  component: TeacherPage,
});

function TeacherPage() {
  return (
    <RequireProject>
      {(project) => (
        <TeacherPlanner
          key={`${project.user_id}:${project.id}`}
          projectId={project.id}
          projectName={project.name}
          projectOwnerId={project.user_id}
        />
      )}
    </RequireProject>
  );
}
