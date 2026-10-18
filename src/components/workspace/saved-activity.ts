import type { Project } from "@/lib/data";

export type SavedActivity = {
  kind: "discovery" | "interview" | "marketing";
  savedAt: string;
  revision: number;
};
export type ResumeDestination = {
  to: "/discovery" | "/interview" | "/marketing";
  label: string;
  savedAt: string | null;
  revision: number | null;
};
const activities = {
  discovery: { to: "/discovery", label: "Discovery cycle" },
  interview: { to: "/interview", label: "Incomplete interview drafts" },
  marketing: { to: "/marketing", label: "Marketing Lab" },
} as const;

/** Only known saved metadata determines this suggestion. It is not a last-visit tracker. */
export function resumeDestination(
  project: Pick<Project, "questions">,
  known: SavedActivity[],
): ResumeDestination {
  const latest = known
    .filter((item) => Number.isFinite(Date.parse(item.savedAt)) && item.revision > 0)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0];
  if (latest)
    return {
      ...activities[latest.kind],
      savedAt: latest.savedAt,
      revision: latest.revision,
    };
  if (
    Array.isArray(project.questions) &&
    project.questions.some((q) => typeof q === "string" && q.trim())
  )
    return {
      to: "/interview",
      label: "Saved interview preparation",
      savedAt: null,
      revision: null,
    };
  return { to: "/discovery", label: "Start discovery", savedAt: null, revision: null };
}

export function savedTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time unavailable";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
