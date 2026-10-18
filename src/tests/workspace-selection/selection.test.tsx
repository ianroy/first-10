import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionComponent, ReactNode } from "react";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ client: null as unknown as ReturnType<typeof memoryClient> }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import {
  ProjectSelectionProvider,
  selectionStorageKey,
  useProjectSelection,
} from "@/lib/project-selection";
import { useContacts, useProject, useProjects } from "@/lib/data";
import { Route as Setup } from "@/routes/_authenticated/setup";
import { Route as Account } from "@/routes/_authenticated/account";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const C = "10000000-0000-4000-8000-000000000003";
const USER_A = "20000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const project = (id: string, owner: string, name: string): Row => ({
  id,
  user_id: owner,
  name,
  description: `${name} description`,
  audience: "Students",
  problem: "A recent problem",
  link: "",
  stage: 1,
  questions: [],
  survey: [],
  checklist: {},
  created_at: "2026-10-18T00:00:00Z",
});

function memoryClient() {
  const tables: Record<string, Row[]> = {
    projects: [
      project(A, USER_A, "Alpha"),
      project(B, USER_A, "Beta"),
      project(C, USER_B, "Private other idea"),
    ],
    contacts: [
      { id: "ca", user_id: USER_A, project_id: A, first_name: "Alpha person" },
      { id: "cb", user_id: USER_A, project_id: B, first_name: "Beta person" },
    ],
  };
  const calls: {
    table: string;
    operation: string;
    filters: [string, unknown][];
    payload: Row | null;
  }[] = [];
  let userId: string | null = USER_A;
  const client = {
    tables,
    calls,
    setUser: (id: string | null) => {
      userId = id;
    },
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId, app_metadata: {} } : null },
        error: null,
      })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let operation = "select";
      let payload: Row | null = null;
      let single = false;
      let limit: number | null = null;
      const run = () => {
        calls.push({ table, operation, filters: [...filters], payload });
        let rows = (tables[table] ?? []).filter((row) =>
          filters.every(([key, value]) => row[key] === value),
        );
        if (operation === "insert") {
          const row = {
            ...project("10000000-0000-4000-8000-000000000004", userId!, "new"),
            ...payload,
          };
          if (row["user_id"] !== userId) return { data: null, error: new Error("Owner denied") };
          tables[table] = [...(tables[table] ?? []), row];
          rows = [row];
        } else if (operation === "update") {
          rows = rows.filter((row) => row["user_id"] === userId);
          rows.forEach((row) => Object.assign(row, payload));
        }
        if (limit !== null) rows = rows.slice(0, limit);
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        order: () => query,
        limit: (count: number) => {
          limit = count;
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        insert: (value: Row) => {
          operation = "insert";
          payload = value;
          return query;
        },
        update: (value: Row) => {
          operation = "update";
          payload = value;
          return query;
        },
        then: (resolve: (value: ReturnType<typeof run>) => unknown) =>
          Promise.resolve(run()).then(resolve),
      };
      return query;
    },
  };
  return client;
}
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}
function Wrapper({
  children,
  userId = USER_A,
  queryClient,
}: {
  children: ReactNode;
  userId?: string;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectSelectionProvider userId={userId}>{children}</ProjectSelectionProvider>
    </QueryClientProvider>
  );
}
function Probe() {
  const selected = useProjectSelection();
  const current = useProject();
  const projects = useProjects();
  const contacts = useContacts(current.data?.id);
  return (
    <>
      <p data-testid="current">
        {current.error ? current.error.message : (current.data?.name ?? "loading")}
      </p>
      <p data-testid="names">{projects.data?.map((p) => p.name).join(",")}</p>
      <p data-testid="contacts">{contacts.data?.map((p) => p.first_name).join(",")}</p>
      <button onClick={() => selected?.selectProject(B)}>Choose Beta</button>
      <button onClick={() => selected?.selectProject(C)}>Choose unavailable</button>
    </>
  );
}
function app(entry: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: "/setup",
      component: Setup.options.component as FunctionComponent,
      validateSearch: (s: Record<string, unknown>) => (s["new"] === true ? { new: true } : {}),
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/account",
      component: Account.options.component as FunctionComponent,
    }),
    createRoute({ getParentRoute: () => root, path: "/dashboard", component: Probe }),
    ...["/", "/contacts", "/interview", "/learnings", "/outreach", "/marketing", "/teach"].map(
      (path) =>
        createRoute({ getParentRoute: () => root, path, component: () => <p>Other route</p> }),
    ),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(
    <Wrapper queryClient={client()}>
      <RouterProvider router={router} />
    </Wrapper>,
  );
  return router;
}

beforeEach(() => {
  const stored = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, String(value)),
      removeItem: (key: string) => stored.delete(key),
      clear: () => stored.clear(),
      key: (index: number) => [...stored.keys()][index] ?? null,
      get length() {
        return stored.size;
      },
    },
  });
  h.client = memoryClient();
});
afterEach(cleanup);

