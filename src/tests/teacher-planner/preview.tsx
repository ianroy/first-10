import { createRoot } from "react-dom/client";
import { TeacherPlanner } from "../../components/teaching/TeacherPlanner";
import "../../styles.css";
createRoot(document.getElementById("root")!).render(
  <TeacherPlanner
    projectId="f1d00000-0000-4000-8000-000000000010"
    projectName="Fictional teaching workshop"
  />,
);
