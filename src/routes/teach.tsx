import { createFileRoute } from "@tanstack/react-router";
import { TeachingPage } from "@/components/teaching/TeachingPage";

export const Route = createFileRoute("/teach")({
  head: () => ({
    meta: [
      { title: "Teach with First Ten — Classroom lesson and field assignment" },
      {
        name: "description",
        content:
          "A 60-minute entrepreneurship lesson, one-week $0 marketing assignment and editable teaching resources. No account or AI required.",
      },
      { property: "og:title", content: "Teach with First Ten — Make the next decision teachable" },
      {
        property: "og:description",
        content:
          "Use a fictional case, student-first planning, peer feedback and reflection. Download the complete teaching kit.",
      },
    ],
  }),
  component: TeachingPage,
});
