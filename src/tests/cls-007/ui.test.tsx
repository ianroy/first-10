import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const h = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  enter: vi.fn(),
  manage: vi.fn(),
  listClasses: vi.fn(),
  getClass: vi.fn(),
  assignments: vi.fn(),
  members: vi.fn(),
  createClass: vi.fn(),
  saveAssignment: vi.fn(),
  entries: vi.fn(),
  teams: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => <span>First Ten</span> }));
vi.mock("@/components/guest/GuestLearningWorkspace", () => ({
  GuestLearningWorkspace: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
    <section>
      <p>Scoped guest learning studio</p>
      <button onClick={() => onDirtyChange?.(true)}>Make an unsaved guest edit</button>
    </section>
  ),
}));
vi.mock("@/components/guest-marketing/GuestMarketingWorkspace", () => ({
  GuestMarketingWorkspace: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
    <section>
      <button onClick={() => onDirtyChange?.(true)}>Make an unsaved marketing edit</button>
      <button onClick={() => onDirtyChange?.(false)}>Mark marketing clean</button>
    </section>
  ),
}));
vi.mock("@/components/guest-growth/ConnectedGuestGrowthWorkspace", () => ({
  ConnectedGuestGrowthWorkspace: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <section>
      <input aria-label="Guest growth draft" onChange={() => onDirtyChange?.(true)} />
      <button onClick={() => onDirtyChange?.(false)}>Mark growth clean</button>
    </section>
  ),
}));
vi.mock("@/components/classes/TeacherGuestSubmissions", () => ({
  TeacherGuestSubmissions: () => <p>Reviewed guest versions only</p>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/invitations/ClassInvitationPanel", () => ({
  ClassInvitationPanel: () => <section>Named account invitations</section>,
}));
vi.mock("@/lib/guest-spaces.functions", () => ({
  bootstrapGuestSession: h.bootstrap,
  enterGuestSpace: h.enter,
  manageGuestAccess: h.manage,
  listGuestEntries: h.entries,
  listGuestTeams: h.teams,
  createGuestEntry: vi.fn(),
  revokeGuestEntry: vi.fn(),
  revokeGuestScope: vi.fn(),
}));
vi.mock("@/lib/classes.functions", () => ({
  listMyClasses: h.listClasses,
  getClass: h.getClass,
  listAssignments: h.assignments,
  listClassMembers: h.members,
  createClass: h.createClass,
  updateClass: vi.fn(),
  setClassArchived: vi.fn(),
  grantClassTeacher: vi.fn(),
  revokeClassTeacher: vi.fn(),
  removeStudent: vi.fn(),
  leaveClass: vi.fn(),
  saveAssignment: h.saveAssignment,
}));
import { GuestRoom } from "@/components/classes/GuestRoom";
import { ClassroomManager } from "@/components/classes/ClassroomManager";
const id = "fc070000-0000-4000-8000-000000000001",
  other = "fc070000-0000-4000-8000-000000000002";
