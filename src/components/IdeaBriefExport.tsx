import { useMemo } from "react";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import type { ActivityExportV1 } from "@/lib/export/activity";
import { ideaBriefActivity, type IdeaBrief } from "@/lib/export/adapters";

/** Authenticated form contents only. No fabricated project identity is needed to export a draft. */
export function IdeaBriefExport({
  brief,
  fictional = false,
}: {
  brief: IdeaBrief;
  fictional?: boolean;
}) {
  const { name, description, audience, problem, link } = brief;
  const document = useMemo<ActivityExportV1>(
    () => ({
      schemaVersion: 1,
      title: "Your idea brief",
      capturedAt: new Date().toISOString(),
      activities: [
        ideaBriefActivity({ name, description, audience, problem, link }, fictional).activity,
      ],
    }),
    [name, description, audience, problem, link, fictional],
  );
  return (
    <details className="rounded-2xl border bg-card p-5">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Export this idea brief as PDF
      </summary>
      <ActivityPdfExport document={document} permittedAudiences={["owner"]} />
    </details>
  );
}
