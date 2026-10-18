import { memory, project } from "../ws-002/memory";
import type { Project } from "@/lib/data";
import { emptyInterviewDraft, type InterviewDraftRecord } from "@/lib/interview-drafts";

export const OWNER_A = "c2070000-0000-4000-8000-000000000001";
export const OWNER_B = "c2070000-0000-4000-8000-000000000002";
export const scopes = [
  {
    ownerId: OWNER_A,
    projectId: "c2070000-0000-4000-8000-000000000011",
    draftId: "c2070000-0000-4000-8000-000000000021",
    contactId: "c2070000-0000-4000-8000-000000000031",
    marker: "A1",
  },
  {
    ownerId: OWNER_A,
    projectId: "c2070000-0000-4000-8000-000000000012",
    draftId: "c2070000-0000-4000-8000-000000000022",
    contactId: "c2070000-0000-4000-8000-000000000032",
    marker: "A2",
  },
  {
    ownerId: OWNER_B,
    projectId: "c2070000-0000-4000-8000-000000000013",
    draftId: "c2070000-0000-4000-8000-000000000023",
    contactId: "c2070000-0000-4000-8000-000000000033",
    marker: "B1",
  },
  {
    ownerId: OWNER_B,
    projectId: "c2070000-0000-4000-8000-000000000014",
    draftId: "c2070000-0000-4000-8000-000000000024",
    contactId: "c2070000-0000-4000-8000-000000000034",
    marker: "B2",
  },
] as const;
export type JourneyScope = (typeof scopes)[number];
export const question = "What happened the last time you faced this problem?";
export const stamp = "2026-10-18T18:00:00Z";
export function journeyProject(scope: JourneyScope): Project {
  return {
    ...project(scope.projectId, scope.ownerId, "The same idea name"),
    description: "The same description",
    questions: [question],
    survey: [],
    questions_origin_id: null,
    survey_origin_id: null,
    checklist: { manual: true, metrics: { active: 0 } },
  };
}
export function journeyDraft(scope: JourneyScope): InterviewDraftRecord {
  const document = emptyInterviewDraft([question], "granted");
  document.answers[0]!.note = `FICTIONAL_BASE_${scope.marker}`;
  return {
    id: scope.draftId,
    projectId: scope.projectId,
    contactId: scope.contactId,
    revision: 2,
    status: "active",
    questions: [question],
    originId: null,
    createdAt: stamp,
    savedAt: stamp,
    completedAt: null,
    interviewId: null,
    document,
  };
}
export function journeyClient() {
  const client = memory();
  client.setUser(OWNER_A);
  client.tables["projects"] = scopes.map(journeyProject);
  client.tables["contacts"] = scopes.map((scope) => ({
    id: scope.contactId,
    user_id: scope.ownerId,
    project_id: scope.projectId,
    first_name: "Sam",
    stage: 1,
    status: "to_contact",
    why: `FICTIONAL_PERSON_${scope.marker}`,
  }));
  client.tables["interviews"] = [];
  return client;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
