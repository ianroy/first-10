import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionComponent, ReactNode } from "react";
import {
  journeyClient,
  scopes,
  OWNER_A,
  OWNER_B,
  deferred,
  question,
} from "../workspace-journeys/fixtures";
const h = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof journeyClient>,
  gen: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("@/lib/ai.functions", () => ({ generateAI: h.gen }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: vi.fn() } }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DraftBadge: () => <p>Reviewable draft</p>,
  PrivacyNote: () => null,
  Empty: () => <p>No completed interviews</p>,
}));
vi.mock("@/components/ConsentFields", () => ({
  SavedConsentFields: () => <p>Permission choices are separate</p>,
}));
vi.mock("@/components/AIOrigin", () => ({ AIOrigin: () => null }));
vi.mock("@/components/export/OwnerActivityExport", () => ({ OwnerActivityExport: () => null }));
vi.mock("@/components/interview-drafts/InterviewDraftList", () => ({
  InterviewDraftList: () => <p>Saved drafts remain separate</p>,
}));
import {
  ProjectSelectionProvider,
  selectionStorageKey,
  useProjectSelection,
} from "@/lib/project-selection";
import { Route as Interview } from "@/routes/_authenticated/interview";
const InterviewPage = Interview.options.component as FunctionComponent;
function Controls() {
  const selection = useProjectSelection();
  return (
    <>
      {scopes
        .filter((s) => s.ownerId === selection?.userId)
        .map((s) => (
          <button key={s.projectId} onClick={() => selection?.selectProject(s.projectId)}>
            Choose {s.marker} by id
          </button>
        ))}
    </>
  );
}
function mount(ownerId: string = OWNER_A) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRootRoute({ component: () => <Outlet /> });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/interview", component: InterviewPage }),
      createRoute({ getParentRoute: () => root, path: "/setup", component: () => <p>Setup</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/interview"] }),
  });
  const tree = (owner: string) => (
    <QueryClientProvider client={qc}>
      <ProjectSelectionProvider userId={owner}>
        <Controls />
        <RouterProvider router={router} />
      </ProjectSelectionProvider>
    </QueryClientProvider>
  );
  return { ...render(tree(ownerId)), tree };
}
beforeEach(() => {
  h.client = journeyClient();
  h.gen.mockReset();
  h.error.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem(selectionStorageKey(OWNER_A), scopes[0].projectId);
  localStorage.setItem(selectionStorageKey(OWNER_B), scopes[2].projectId);
});
afterEach(cleanup);
const originId = "c2070000-0000-4000-8000-000000000091";
describe("actual interview route during synthetic deferred generation", () => {
  it("ignores an old project's answer while a same-name idea owns the active request, then reuses the original uncertain identity on return", async () => {
    const old = deferred<unknown>(),
      current = deferred<unknown>();
    h.gen
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise)
      .mockResolvedValueOnce({ originId, data: { questions: ["FICTIONAL_A1_REVIEW_DRAFT"] } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.gen).toHaveBeenCalledOnce());
    const first = h.gen.mock.calls[0]![0].data;
    fireEvent.click(screen.getByRole("button", { name: "Choose A2 by id" }));
    await waitFor(() => expect(screen.getByLabelText("Question 1")).toHaveValue(question));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(2));
    expect(h.gen.mock.calls[1]![0].data).toMatchObject({ projectId: scopes[1].projectId });
    expect(h.gen.mock.calls[1]![0].data.operationId).not.toBe(first.operationId);
    await act(async () =>
      old.resolve({ originId, data: { questions: ["FICTIONAL_OLD_PROJECT_DRAFT"] } }),
    );
    expect(screen.getByLabelText("Question 1")).toHaveValue(question);
    expect(screen.getByRole("button", { name: "Rewriting…" })).toBeDisabled();
    await act(async () =>
      current.resolve({ originId, data: { questions: ["FICTIONAL_A2_REVIEW_DRAFT"] } }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Question 1")).toHaveValue("FICTIONAL_A2_REVIEW_DRAFT"),
    );
    expect(
      h.client.tables["projects"]!.every(
        (p) => JSON.stringify(p["questions"]) === JSON.stringify([question]),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Choose A1 by id" }));
    await waitFor(() => expect(screen.getByLabelText("Question 1")).toHaveValue(question));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(3));
    expect(h.gen.mock.calls[2]![0].data).toEqual(first);
    await waitFor(() =>
      expect(screen.getByLabelText("Question 1")).toHaveValue("FICTIONAL_A1_REVIEW_DRAFT"),
    );
    expect(screen.queryByDisplayValue("FICTIONAL_A2_REVIEW_DRAFT")).not.toBeInTheDocument();
  });
  it("does not display an old owner's draft or completion error after the account boundary changes", async () => {
    const old = deferred<unknown>();
    h.gen
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ originId, data: { questions: ["FICTIONAL_B1_REVIEW_DRAFT"] } });
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() => expect(h.gen).toHaveBeenCalledOnce());
    const oldOperation = h.gen.mock.calls[0]![0].data.operationId;
    h.client.setUser(OWNER_B);
    view.rerender(view.tree(OWNER_B));
    await waitFor(() => expect(screen.getByLabelText("Question 1")).toHaveValue(question));
    await act(async () =>
      old.resolve({ originId, data: { questions: ["FICTIONAL_OWNER_A_ONLY"] } }),
    );
    expect(screen.getByLabelText("Question 1")).toHaveValue(question);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate with AI" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Question 1")).toHaveValue("FICTIONAL_B1_REVIEW_DRAFT"),
    );
    expect(h.gen.mock.calls[1]![0].data).toMatchObject({ projectId: scopes[2].projectId });
    expect(h.gen.mock.calls[1]![0].data.operationId).not.toBe(oldOperation);
    expect(h.error).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(`firstten:ai-intent:${OWNER_A}:${scopes[0].projectId}:questions`),
    ).toBe(oldOperation);
  });
});
