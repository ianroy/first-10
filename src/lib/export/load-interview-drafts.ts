import { listInterviewDrafts, loadInterviewDraft } from "@/lib/interview-drafts.functions";
import type { InterviewDraftRecord } from "@/lib/interview-drafts";

/** Explicit portfolio acquisition only; never put incomplete notes into shared or AI inputs. */
export async function loadPortfolioInterviewDrafts(
  projectId: string,
): Promise<InterviewDraftRecord[]> {
  const listed = await listInterviewDrafts({ data: { projectId } });
  if (!listed.ok) throw new Error("Private interview drafts unavailable");
  const drafts: InterviewDraftRecord[] = [];
  // Bound concurrent auth/database requests even at the 100-active-draft limit.
  for (let offset = 0; offset < listed.drafts.length; offset += 4) {
    const batch = listed.drafts.slice(offset, offset + 4);
    const loaded = await Promise.all(
      batch.map(async (summary) => {
        const result = await loadInterviewDraft({ data: { projectId, draftId: summary.id } });
        if (
          !result.ok ||
          result.draft.projectId !== projectId ||
          result.draft.id !== summary.id ||
          result.draft.status !== "active" ||
          result.draft.revision !== summary.revision ||
          !result.draft.document
        )
          throw new Error(
            "Private interview drafts changed or are unavailable; reload the portfolio",
          );
        return result.draft;
      }),
    );
    drafts.push(...loaded);
  }
  return drafts;
}