describe("owner project selection", () => {
  it("lists only the verified owner's projects, switches data and remembers the selection", async () => {
    const qc = client();
    const view = render(
      <Wrapper queryClient={qc}>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Alpha"));
    expect(screen.getByTestId("names")).not.toHaveTextContent("Private other");
    fireEvent.click(screen.getByText("Choose Beta"));
    await waitFor(() => expect(screen.getByTestId("contacts")).toHaveTextContent("Beta person"));
    expect(screen.getByTestId("contacts")).not.toHaveTextContent("Alpha person");
    expect(window.localStorage.getItem(selectionStorageKey(USER_A))).toBe(B);
    expect(
      qc
        .getQueryCache()
        .getAll()
        .some((q) => JSON.stringify(q.queryKey) === JSON.stringify(["contacts", USER_A, B])),
    ).toBe(true);
    view.unmount();
    render(
      <Wrapper queryClient={client()}>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Beta"));
  });
  it("does not fall back when a selected project belongs to somebody else or disappears", async () => {
    window.localStorage.setItem(selectionStorageKey(USER_A), C);
    render(
      <Wrapper queryClient={client()}>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("unavailable"));
    expect(screen.getByTestId("current")).not.toHaveTextContent("Alpha");
    expect(
      h.client.calls
        .filter((c) => c.table === "projects" && c.filters.some(([key]) => key === "id"))
        .every((c) => c.filters.some(([key, value]) => key === "user_id" && value === USER_A)),
    ).toBe(true);
  });
  it("ignores malformed storage and separates selections and caches across account changes", async () => {
    window.localStorage.setItem(selectionStorageKey(USER_A), "not-a-project");
    window.localStorage.setItem(selectionStorageKey(USER_B), C);
    const qc = client();
    const view = render(
      <Wrapper queryClient={qc}>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Alpha"));
    fireEvent.click(screen.getByText("Choose Beta"));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Beta"));
    h.client.setUser(USER_B);
    view.rerender(
      <Wrapper userId={USER_B} queryClient={qc}>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByTestId("current")).not.toHaveTextContent("Beta");
    await waitFor(() =>
      expect(screen.getByTestId("current")).toHaveTextContent("Private other idea"),
    );
    expect(screen.getByTestId("names")).not.toHaveTextContent("Alpha");
    expect(window.localStorage.getItem(selectionStorageKey(USER_A))).toBe(B);
  });
  it("requires a verified identity before standalone reads", async () => {
    h.client.setUser(null);
    render(
      <QueryClientProvider client={client()}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Sign in"));
    expect(h.client.calls).toHaveLength(0);
  });
  it("keeps the account picker reachable when the remembered project is unavailable", async () => {
    window.localStorage.setItem(selectionStorageKey(USER_A), C);
    app("/account");
    expect(await screen.findByText("The selected idea is unavailable.")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Open Beta" }));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Beta"));
  });
  it("creates a separate idea from new mode and selects the returned row without changing existing work", async () => {
    window.localStorage.setItem(selectionStorageKey(USER_A), A);
    app("/setup?new=true");
    const name = await screen.findByLabelText("App name");
    expect(name).toHaveValue("");
    fireEvent.change(name, { target: { value: "New idea" } });
    fireEvent.change(screen.getByLabelText("What does it do?"), {
      target: { value: "A new prototype" },
    });
    fireEvent.change(screen.getByLabelText("Who is it for?"), {
      target: { value: "A new audience" },
    });
    fireEvent.change(screen.getByLabelText("What problem does it solve?"), {
      target: { value: "A new problem" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create new idea" }));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("New idea"));
    expect(h.client.tables["projects"]?.find((p) => p["id"] === A)?.["name"]).toBe("Alpha");
    expect(h.client.calls.filter((c) => c.operation === "insert")).toHaveLength(1);
    expect(h.client.calls.filter((c) => c.operation === "update")).toHaveLength(0);
  });
  it("ordinary setup edits only the selected owner project", async () => {
    window.localStorage.setItem(selectionStorageKey(USER_A), B);
    app("/setup");
    await waitFor(() => expect(screen.getByLabelText("App name")).toHaveValue("Beta"));
    fireEvent.change(screen.getByLabelText("App name"), { target: { value: "Beta refined" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Beta refined"));
    const write = h.client.calls.find((c) => c.operation === "update");
    expect(write?.filters).toEqual(
      expect.arrayContaining([
        ["id", B],
        ["user_id", USER_A],
      ]),
    );
    expect(h.client.calls.some((c) => c.operation === "insert")).toBe(false);
    expect(h.client.tables["projects"]?.find((p) => p["id"] === A)?.["name"]).toBe("Alpha");
  });
});
