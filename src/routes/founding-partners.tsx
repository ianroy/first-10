import { createFileRoute } from "@tanstack/react-router";
import { FoundingPartnersPage } from "@/components/partners/FoundingPartnersPage";

export const Route = createFileRoute("/founding-partners")({
  head: () => ({
    meta: [
      { title: "Founding partners — Teach with First Ten" },
      {
        name: "description",
        content:
          "Try First Ten in your classroom and help shape what comes next. Founding partners receive two semesters of free use.",
      },
    ],
  }),
  component: FoundingPartnersPage,
});
