import { createFileRoute } from "@tanstack/react-router";
import { useProjectSelection } from "@/lib/project-selection";
import { ClassroomManager } from "@/components/classes/ClassroomManager";
export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({ meta: [{ title: "Classes & hackathons — First Ten" }] }),
  component: Classes,
});
function Classes() {
  const selection = useProjectSelection();
  return selection ? (
    <ClassroomManager key={selection.userId} userId={selection.userId} />
  ) : (
    <p>Verify your account to open classes.</p>
  );
}
