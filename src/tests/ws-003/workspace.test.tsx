import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memory, A, B, OTHER, USER, USER2 } from "../ws-002/memory";
const h = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof memory>,
  navigate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => h.navigate,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
import {
  ProjectSelectionProvider,
  selectionStorageKey,
  useProjectSelection,
} from "@/lib/project-selection";
import { PersonalWorkspace } from "@/components/workspace/PersonalWorkspace";
function Controls() {
  const selection = useProjectSelection();
  return <button onClick={() => selection?.selectProject(B)}>External Beta switch</button>;
}
function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectSelectionProvider userId={USER}>
        <Controls />
        <PersonalWorkspace />
      </ProjectSelectionProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  h.client = memory();
  h.client.tables["discovery_workspaces"] = [
    {
      id: "discovery",
      user_id: USER,
      project_id: A,
      revision: 3,
      updated_at: "2026-10-18T13:00:00Z",
    },
  ];
  h.client.tables["interview_drafts"] = [
    {
      id: "draft",
      user_id: USER,
      project_id: A,
      status: "active",
      revision: 2,
      updated_at: "2026-10-18T14:00:00Z",
    },
  ];
  h.client.tables["marketing_plans"] = [
    { id: "plan", user_id: USER, project_id: B, revision: 4, updated_at: "2026-10-18T15:00:00Z" },
  ];
  h.navigate.mockReset().mockResolvedValue(undefined);
  window.localStorage.clear();
  window.localStorage.setItem(selectionStorageKey(USER), A);
});
afterEach(cleanup);
describe("owner personal workspace", () => {
  it("lists only owned ideas and distinguishes saved metadata from validation", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeVisible();
    expect(await screen.findByText("Incomplete interview drafts")).toBeVisible();
    expect(await screen.findByText("Marketing Lab")).toBeVisible();
    expect(screen.queryByText("Other private")).not.toBeInTheDocument();
    expect(screen.getAllByText("Owner · Private")).toHaveLength(2);
    expect(screen.getByText(/Shared-project discovery is still in development/)).toBeVisible();
    expect(
      screen.getAllByText(/not a last-visit record or a measure of customer validation/),
    ).toHaveLength(2);
    const metadata = h.client.calls.filter((call) =>
      ["discovery_workspaces", "interview_drafts", "marketing_plans"].includes(call.table),
    );
    expect(metadata).toHaveLength(6);
    expect(
      metadata.every((call) =>
        call.filters.some(([key, value]) => key === "user_id" && value === USER),
      ),
    ).toBe(true);
    expect(
      metadata.every((call) =>
        call.filters.some(([key, value]) => key === "project_id" && [A, B].includes(String(value))),
      ),
    ).toBe(true);
  });
  it("resumes latest known work after fresh owner checks and remembers selection on reload", async () => {
    const view = mount();
    const resume = await screen.findByRole("button", { name: "Resume Beta" });
    await waitFor(() => expect(resume).not.toBeDisabled());
    fireEvent.click(resume);
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: "/marketing" }));
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(B);
    expect(
      h.client.calls.find(
        (call) =>
          call.table === "projects" &&
          call.filters.some(([key, value]) => key === "id" && value === B),
      )?.filters,
    ).toContainEqual(["user_id", USER]);
    view.unmount();
    mount();
    const beta = (await screen.findByRole("heading", { name: "Beta" })).closest("li")!;
    expect(within(beta).getByText("Selected")).toBeVisible();
    expect(h.client.calls.filter((call) => call.operation !== "select")).toHaveLength(0);
  });
  it("reuses existing setup for rename/edit and creation", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Rename or edit Beta" }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: "/setup", search: {} }));
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(B);
    expect(h.client.rpcCalls).toHaveLength(0);
    expect(screen.getByRole("link", { name: "New idea" })).toHaveAttribute("href", "/setup");
  });
  it("preserves an explicit foreign selection while showing recovery and owned choices", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), OTHER);
    mount();
    expect(await screen.findByText("Your selected idea is unavailable or archived.")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeVisible();
    expect(screen.queryByText("Other private")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(OTHER);
    expect(h.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Account recovery & exports" })).toBeVisible();
  });
  it("restores an explicit archived idea after confirmation and retains its child work", async () => {
    h.client.tables["projects"]![0]!["archived_at"] = "2026-10-18T12:00:00Z";
    h.client.tables["projects"]![0]!["lifecycle_revision"] = 1;
    mount();
    expect(await screen.findByText("Your selected idea is unavailable or archived.")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Archived (1)" }));
    expect(screen.queryByRole("button", { name: "Resume Alpha" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Alpha" }));
    expect(h.client.rpcCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
    expect(await screen.findByRole("status", { name: "Workspace result" })).toHaveTextContent(
      "Alpha is active",
    );
    expect(h.client.tables["contacts"]![0]!["first_name"]).toBe("Alpha person");
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(A);
    expect(h.navigate).not.toHaveBeenCalled();
  });
  it("refreshes actual state rather than trusting a stale archive acknowledgement", async () => {
    h.client.rpcOverride = () => ({
      error: null,
      data: {
        ok: true,
        data: {
          id: A,
          name: "Alpha",
          archivedAt: "2026-10-18T16:00:00Z",
          lifecycleRevision: 1,
          updatedAt: "2026-10-18T16:00:00Z",
        },
      },
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Workspace result" })).toHaveTextContent(
        "Alpha is active",
      ),
    );
    expect(screen.getByRole("button", { name: "Resume Alpha" })).toBeVisible();
  });
  it("keeps a stable request identity across uncertain lifecycle retries", async () => {
    h.client.rpcOverride = () => ({ error: { message: "response lost" }, data: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await screen.findByText(/The change could not be confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() => expect(h.client.rpcCalls).toHaveLength(2));
    expect(h.client.rpcCalls[0]).toEqual(h.client.rpcCalls[1]);
  });
  it("ignores a late lifecycle result after switching project scope", async () => {
    let release: ((value: { error: null; data: unknown }) => void) | undefined;
    h.client.rpcOverride = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "External Beta switch" }));
    await act(async () =>
      release?.({ error: null, data: { ok: false, code: "REVISION_CONFLICT" } }),
    );
    expect(screen.queryByRole("status", { name: "Workspace result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm archive" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(B);
  });
  it("refuses open if the authenticated account changes after listing", async () => {
    mount();
    const open = await screen.findByRole("button", { name: "Open ladder for Alpha" });
    h.client.setUser(USER2);
    fireEvent.click(open);
    expect(await screen.findByRole("status", { name: "Workspace result" })).toHaveTextContent(
      "Sign in again",
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.client.rpcCalls).toHaveLength(0);
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(A);
  });
  it("blocks a cached active idea that was archived in another session", async () => {
    mount();
    const open = await screen.findByRole("button", { name: "Open ladder for Beta" });
    h.client.tables["projects"]![1]!["archived_at"] = "2026-10-18T12:00:00Z";
    fireEvent.click(open);
    expect(await screen.findByRole("status", { name: "Workspace result" })).toHaveTextContent(
      "was archived",
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(A);
  });
  it("offers useful empty state without exposing another owner's idea or mutations", async () => {
    h.client.tables["projects"] = h.client.tables["projects"]!.filter(
      (row) => row["user_id"] === USER2,
    );
    mount();
    expect(await screen.findByText("Your first idea starts here.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Archive / })).not.toBeInTheDocument();
    expect(screen.queryByText("Other private")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New idea" })).toBeVisible();
  });
  it("ignores a stale open check when another project is selected before its reply", async () => {
    mount();
    const open = await screen.findByRole("button", { name: "Open ladder for Alpha" });
    h.client.holdNext(
      (table, filters) =>
        table === "projects" && filters.some(([key, value]) => key === "id" && value === A),
    );
    fireEvent.click(open);
    await waitFor(() => expect(h.client.pending).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "External Beta switch" }));
    await act(async () => h.client.pending[0]?.resolve());
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(B);
  });
  it("fails to a recovery state on a list error rather than displaying a stale owned list", async () => {
    const from = h.client.from.bind(h.client);
    h.client.from = (table) => {
      const query = from(table);
      if (table === "projects")
        query.then = () => {
          throw new Error("sensitive provider detail");
        };
      return query;
    };
    mount();
    expect(await screen.findByText("Your ideas could not be loaded.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByText("sensitive provider detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh ideas" })).toBeVisible();
    expect(h.client.rpcCalls).toHaveLength(0);
  });
  it("keeps known saved work and a clear incomplete label after one metadata source fails", async () => {
    const from = h.client.from.bind(h.client);
    h.client.from = (table) => {
      const query = from(table);
      if (table === "marketing_plans")
        query.then = () => {
          throw new Error("sensitive source error");
        };
      return query;
    };
    mount();
    expect(await screen.findByText("Incomplete interview drafts")).toBeVisible();
    expect(await screen.findAllByText(/Some saved activity could not be checked/)).toHaveLength(2);
    expect(screen.queryByText("sensitive source error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Beta" })).toHaveTextContent("Open discovery");
  });
  it("does not expose thrown transport details while opening an idea", async () => {
    mount();
    const open = await screen.findByRole("button", { name: "Open ladder for Alpha" });
    h.client.auth.getUser = vi.fn().mockRejectedValue(new Error("sensitive auth transport detail"));
    fireEvent.click(open);
    expect(await screen.findByRole("status", { name: "Workspace result" })).toHaveTextContent(
      "Check your connection and try again",
    );
    expect(screen.queryByText("sensitive auth transport detail")).not.toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
