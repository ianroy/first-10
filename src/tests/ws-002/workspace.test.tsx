import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode, type FunctionComponent } from "react";
import { memory, project, A, B, OTHER, USER, USER2 } from "./memory";
const h = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof memory>,
  navigate: vi.fn(),
  search: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => <p>Navigate to {to}</p>,
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => h.navigate,
  useSearch: () => h.search,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import {
  ProjectSelectionProvider,
  selectionStorageKey,
  useProjectSelection,
} from "@/lib/project-selection";
import { useContacts, useProject } from "@/lib/data";
import { createFakeSupabase } from "@/test/fake-supabase";
import { RequireProject } from "@/components/RequireProject";
import { Route as Account } from "@/routes/_authenticated/account";
import { Route as Setup } from "@/routes/_authenticated/setup";
const AccountPage = Account.options.component as FunctionComponent;
const SetupPage = Setup.options.component as FunctionComponent;
function Controls() {
  const scope = useProjectSelection();
  return (
    <>
      <button onClick={() => scope?.selectProject(A)}>Choose Alpha</button>
      <button onClick={() => scope?.selectProject(B)}>Choose Beta</button>
    </>
  );
}
function Probe() {
  const query = useProject();
  const contacts = useContacts(query.data?.id);
  return (
    <>
      <p data-testid="project">{query.error?.message ?? query.data?.name ?? "Loading"}</p>
      <p data-testid="contacts">{contacts.data?.map((c) => c.first_name).join(",")}</p>
    </>
  );
}
function Draft() {
  const [text, setText] = useState("");
  return (
    <input aria-label="Unsaved draft" value={text} onChange={(e) => setText(e.target.value)} />
  );
}
function mount(children: ReactNode, userId = USER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <ProjectSelectionProvider userId={userId}>
        <Controls />
        {children}
      </ProjectSelectionProvider>
    </QueryClientProvider>,
  );
  return { qc, ...view };
}
beforeEach(() => {
  h.client = memory();
  h.navigate.mockReset();
  h.search = {};
  window.localStorage.clear();
});
afterEach(cleanup);
describe("workspace lifecycle and stale-operation boundaries", () => {
  it("defaults to earliest active idea, while an explicit archived choice requires recovery", async () => {
    h.client.tables["projects"]![0]!["archived_at"] = "2026-10-18T16:00:00Z";
    const view = mount(<Probe />);
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("Beta"));
    fireEvent.click(screen.getByText("Choose Alpha"));
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("archived"));
    expect(screen.getByTestId("project")).not.toHaveTextContent("Beta");
    view.unmount();
    mount(<RequireProject>{() => <p>Private content</p>}</RequireProject>);
    expect(await screen.findByRole("heading", { name: "This idea is archived" })).toBeVisible();
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account & saved work" })).toHaveAttribute(
      "href",
      "/account",
    );
  });
  it("cancels a slow project lookup and ignores its late A response after selecting B", async () => {
    h.client.holdNext((table) => table === "projects");
    const { qc } = mount(<Probe />);
    await waitFor(() => expect(h.client.pending).toHaveLength(1));
    fireEvent.click(screen.getByText("Choose Beta"));
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("Beta"));
    expect(h.client.pending[0]?.signal?.aborted).toBe(true);
    await act(async () => h.client.pending[0]?.resolve());
    expect(screen.getByTestId("project")).toHaveTextContent("Beta");
    expect(qc.getQueryData(["project", USER, null])).toBeUndefined();
  });
  it("cancels slow child reads and never displays A people after B opens", async () => {
    h.client.holdNext((table) => table === "contacts");
    mount(<Probe />);
    await waitFor(() => expect(h.client.pending).toHaveLength(1));
    fireEvent.click(screen.getByText("Choose Beta"));
    expect(await screen.findByText("Beta person")).toBeVisible();
    expect(h.client.pending[0]?.signal?.aborted).toBe(true);
    await act(async () => h.client.pending[0]?.resolve());
    expect(screen.getByTestId("contacts")).toHaveTextContent("Beta person");
    expect(screen.getByTestId("contacts")).not.toHaveTextContent("Alpha person");
    expect(
      h.client.calls
        .filter((call) => call.table === "contacts")
        .every((call) => call.filters.some(([key, value]) => key === "user_id" && value === USER)),
    ).toBe(true);
  });
  it("remounts all RequireProject local drafts on project switch", async () => {
    mount(<RequireProject>{() => <Draft />}</RequireProject>);
    fireEvent.change(await screen.findByLabelText("Unsaved draft"), {
      target: { value: "Alpha-only unsaved notes" },
    });
    fireEvent.click(screen.getByText("Choose Beta"));
    await waitFor(() => expect(screen.getByLabelText("Unsaved draft")).toHaveValue(""));
  });
  it("clears private caches and hides current content immediately after sign-out", async () => {
    const { qc } = mount(<Probe />);
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("Alpha"));
    act(() => {
      h.client.setUser(null);
      h.client.emit("SIGNED_OUT");
    });
    expect(screen.getByRole("link", { name: "Sign in again" })).toBeVisible();
    expect(screen.queryByTestId("project")).not.toBeInTheDocument();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBeNull();
  });
  it("blocks a changed account rather than trusting the old provider identity", async () => {
    mount(<Probe />);
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("Alpha"));
    act(() => {
      h.client.setUser(USER2);
      h.client.emit("SIGNED_IN");
    });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toBeVisible();
  });
  it("keeps a foreign deep-link selection unavailable instead of falling back", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), OTHER);
    mount(<Probe />);
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("unavailable"));
    expect(screen.getByTestId("project")).not.toHaveTextContent("Alpha");
  });
  it("archives and restores through confirmation, retaining original child work", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), A);
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    expect(h.client.rpcCalls.filter((c) => c.name === "set_owned_project_archived")).toHaveLength(
      0,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    expect(await screen.findByRole("button", { name: "Restore Alpha" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Idea lifecycle result" })).toHaveTextContent(
      "Alpha is archived",
    );
    expect(screen.queryByRole("button", { name: "Open Alpha" })).not.toBeInTheDocument();
    expect(h.client.tables["contacts"]![0]!["first_name"]).toBe("Alpha person");
    fireEvent.click(screen.getByRole("button", { name: "Restore Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
    expect(await screen.findByRole("button", { name: "Open Alpha" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Idea lifecycle result" })).toHaveTextContent(
      "Alpha is active",
    );
    expect(h.client.tables["projects"]![0]!["lifecycle_revision"]).toBe(2);
  });
  it("shows actual latest active state after a stale archive acknowledgement", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), A);
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
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Idea lifecycle result" })).toHaveTextContent(
        "Alpha is active",
      ),
    );
    expect(screen.getByRole("button", { name: "Open Alpha" })).toBeVisible();
  });
  it("ignores a pending new-idea result after switching to another idea", async () => {
    h.search = { new: true };
    let release: ((value: { error: null; data: unknown }) => void) | undefined;
    h.client.rpcOverride = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    mount(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("App name"), { target: { value: "New idea" } });
    for (const label of ["What does it do?", "Who is it for?", "What problem does it solve?"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "Description" } });
    fireEvent.click(screen.getByRole("button", { name: "Create new idea" }));
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.click(screen.getByText("Choose Beta"));
    await act(async () =>
      release?.({
        error: null,
        data: {
          ok: true,
          data: {
            id: A,
            name: "new",
            archivedAt: null,
            lifecycleRevision: 0,
            updatedAt: "2026-10-18T16:00:00Z",
          },
        },
      }),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(B);
  });
  it("preserves creation identity after an unknown outcome and retries without another idea", async () => {
    h.search = { new: true };
    let attempts = 0;
    h.client.rpcOverride = (_name, args) => {
      if (++attempts === 1) {
        h.client.tables["projects"]!.push(project(String(args["p_project_id"]), USER, "New idea"));
        return { error: { message: "Reply lost after save" }, data: null };
      }
      return {
        error: null,
        data: {
          ok: true,
          data: {
            id: args["p_project_id"],
            name: "New idea",
            archivedAt: null,
            lifecycleRevision: 0,
            updatedAt: "2026-10-18T16:00:00Z",
          },
        },
      };
    };
    mount(<SetupPage />);
    fireEvent.change(await screen.findByLabelText("App name"), { target: { value: "New idea" } });
    for (const label of ["What does it do?", "Who is it for?", "What problem does it solve?"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "Description" } });
    fireEvent.click(screen.getByRole("button", { name: "Create new idea" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create new idea" })).not.toBeDisabled(),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create new idea" }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: "/dashboard" }));
    const creates = h.client.rpcCalls.filter((call) => call.name === "create_owned_project");
    expect(creates).toHaveLength(2);
    expect(creates[0]?.args).toEqual(creates[1]?.args);
    expect(h.client.tables["projects"]!.filter((row) => row["name"] === "New idea")).toHaveLength(
      1,
    );
  });
  it("refreshes a lifecycle conflict and requires a newly reviewed action", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), A);
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive Alpha" }));
    h.client.tables["projects"]![0]!["lifecycle_revision"] = 2;
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Idea lifecycle result" })).toHaveTextContent(
        "changed in another session",
      ),
    );
    expect(screen.queryByRole("button", { name: "Confirm archive" })).not.toBeInTheDocument();
    expect(h.client.tables["projects"]![0]!["archived_at"]).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Idea lifecycle result" })).toHaveTextContent(
        "Alpha is archived",
      ),
    );
  });
  it("restores an explicit archived selection after reload without choosing another idea", async () => {
    window.localStorage.setItem(selectionStorageKey(USER), A);
    h.client.tables["projects"]![0]!["archived_at"] = "2026-10-18T16:00:00Z";
    h.client.tables["projects"]![0]!["lifecycle_revision"] = 1;
    mount(<AccountPage />);
    expect(await screen.findByText("The selected idea is unavailable.")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
    expect(await screen.findByRole("button", { name: "Open Alpha" })).toBeVisible();
    expect(window.localStorage.getItem(selectionStorageKey(USER))).toBe(A);
  });
  it("keeps an unsaved draft intact on a reverified same-user sign-in event", async () => {
    mount(<RequireProject>{() => <Draft />}</RequireProject>);
    fireEvent.change(await screen.findByLabelText("Unsaved draft"), {
      target: { value: "Keep this focus-return draft" },
    });
    await act(async () => {
      h.client.emit("SIGNED_IN");
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Unsaved draft")).toHaveValue("Keep this focus-return draft");
  });
  it("never defaults missing child fixture ownership to the current viewer", async () => {
    const fake = createFakeSupabase(
      {
        projects: [
          { id: A, user_id: USER },
          { id: B, user_id: USER2 },
        ],
        contacts: [
          { id: "foreign-default", project_id: B },
          { id: "explicit-foreign", project_id: A, user_id: USER2 },
          { id: "own", project_id: A },
        ],
      },
      { id: USER },
    );
    const result = await fake.from("contacts").select().eq("user_id", USER);
    expect(result.data).toEqual([{ id: "own", project_id: A, user_id: USER }]);
  });
});