const view = {
  classId: id,
  className: "Workshop A",
  mode: "hackathon",
  instructions: "Interview relevant people",
  accessExpiresAt: "2027-01-01T12:00:00Z",
  retentionDays: 30,
  aiEnabled: false,
  teamId: id,
  teamAlias: "Team Alpha",
  principalId: id,
  principalAlias: "Learner A",
  assignments: [],
};
const summary = {
  id,
  name: "Workshop A",
  mode: "hackathon",
  instructions: "Test class",
  accessExpiresAt: view.accessExpiresAt,
  retentionDays: 30,
  aiEnabled: false,
  archivedAt: null,
  revision: 1,
  role: "owner",
  updatedAt: "2026-10-18T12:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/join");
  h.bootstrap.mockResolvedValue({ ok: true, data: null, csrf: "a".repeat(64) });
  h.enter.mockResolvedValue({
    ok: true,
    data: view,
    csrf: "b".repeat(64),
    secrets: {
      principalRecovery: "c".repeat(64),
      teamReturn: "d".repeat(64),
      teamInvite: "e".repeat(64),
    },
  });
  h.listClasses.mockResolvedValue({ ok: true, data: { items: [summary], nextCursor: null } });
  h.getClass.mockResolvedValue({
    ok: true,
    data: { ...summary, enrollment: null, projectAssociation: null },
  });
  h.assignments.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  h.members.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  h.entries.mockResolvedValue({ ok: true, data: [] });
  h.teams.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("no-account guest journey", () => {
  it("opens growth lazily, preserves its draft across studio switches and aggregates its access guard", async () => {
    h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf: "a".repeat(64) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GuestRoom />);
    const open = await screen.findByRole("button", { name: "Learning & growth activities" });
    expect(screen.queryByLabelText("Guest growth draft")).not.toBeInTheDocument();
    fireEvent.click(open);
    fireEvent.change(screen.getByLabelText("Guest growth draft"), {
      target: { value: "Keep my next experiment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next 50: $0 Marketing Lab" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark marketing clean" }));
    fireEvent.click(screen.getByRole("button", { name: "End this browser session" }));
    expect(h.manage).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    fireEvent.click(open);
    expect(screen.getByLabelText("Guest growth draft")).toBeVisible();
    expect(screen.getByLabelText("Guest growth draft")).toHaveValue("Keep my next experiment");
    fireEvent.click(screen.getByRole("button", { name: "Mark growth clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Use another code" }));
    expect(await screen.findByLabelText("Private code")).toBeVisible();
    expect(confirm).toHaveBeenCalledOnce();
  });
  it("strips public capability before requests and requires reviewed explicit entry without account fields", async () => {
    window.history.replaceState(null, "", `/join?ignored=1#entry=${"f".repeat(64)}`);
    h.bootstrap.mockImplementation(async () => {
      expect(window.location.hash).toBe("");
      expect(window.location.search).toBe("");
      return { ok: true, data: null, csrf: "a".repeat(64) };
    });
    render(<GuestRoom />);
    const start = await screen.findByRole("button", { name: "Start a new team" });
    expect(start).toBeDisabled();
    expect(h.enter).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(start);
    expect(await screen.findByRole("heading", { name: "Team Alpha" })).toBeVisible();
    expect(h.enter).toHaveBeenCalledWith({
      data: {
        kind: "entry",
        token: "f".repeat(64),
        teamAlias: "",
        principalAlias: "",
        csrf: "a".repeat(64),
      },
    });
    expect(screen.getByRole("heading", { name: "Personal recovery — keep private" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Team return — shared team only" })).toBeVisible();
    expect(screen.getByText("Scoped guest learning studio")).toBeVisible();
  });
  it("keeps unsaved work when access changes are cancelled and only leaves after confirmation", async () => {
    h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf: "a".repeat(64) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GuestRoom />);
    fireEvent.click(await screen.findByRole("button", { name: "Make an unsaved guest edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Next 50: $0 Marketing Lab" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark marketing clean" }));
    fireEvent.click(screen.getByRole("button", { name: "First conversations" }));
    fireEvent.click(screen.getByRole("button", { name: "Use another code" }));
    fireEvent.click(screen.getByRole("button", { name: "End this browser session" }));
    expect(h.manage).not.toHaveBeenCalled();
    expect(screen.getByText("Scoped guest learning studio")).toBeVisible();
    act(() => {
      window.history.replaceState(null, "", `/join#entry=${"9".repeat(64)}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Scoped guest learning studio")).toBeVisible();
    expect(screen.getByText(/Your current work is still here/)).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(3);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Use another code" }));
    expect(screen.queryByText("Scoped guest learning studio")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Private code")).toHaveValue("");
  });
  it("honors a new team invitation instead of silently opening the previous cookie room", async () => {
    window.history.replaceState(null, "", `/join#team_invite=${"f".repeat(64)}`);
    h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf: "a".repeat(64) });
    render(<GuestRoom />);
    expect(await screen.findByRole("button", { name: "Join this team" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Team Alpha" })).not.toBeInTheDocument();
    expect(h.enter).not.toHaveBeenCalled();
  });
  it("restores only cookie-authorized current scope and shows no stored recovery secret", async () => {
    h.bootstrap.mockResolvedValue({ ok: true, data: view, csrf: "a".repeat(64) });
    render(<GuestRoom />);
    expect(await screen.findByRole("heading", { name: "Team Alpha" })).toBeVisible();
    expect(screen.queryByLabelText("Recovery link")).not.toBeInTheDocument();
    expect(h.enter).not.toHaveBeenCalled();
  });
  it("ignores a late old-team entry response after another capability arrives", async () => {
    window.history.replaceState(null, "", `/join#entry=${"f".repeat(64)}`);
    let release: ((v: unknown) => void) | undefined;
    h.enter.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<GuestRoom />);
    await screen.findByRole("button", { name: "Start a new team" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start a new team" }));
    act(() => {
      window.history.replaceState(null, "", `/join#principal_recovery=${"9".repeat(64)}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await screen.findByRole("button", { name: "Recover my identity" });
    await act(async () =>
      release?.({
        ok: true,
        data: view,
        csrf: "b".repeat(64),
        secrets: { principalRecovery: "c".repeat(64), teamReturn: null, teamInvite: null },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Team Alpha" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Personal recovery — keep private" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Private code")).toHaveValue("9".repeat(64));
  });
});
describe("teacher class provisioning without a personal idea", () => {
  it("creates an actual class with published policy fields and no project prerequisite", async () => {
    h.createClass.mockResolvedValue({ ok: true, data: summary });
    render(<ClassroomManager userId={id} />);
    fireEvent.click(screen.getByRole("button", { name: "New class or hackathon" }));
    fireEvent.change(screen.getByLabelText("Space title"), {
      target: { value: "My teaching room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create private space" }));
    await waitFor(() => expect(h.createClass).toHaveBeenCalledTimes(1));
    expect(h.createClass.mock.calls[0]?.[0].data).toEqual({
      classId: expect.any(String),
      requestId: expect.any(String),
      document: {
        name: "My teaching room",
        mode: "class",
        instructions: "",
        accessExpiresAt: expect.any(String),
        retentionDays: 120,
      },
    });
    expect(await screen.findByRole("heading", { name: "Account-free entry" })).toBeVisible();
  });
  it("shows student instructions with no teacher provisioning or roster controls", async () => {
    const enrollment = {
      id: other,
      classId: id,
      displayLabel: "Student",
      role: "student",
      state: "active",
      revision: 1,
    };
    h.listClasses.mockResolvedValue({
      ok: true,
      data: { items: [{ ...summary, role: "student" }], nextCursor: null },
    });
    h.getClass.mockResolvedValue({
      ok: true,
      data: { ...summary, role: "student", enrollment, projectAssociation: null },
    });
    render(<ClassroomManager userId={id} />);
    fireEvent.click(await screen.findByRole("button", { name: /Workshop A/ }));
    await screen.findByRole("heading", { name: "Assignments" });
    expect(screen.queryByRole("heading", { name: "Account-free entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Teaching access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Guest teams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save assignment" })).not.toBeInTheDocument();
    expect(h.members).not.toHaveBeenCalled();
  });
  it("ignores a slow foreign class read after switching to the selected class", async () => {
    h.listClasses.mockResolvedValue({
      ok: true,
      data: { items: [summary, { ...summary, id: other, name: "Workshop B" }], nextCursor: null },
    });
    let release: ((v: unknown) => void) | undefined;
    h.getClass
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({
        ok: true,
        data: {
          ...summary,
          id: other,
          name: "Workshop B",
          enrollment: null,
          projectAssociation: null,
        },
      });
    render(<ClassroomManager userId={id} />);
    fireEvent.click(await screen.findByRole("button", { name: /Workshop A/ }));
    fireEvent.click(screen.getByRole("button", { name: /Workshop B/ }));
    await screen.findByRole("heading", { name: "Workshop B" });
    await act(async () =>
      release?.({
        ok: true,
        data: { ...summary, name: "Late Workshop A", enrollment: null, projectAssociation: null },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Late Workshop A" })).not.toBeInTheDocument();
  });
});
