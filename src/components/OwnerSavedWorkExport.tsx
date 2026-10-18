import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { ownerPortfolioActivities } from "@/lib/export/adapters";
import { marketingActivities, teacherActivities } from "@/lib/export/plan-adapters";
import { loadMarketingPlan } from "@/lib/marketing.functions";
import { loadTeacherPlan } from "@/lib/teacher.functions";
import { loadDiscovery } from "@/lib/discovery.functions";
import { discoveryActivities } from "@/lib/export/discovery-adapters";
import { interviewDraftActivities } from "@/lib/export/interview-draft-adapters";
import { loadPortfolioInterviewDrafts } from "@/lib/export/load-interview-drafts";
import { loadPublicContext } from "@/lib/context.functions";
import { publicContextActivities } from "@/lib/export/public-context-adapters";
import { useWorkspaceIdentity } from "@/lib/project-selection";
import {
  useContacts,
  useInterviews,
  useLearnings,
  useExperiments,
  useOutreach,
  type Project,
} from "@/lib/data";

/** Only the selected owner's saved records; classroom review is a separate acquisition path. */
export function OwnerSavedWorkExport({ project }: { project: Project }) {
  const scope = useWorkspaceIdentity();
  const [open, setOpen] = useState(false);
  if (!scope.ready || scope.userId !== project.user_id) return null;
  return (
    <section className="rounded-2xl border bg-card p-5 lg:p-7" aria-label="Saved activity PDFs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FileDown className="size-5" aria-hidden="true" /> Your activity portfolio
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Take a private PDF copy of saved work from this idea. Choose individual activities or
            selected batches, review the content and remove identifying details before download.
            Unsaved edits on other pages are not included here.
          </p>
        </div>
        <button
          className="min-h-11 rounded-xl border px-4 font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close saved exports" : "Open saved exports"}
        </button>
      </div>
      {open && <SavedPortfolio key={`${scope.userId}:${project.id}`} project={project} />}
    </section>
  );
}

function SavedPortfolio({ project }: { project: Project }) {
  const contacts = useContacts(project.id);
  const interviews = useInterviews(project.id);
  const learnings = useLearnings(project.id);
  const experiments = useExperiments(project.id);
  const outreach = useOutreach(project.id);
  const plans = useQuery({
    queryKey: ["portfolio-plans", project.user_id, project.id],
    retry: false,
    queryFn: async () => {
      const [marketing, teacher, discovery, drafts, publicContext] = await Promise.all([
        loadMarketingPlan({ data: { projectId: project.id } }),
        loadTeacherPlan({ data: { projectId: project.id } }),
        loadDiscovery({ data: { projectId: project.id } }),
        loadPortfolioInterviewDrafts(project.id),
        loadPublicContext({ data: { projectId: project.id } }),
      ]);
      if (!marketing.ok || !teacher.ok || !discovery.ok || !publicContext.ok)
        throw new Error("Saved plans unavailable");
      return {
        marketing: marketing.plan,
        teacher: teacher.plan,
        discovery: discovery.workspace,
        drafts,
        publicContext,
      };
    },
  });
  const queries = [contacts, interviews, learnings, experiments, outreach, plans];
  if (queries.some((query) => query.isPending || query.isFetching))
    return (
      <p role="status" className="mt-5">
        Opening your saved activity records…
      </p>
    );
  if (queries.some((query) => query.error))
    return (
      <div role="alert" className="mt-5 rounded-xl border p-4">
        <p>
          Some activity records could not be loaded. We have not created an incomplete portfolio.
        </p>
        <button
          className="mt-2 min-h-11 font-semibold underline"
          onClick={() => {
            for (const query of queries) void query.refetch();
          }}
        >
          Retry activity records
        </button>
      </div>
    );
  try {
    const activities = ownerPortfolioActivities({
      project,
      contacts: contacts.data ?? [],
      interviews: interviews.data ?? [],
      learnings: learnings.data ?? [],
      experiments: experiments.data ?? [],
      outreach: outreach.data ?? [],
    });
    if (plans.data?.marketing)
      activities.push(
        ...marketingActivities(plans.data.marketing.document, {
          savedAt: plans.data.marketing.savedAt,
          revision: plans.data.marketing.revision,
          dirty: false,
        }),
      );
    if (plans.data?.teacher)
      activities.push(
        ...teacherActivities(plans.data.teacher.document, {
          savedAt: plans.data.teacher.savedAt,
          revision: plans.data.teacher.revision,
          dirty: false,
        }),
      );
    if (plans.data?.discovery)
      activities.push(
        ...discoveryActivities(plans.data.discovery.document, {
          savedAt: plans.data.discovery.savedAt,
          revision: plans.data.discovery.revision,
          dirty: false,
        }),
      );
    activities.push(...interviewDraftActivities(project, plans.data?.drafts ?? []));
    if (plans.data?.publicContext)
      activities.push(...publicContextActivities(project, plans.data.publicContext));
    return (
      <div className="mt-5">
        <p className="mb-3 text-xs text-muted-foreground">
          Records are read separately and may change during loading. The preview freezes the
          selected content. This download does not submit work or give anyone access.
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Marketing Lab: {plans.data?.marketing ? "saved plan included" : "no saved plan"}.{" "}
          Instructor planning: {plans.data?.teacher ? "saved plan included" : "no saved plan"}.{" "}
          Discovery cycle:{" "}
          {plans.data?.discovery ? "saved workspace included" : "no saved workspace"}. Private
          incomplete interviews: {plans.data?.drafts?.length ?? 0} saved drafts included. Classroom
          submissions and guest team spaces use their own separate review and export controls.
        </p>
        <OwnerActivityExport project={project} activities={activities} allowPortfolio />
      </div>
    );
  } catch {
    return (
      <p role="alert" className="mt-5">
        These records could not be safely prepared. Reload this idea and try again.
      </p>
    );
  }
}
