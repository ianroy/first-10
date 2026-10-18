import { createFileRoute } from "@tanstack/react-router";
import { PersonalWorkspace } from "@/components/workspace/PersonalWorkspace";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({ meta: [{ title: "My workspace — First Ten" }] }),
  // Like Account, this recovery surface must open even when the selected idea cannot.
  component: PersonalWorkspace,
});
