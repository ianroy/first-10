import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ClassDetail } from "@/lib/classes";
import type { SubmissionView } from "@/lib/submissions/contracts";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  assignments: vi.fn(),
  associate: vi.fn(),
  leave: vi.fn(),
  actor: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
  submit: vi.fn(),
  ownList: vi.fn(),
  own: vi.fn(),
  teacher: vi.fn(),
  teacherList: vi.fn(),
  withdraw: vi.fn(),
  queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/ConsentFields", () => ({ SavedConsentFields: () => <p>Saved choices</p> }));
vi.mock("@/components/classes/TeacherGuestSubmissions", () => ({
  TeacherGuestSubmissions: () => <p>Teacher guest read</p>,
}));
vi.mock("@/components/classes/TeacherMarketingSubmissions", () => ({
  TeacherMarketingSubmissions: () => <p>Teacher marketing read</p>,
}));
vi.mock("@/components/export/SubmittedSnapshotExport", () => ({
  SubmittedSnapshotExport: () => <p>Private author PDF</p>,
  SubmissionPreviewExport: () => <p>Private preview PDF</p>,
}));
vi.mock("@/lib/classes.functions", () => ({
  listMyClasses: h.list,
  getClass: h.detail,
  listAssignments: h.assignments,
  associateClassProject: h.associate,
  leaveClass: h.leave,
}));
vi.mock("@/lib/submissions.functions", () => ({
  previewSubmission: h.preview,
  submitSnapshot: h.submit,
  listMySubmissions: h.ownList,
  getOwnSubmission: h.own,
  listTeacherSubmissions: h.teacherList,
  getTeacherSubmission: h.teacher,
  withdrawSubmission: h.withdraw,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: h.actor },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        is: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        order: () => query,
        limit: () => query,
        range: () => query,
        abortSignal: () => query,
        single: () => {
          filters["single"] = true;
          return query;
        },
        then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          h.queries.push({ table, filters });
          return Promise.resolve(h.read(table, filters)).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));
import { ClassroomManager } from "@/components/classes/ClassroomManager";

