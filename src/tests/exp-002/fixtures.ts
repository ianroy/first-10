import seed from "../../../docs/demo/supabase-fixture.json";
import type { Contact, Interview, Learning, Experiment, Outreach } from "@/lib/data";
import type { ExportProject, ActivityOffer } from "@/lib/export/adapters";
import { boundedOffers } from "@/lib/export/adapters";
import { freezeActivityExport, exportSnapshotText } from "@/lib/export/activity";
export const capturedAt = "2026-10-18T15:00:00Z";
export function savedFixture() {
  const project = {
    ...seed.project,
    user_id: seed.account.id,
    questions_origin_id: null,
    survey_origin_id: null,
    updated_at: capturedAt,
  } as ExportProject;
  const enrich = <T>(rows: unknown[]) =>
    rows.map((r) => ({
      ...(r as object),
      user_id: project.user_id,
      project_id: project.id,
      created_at: capturedAt,
      generation_origin_id: null,
    })) as T[];
  return {
    project,
    contacts: enrich<Contact>(seed.contacts),
    interviews: enrich<Interview>(seed.interviews),
    learnings: enrich<Learning>(seed.learnings),
    experiments: enrich<Experiment>(seed.experiments),
    outreach: enrich<Outreach>(seed.outreach),
  };
}
export function frozen(offers: ActivityOffer[]) {
  const activities = boundedOffers(offers).map((o) => o.activity);
  return freezeActivityExport(
    { schemaVersion: 1, title: "QA activity selection", capturedAt, activities },
    {
      audience: "owner",
      activityKeys: activities.map((a) => a.key),
      sectionKeys: activities.flatMap((a) => a.sections.map((s) => s.key)),
    },
    { allowedAudiences: ["owner"] },
  );
}
export const textOf = (offers: ActivityOffer[]) => exportSnapshotText(frozen(offers));
