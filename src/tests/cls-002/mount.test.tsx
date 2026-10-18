import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const h = vi.hoisted(() => ({
  classes: vi.fn(),
  detail: vi.fn(),
  assignments: vi.fn(),
  members: vi.fn(),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/classes/AccountSubmissionWorkspace", () => ({
  AccountSubmissionWorkspace: ({ userId }: { userId: string }) => (
    <p>Owner-scoped account workspace for {userId}</p>
  ),
}));
vi.mock("@/components/classes/SubmissionList", () => ({
  SubmissionList: ({ mode, classId }: { mode: string; classId?: string }) => (
    <p>
      {mode} submission list {classId ?? "all-own"}
    </p>
  ),
}));
vi.mock("@/components/export/SubmittedSnapshotExport", () => ({
  SubmittedSnapshotExport: () => null,
}));
vi.mock("@/components/invitations/ClassInvitationPanel", () => ({
  ClassInvitationPanel: () => null,
}));
vi.mock("@/components/classes/EntryLink", () => ({ EntryLink: () => null }));
vi.mock("@/lib/classes.functions", () => ({
  listMyClasses: h.classes,
  getClass: h.detail,
  listAssignments: h.assignments,
  listClassMembers: h.members,
}));
vi.mock("@/lib/guest-spaces.functions", () => ({
  listGuestTeams: vi.fn().mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } }),
  listGuestEntries: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));
import { ClassroomManager } from "@/components/classes/ClassroomManager";
const summary = {
  id: "c2120000-0000-4000-8000-000000000001",
  name: "Reviewed class",
  mode: "class",
  role: "teacher",
  archivedAt: null,
  accessExpiresAt: "2099-01-01T00:00:00Z",
  retentionDays: 30,
  instructions: "Selected versions only",
  revision: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.classes.mockResolvedValue({ ok: true, data: { items: [summary], nextCursor: null } });
  h.detail.mockResolvedValue({
    ok: true,
    data: { ...summary, enrollment: null, projectAssociation: null },
  });
  h.assignments.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  h.members.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});
afterEach(cleanup);
it("teacher mounts recipient list scoped to the verified class and never mounts owner-source workspace", async () => {
  render(<ClassroomManager userId="verified-user" />);
  fireEvent.click(await screen.findByRole("button", { name: /Reviewed class/ }));
  await screen.findByText(`teacher submission list ${summary.id}`);
  expect(screen.queryByText(/Owner-scoped account workspace/)).toBeNull();
  expect(screen.getByText("author submission list all-own")).toBeVisible();
});
it("enrolled account students mount their own-source authoring, without a teacher read/list", async () => {
  h.detail.mockResolvedValue({
    ok: true,
    data: {
      ...summary,
      role: "student",
      enrollment: { role: "student", state: "active" },
      projectAssociation: null,
    },
  });
  render(<ClassroomManager userId="verified-user" />);
  fireEvent.click(await screen.findByRole("button", { name: /Reviewed class/ }));
  await screen.findByText("Owner-scoped account workspace for verified-user");
  expect(screen.queryByText(/teacher submission list/)).toBeNull();
});
it("failed or missing selected class leaves author recovery list available without project gating", async () => {
  h.detail.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  render(<ClassroomManager userId="verified-user" />);
  fireEvent.click(await screen.findByRole("button", { name: /Reviewed class/ }));
  await screen.findByText(/unavailable, expired/);
  expect(screen.getByText("author submission list all-own")).toBeVisible();
  expect(screen.queryByText(/teacher submission list/)).toBeNull();
});