const userId = "c5050000-0000-4000-8000-000000000001";
const classId = "c5050000-0000-4000-8000-000000000002";
const projectId = "c5050000-0000-4000-8000-000000000003";
const otherProject = "c5050000-0000-4000-8000-000000000004";
const assignmentId = "c5050000-0000-4000-8000-000000000005";
const snapshotId = "c5050000-0000-4000-8000-000000000006";
const threadId = "c5050000-0000-4000-8000-000000000007";
let detail: ClassDetail;
let copies: SubmissionView[];
const payload: SubmissionView["payload"] = {
  schemaVersion: 1,
  title: "One real conversation",
  interpretation: "My interpretation",
  uncertainty: "Not representative",
  decision: "Test again",
  nextAction: "Ask about the last time",
  excerpts: [
    {
      key: "excerpt.1",
      label: "Problem",
      text: "REVIEWED_SELECTED_WORDS",
      sourceKind: "project",
      evidenceLabel: "Owner-reported; selected and reviewed",
    },
  ],
};
const copy = (version = 1): SubmissionView => ({
  id: version === 1 ? snapshotId : otherProject,
  threadId,
  classId,
  assignmentId,
  version,
  sourceType: "account_project",
  audience: "teacher",
  authorLabel: "Chosen classroom alias",
  submittedAt: "2026-10-18T12:00:00Z",
  grantState: "active",
  grantRevision: 1,
  title: payload.title,
  payload,
});
const pending = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.clearAllMocks();
  h.queries.length = 0;
  copies = [];
  detail = {
    id: classId,
    name: "BUS131 fieldwork",
    mode: "class",
    role: "student",
    aiEnabled: false,
    instructions: "Test one falsifiable hypothesis",
    accessExpiresAt: "2099-01-01T00:00:00Z",
    retentionDays: 120,
    archivedAt: null,
    revision: 1,
    updatedAt: "2026-10-18T12:00:00Z",
    projectAssociation: null,
    enrollment: {
      id: userId,
      classId,
      role: "student",
      state: "active",
      displayLabel: "Chosen classroom alias",
      revision: 3,
    },
  };
  h.list.mockImplementation(async () => ({
    ok: true,
    data: { items: [detail], nextCursor: null },
  }));
  h.detail.mockImplementation(async () => ({ ok: true, data: structuredClone(detail) }));
  h.assignments.mockResolvedValue({
    ok: true,
    data: {
      items: [
        {
          id: assignmentId,
          classId,
          title: "Find counterevidence",
          instructions: "Bring a selected excerpt",
          state: "published",
          dueAt: null,
          revision: 1,
          updatedAt: detail.updatedAt,
        },
      ],
      nextCursor: null,
    },
  });
  h.actor.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  h.read.mockImplementation((table, filters) => ({
    error: null,
    data:
      table === "projects"
        ? filters["single"]
          ? {
              id: filters.id,
              user_id: userId,
              name: "Same idea name",
              archived_at: null,
              problem: filters.id === projectId ? "PRIVATE_A_PROBLEM" : "PRIVATE_B_PROBLEM",
            }
          : [projectId, otherProject].map((id) => ({
              id,
              user_id: userId,
              name: "Same idea name",
              archived_at: null,
            }))
        : [],
  }));
  h.associate.mockImplementation(async ({ data }) => {
    detail.projectAssociation = {
      id: classId,
      projectId: data.projectId,
      active: true,
      revision: (detail.projectAssociation?.revision ?? 0) + 1,
    };
    return { ok: true, data: detail.projectAssociation };
  });
  h.ownList.mockImplementation(async () => ({
    ok: true,
    data: { items: copies, nextCursor: null },
  }));
  h.own.mockImplementation(async ({ data }) => ({
    ok: true,
    data: copies.find((item) => item.id === data.snapshotId),
  }));
  h.preview.mockImplementation(async ({ data }) => ({
    ok: true,
    data: {
      id: snapshotId,
      hash: "a".repeat(64),
      threadId: data.threadId,
      expiresAt: "2099-01-01T00:00:00Z",
      audience: "teacher",
      teacherVisibleFields: [
        "title",
        "excerpts",
        "interpretation",
        "uncertainty",
        "decision",
        "nextAction",
      ],
      payload,
    },
  }));
  h.submit.mockImplementation(async () => {
    const view = {
      ...copy(copies.length + 1),
      threadId: h.preview.mock.calls.at(-1)![0].data.threadId,
    };
    copies.push(view);
    return { ok: true, data: view };
  });
  h.leave.mockImplementation(async () => {
    h.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
    return { ok: true, data: { ...detail.enrollment, state: "left", revision: 4 } };
  });
  h.withdraw.mockImplementation(async ({ data }) => {
    copies = copies.map((view) =>
      view.id === data.snapshotId ? { ...view, grantState: "withdrawn", grantRevision: 2 } : view,
    );
    return { ok: true, data: copies.find((view) => view.id === data.snapshotId) };
  });
});
afterEach(cleanup);
async function openClass() {
  render(<ClassroomManager userId={userId} />);
  fireEvent.click(await screen.findByRole("button", { name: /BUS131 fieldwork/ }));
  await screen.findByLabelText("Choose your own active idea");
  await waitFor(() =>
    expect(screen.getAllByRole("option", { name: "Same idea name" })).toHaveLength(2),
  );
}
async function connect(id = projectId) {
  fireEvent.change(screen.getByLabelText("Choose your own active idea"), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "Connect this idea to the class" }));
  await screen.findByLabelText("Published assignment");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Reload saved sources and start a fresh review" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Published assignment"), {
    target: { value: assignmentId },
  });
  await screen.findByRole("button", { name: "Create exact teacher preview" });
}
async function review() {
  fireEvent.click(screen.getByLabelText(/Idea · problem/));
  fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
  await screen.findByText("REVIEWED_SELECTED_WORDS");
}
async function submit() {
  fireEvent.click(screen.getByLabelText(/I reviewed this exact version/));
  fireEvent.click(screen.getByRole("button", { name: "Submit this reviewed version" }));
  await waitFor(() => expect(copies.length).toBeGreaterThan(0));
}
describe("account student class participation", () => {
  it("distinguishes a pending or failed class inventory from a verified empty list, with retry", async () => {
    const request = pending();
    h.list.mockReturnValueOnce(request.promise);
    render(<ClassroomManager userId={userId} />);
    expect(screen.getByRole("button", { name: "Loading your classes…" })).toBeDisabled();
    expect(screen.queryByText(/Create a class, or accept/)).toBeNull();
    await act(async () => request.resolve({ ok: false, code: "UNAVAILABLE" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be confirmed");
    expect(screen.queryByText(/Create a class, or accept/)).toBeNull();
    h.list.mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: null } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh your classes" }));
    await screen.findByText(/Create a class, or accept/);
  });
  it("connects only an explicit owner idea and explains the exact teacher audience before submission", async () => {
    await openClass();
    expect(h.associate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Published assignment")).toBeNull();
    expect(screen.getByRole("link", { name: "Return to your personal workspace" })).toHaveAttribute(
      "href",
      "/workspace",
    );
    expect(screen.getByText(/Your chosen classroom alias and membership/)).toHaveTextContent(
      "version number and submission time",
    );
    await connect(otherProject);
    expect(h.associate.mock.calls[0]![0].data).toMatchObject({
      classId,
      projectId: otherProject,
      expectedRevision: 0,
    });
    expect(
      h.queries
        .filter((query) => query.table !== "projects")
        .every(
          (query) =>
            query.filters["user_id"] === userId && query.filters["project_id"] === otherProject,
        ),
    ).toBe(true);
    await review();
    expect(h.preview.mock.calls[0]![0].data).toMatchObject({
      classId,
      assignmentId,
      source: { type: "account_project", projectId: otherProject },
    });
    expect(h.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit this reviewed version" })).toBeDisabled();
    await submit();
    expect(h.teacher).not.toHaveBeenCalled();
    expect(h.teacherList).not.toHaveBeenCalled();
    expect(screen.queryByText("Teacher guest read")).toBeNull();
  });
  it("revises an existing own thread through a fresh field review without restoring an earlier withdrawn grant", async () => {
    copies = [{ ...copy(), grantState: "withdrawn", grantRevision: 2 }];
    await openClass();
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Revise a previous submission" }));
    const histories = await screen.findAllByRole("region", { name: "Your submitted versions" });
    const local = within(histories[0]!);
    fireEvent.click(await local.findByRole("button", { name: "Open saved version" }));
    fireEvent.click(await local.findByRole("button", { name: "Start a new reviewed revision" }));
    expect(await screen.findByText(/Revising the thread of version 1/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create exact teacher preview" })).toBeDisabled();
    expect(h.preview).not.toHaveBeenCalled();
    await review();
    expect(h.preview.mock.calls.at(-1)![0].data.threadId).toBe(threadId);
    await submit();
    await waitFor(() => expect(copies).toHaveLength(2));
    expect(copies[0]).toMatchObject({ version: 1, grantState: "withdrawn" });
    expect(copies[1]).toMatchObject({ version: 2, grantState: "active", threadId });
  });
  it("confirmed departure unmounts an in-flight preview, retains private author copies, and never submits a late response", async () => {
    copies = [copy()];
    await openClass();
    await connect();
    const request = pending();
    h.preview.mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByLabelText(/Idea · problem/));
    fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave this class" }));
    await waitFor(() => expect(screen.queryByLabelText("Account student work")).toBeNull());
    await act(async () =>
      request.resolve({
        ok: true,
        data: {
          id: snapshotId,
          hash: "a".repeat(64),
          threadId,
          expiresAt: "2099-01-01T00:00:00Z",
          audience: "teacher",
          teacherVisibleFields: [],
          payload,
        },
      }),
    );
    expect(h.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Submit this reviewed version" })).toBeNull();
    expect(h.leave.mock.calls[0]![0].data).toMatchObject({ classId, expectedRevision: 3 });
    const history = screen.getByRole("region", { name: "Your submitted versions" });
    fireEvent.click(await within(history).findByRole("button", { name: "Open saved version" }));
    fireEvent.click(
      await within(history).findByRole("button", { name: "Withdraw recipient access" }),
    );
    await waitFor(() => expect(copies[0]!.grantState).toBe("withdrawn"));
    expect(screen.getByRole("link", { name: "Return to your personal workspace" })).toHaveAttribute(
      "href",
      "/workspace",
    );
    expect(h.associate).toHaveBeenCalledTimes(1);
  });
  it("a failed leave keeps recovery and uses the same bounded retry intent without substituting another idea", async () => {
    const leaving = pending();
    h.leave.mockReturnValueOnce(leaving.promise);
    await openClass();
    await connect();
    fireEvent.change(screen.getByLabelText("Your interpretation"), {
      target: { value: "Keep my unsaved reasoning" },
    });
    await review();
    fireEvent.click(screen.getByRole("button", { name: "Leave this class" }));
    expect(screen.getByLabelText("Your interpretation")).toHaveValue("Keep my unsaved reasoning");
    expect(screen.getByLabelText("Your interpretation")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit this reviewed version" })).toBeDisabled();
    await act(async () => leaving.resolve({ ok: false, code: "UNAVAILABLE" }));
    await screen.findByText(/class request could not be confirmed/);
    expect(screen.getByLabelText("Your interpretation")).toHaveValue("Keep my unsaved reasoning");
    expect(screen.getByLabelText("Your interpretation")).toBeEnabled();
    expect(screen.getByText("REVIEWED_SELECTED_WORDS")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Leave this class" }));
    await waitFor(() => expect(h.leave).toHaveBeenCalledTimes(2));
    expect(h.leave.mock.calls[0]![0].data.requestId).toBe(h.leave.mock.calls[1]![0].data.requestId);
    expect(h.associate).toHaveBeenCalledTimes(1);
  });
  it("changing the explicit idea cancels an in-flight preview without automatically connecting the replacement", async () => {
    await openClass();
    await connect();
    const request = pending();
    h.preview.mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByLabelText(/Idea · problem/));
    fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
    fireEvent.change(screen.getByLabelText("Choose your own active idea"), {
      target: { value: otherProject },
    });
    expect(screen.queryByLabelText("Review a classroom submission")).toBeNull();
    await act(async () =>
      request.resolve({
        ok: true,
        data: {
          id: snapshotId,
          hash: "a".repeat(64),
          threadId,
          expiresAt: "2099-01-01T00:00:00Z",
          audience: "teacher",
          teacherVisibleFields: [],
          payload,
        },
      }),
    );
    expect(screen.queryByText("REVIEWED_SELECTED_WORDS")).toBeNull();
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.associate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Connect this idea to the class" })).toBeEnabled();
  });
  it("does not use a different associated project to bypass the server's original revision binding", async () => {
    copies = [copy()];
    await openClass();
    await connect(otherProject);
    fireEvent.click(screen.getByRole("button", { name: "Revise a previous submission" }));
    const local = within(screen.getAllByRole("region", { name: "Your submitted versions" })[0]!);
    fireEvent.click(await local.findByRole("button", { name: "Open saved version" }));
    fireEvent.click(await local.findByRole("button", { name: "Start a new reviewed revision" }));
    await screen.findByText(/Revising the thread of version 1/);
    h.preview.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
    fireEvent.click(screen.getByLabelText(/Idea · problem/));
    fireEvent.click(screen.getByRole("button", { name: "Create exact teacher preview" }));
    await screen.findByText(/class, assignment or submission is unavailable/);
    expect(h.preview.mock.calls[0]![0].data).toMatchObject({
      source: { projectId: otherProject },
      threadId,
    });
    expect(screen.getByLabelText("Choose your own active idea")).toHaveValue(otherProject);
    expect(h.associate).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Submit this reviewed version" })).toBeNull();
  });
  it("an unavailable associated idea offers recovery without reading another idea's sources", async () => {
    detail.projectAssociation = { id: classId, projectId: assignmentId, active: true, revision: 5 };
    await openClass();
    await screen.findByText(/explicitly associated idea is unavailable/);
    expect(screen.queryByLabelText("Published assignment")).toBeNull();
    expect(screen.getByLabelText("Choose your own active idea")).not.toHaveValue(projectId);
    expect(h.queries.every((query) => query.table === "projects" && !query.filters["single"])).toBe(
      true,
    );
    expect(h.associate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Return to your personal workspace" })).toBeVisible();
  });
  it("refreshing revoked class access invalidates the old private preview without removing author recovery", async () => {
    copies = [copy()];
    await openClass();
    await connect();
    await review();
    h.detail.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh selected class" }));
    expect(screen.queryByLabelText("Account student work")).toBeNull();
    await screen.findByText(/unavailable, expired or no longer shared/);
    expect(screen.queryByRole("button", { name: "Submit this reviewed version" })).toBeNull();
    expect(screen.getByRole("region", { name: "Your submitted versions" })).toBeVisible();
    expect(h.associate).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
  });
});
