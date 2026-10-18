import type { Project } from "@/lib/data";
import { emptyInterviewDraft, type InterviewDraftRecord } from "@/lib/interview-drafts";
export const project = {
  id: "c1640000-0000-4000-8000-000000000001",
  user_id: "c1640000-0000-4000-8000-000000000002",
  name: "Fictional draft fixture",
  checklist: { demo: { fictional: true } },
  questions: ["A newer preparation question"],
  questions_origin_id: null,
} as unknown as Project;
export const contactId = "c1640000-0000-4000-8000-000000000003";
export function draftRecord(): InterviewDraftRecord {
  const questions = [" Élodie: what happened last time? ", "What did you do next?"];
  return {
    id: "c1640000-0000-4000-8000-000000000004",
    projectId: project.id,
    contactId,
    revision: 3,
    status: "active",
    questions,
    originId: null,
    createdAt: "2026-10-18T15:00:00Z",
    savedAt: "2026-10-18T15:10:00Z",
    completedAt: null,
    interviewId: null,
    document: emptyInterviewDraft(questions, "granted"),
  };
}
