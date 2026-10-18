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
import { journeyClient, journeyDraft, scopes, OWNER_A, OWNER_B, deferred } from "./fixtures";
import type {
  DraftRecordResult,
  CompleteDraftResult,
  InterviewDraftRecord,
} from "@/lib/interview-drafts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const h = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof journeyClient>,
  load: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("@/lib/interview-drafts.functions", () => ({
  loadInterviewDraft: h.load,
  saveInterviewDraft: h.save,
  completeInterviewDraft: h.complete,
}));
vi.mock("@/components/AIOrigin", () => ({ AIOrigin: () => null }));
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: () => <p>Private local export available</p>,
}));
import {
  ProjectSelectionProvider,
  selectionStorageKey,
  useProjectSelection,
} from "@/lib/project-selection";
import { RequireProject } from "@/components/RequireProject";
import { InterviewDraftSession } from "@/components/interview-drafts/InterviewDraftSession";
import { createOwnedProject, setOwnedProjectArchived } from "@/lib/project-lifecycle";
const records = new Map<string, InterviewDraftRecord>();
function Controls() {
  const selection = useProjectSelection();
  return (
    <div>
      {scopes
        .filter((scope) => scope.ownerId === selection?.userId)
        .map((scope) => (
          <button key={scope.projectId} onClick={() => selection?.selectProject(scope.projectId)}>
            Choose {scope.marker} by id
          </button>
        ))}
    </div>
  );
}
function Page() {
  return (
    <RequireProject>
      {(p) => (
        <>
          <p data-testid="project-scope">
            {p.user_id}:{p.id}
          </p>
          <InterviewDraftSession
            project={p}
            draftId={scopes.find((scope) => scope.projectId === p.id)!.draftId}
            onDone={vi.fn()}
          />
        </>
      )}
    </RequireProject>
  );
}
function mount(
  ownerId: string = OWNER_A,
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/interview", component: Page }),
      createRoute({
        getParentRoute: () => root,
        path: "/setup",
        component: () => <p>Create first idea</p>,
      }),
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
  return { ...render(tree(ownerId)), qc, tree };
}
beforeEach(() => {
  h.client = journeyClient();
  records.clear();
  scopes.forEach((scope) => records.set(scope.draftId, journeyDraft(scope)));
  window.localStorage.clear();
  window.localStorage.setItem(selectionStorageKey(OWNER_A), scopes[0].projectId);
  window.localStorage.setItem(selectionStorageKey(OWNER_B), scopes[2].projectId);
  h.load.mockReset().mockImplementation(async ({ data }) => ({
    ok: true,
    draft: structuredClone(records.get(data.draftId)),
  }));
  h.save.mockReset().mockImplementation(async ({ data }) => {
    const row = records.get(data.draftId)!;
    if (h.client.tables["projects"]!.find((p) => p["id"] === data.projectId)?.["archived_at"])
      return { ok: false, code: "ARCHIVED" };
    const next = {
      ...row,
      revision: data.expectedRevision + 1,
      document: structuredClone(data.document),
      contactId: data.contactId,
    };
    records.set(data.draftId, next);
    return { ok: true, draft: structuredClone(next) };
  });
  h.complete.mockReset();
});
afterEach(cleanup);
async function expectNote(marker: string) {
  await waitFor(() => expect(screen.getByLabelText("Conversation notes")).toHaveValue(marker));
}
async function saveNote(marker: string) {
  fireEvent.change(screen.getByLabelText("Conversation notes"), { target: { value: marker } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Draft saved\. It is still incomplete/);
}
describe("two-owner, four-idea save and return journeys", () => {
  it("preserves four acknowledged notes despite identical names, account transitions and remounts", async () => {
    const view = mount();
    await expectNote("FICTIONAL_BASE_A1");
    await saveNote("FICTIONAL_ACK_A1");
    fireEvent.click(screen.getByRole("button", { name: "Choose A2 by id" }));
    await expectNote("FICTIONAL_BASE_A2");
    await saveNote("FICTIONAL_ACK_A2");
    h.client.setUser(OWNER_B);
    view.rerender(view.tree(OWNER_B));
    expect(screen.queryByDisplayValue("FICTIONAL_ACK_A2")).not.toBeInTheDocument();
    await expectNote("FICTIONAL_BASE_B1");
    await saveNote("FICTIONAL_ACK_B1");
    fireEvent.click(screen.getByRole("button", { name: "Choose B2 by id" }));
    await expectNote("FICTIONAL_BASE_B2");
    await saveNote("FICTIONAL_ACK_B2");
    expect(window.localStorage.getItem(selectionStorageKey(OWNER_A))).toBe(scopes[1].projectId);
    expect(window.localStorage.getItem(selectionStorageKey(OWNER_B))).toBe(scopes[3].projectId);
    view.unmount();
    h.client.setUser(OWNER_A);
    const returned = mount();
    await expectNote("FICTIONAL_ACK_A2");
    fireEvent.click(screen.getByRole("button", { name: "Choose A1 by id" }));
    await expectNote("FICTIONAL_ACK_A1");
    returned.unmount();
    h.client.setUser(OWNER_B);
    mount(OWNER_B);
    await expectNote("FICTIONAL_ACK_B2");
    for (const scope of scopes)
      expect(records.get(scope.draftId)?.document?.answers[0]?.note).toBe(
        `FICTIONAL_ACK_${scope.marker}`,
      );
    expect(h.save.mock.calls.map(([input]) => input.data.projectId)).toEqual(
      scopes.map((scope) => scope.projectId),
    );
    expect(
      h.client.calls
        .filter((call) => call.table === "contacts")
        .every(
          (call) =>
            call.filters.some(([key]) => key === "user_id") &&
            call.filters.some(([key]) => key === "project_id"),
        ),
    ).toBe(true);
  });
  it("retains an old idea's accepted save when its acknowledgement arrives after another account opens", async () => {
    const ack = deferred<DraftRecordResult>();
    h.save.mockImplementationOnce(async ({ data }) => {
      const next = {
        ...records.get(data.draftId)!,
        revision: 3,
        document: structuredClone(data.document),
      };
      records.set(data.draftId, next);
      return ack.promise;
    });
    const view = mount();
    await expectNote("FICTIONAL_BASE_A1");
    fireEvent.change(screen.getByLabelText("Conversation notes"), {
      target: { value: "FICTIONAL_COMMITTED_A1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    h.client.setUser(OWNER_B);
    view.rerender(view.tree(OWNER_B));
    await expectNote("FICTIONAL_BASE_B1");
    await act(async () =>
      ack.resolve({ ok: true, draft: structuredClone(records.get(scopes[0].draftId)!) }),
    );
    await expectNote("FICTIONAL_BASE_B1");
    expect(screen.queryByText("Saved revision 3")).not.toBeInTheDocument();
    h.client.setUser(OWNER_A);
    view.rerender(view.tree(OWNER_A));
    await expectNote("FICTIONAL_COMMITTED_A1");
    expect(screen.getByText("Saved revision 3")).toBeVisible();
  });
  it("keeps a legacy single-project user's entire original record and draft when a second idea is created", async () => {
    h.client.tables["projects"] = [h.client.tables["projects"]![0]!];
    h.client.tables["contacts"] = [h.client.tables["contacts"]![0]!];
    window.localStorage.clear();
    const original = structuredClone(h.client.tables["projects"]![0]);
    const originalDraft = structuredClone(records.get(scopes[0].draftId));
    mount();
    await expectNote("FICTIONAL_BASE_A1");
    await waitFor(() =>
      expect(window.localStorage.getItem(selectionStorageKey(OWNER_A))).toBe(scopes[0].projectId),
    );
    const result = await createOwnedProject(h.client as unknown as SupabaseClient<Database>, {
      projectId: scopes[1].projectId,
      requestId: "c2070000-0000-4000-8000-000000000071",
      name: "The same idea name",
      description: "The same description",
      audience: "Students",
      problem: "Problem",
      link: "",
    });
    expect(result.ok).toBe(true);
    expect(h.client.tables["projects"]![0]).toEqual(original);
    expect(records.get(scopes[0].draftId)).toEqual(originalDraft);
    fireEvent.click(screen.getByRole("button", { name: "Choose A2 by id" }));
    await expectNote("FICTIONAL_BASE_A2");
    fireEvent.click(screen.getByRole("button", { name: "Choose A1 by id" }));
    await expectNote("FICTIONAL_BASE_A1");
    expect(h.client.tables["projects"]![0]).toEqual(original);
  });
  it("preserves local work through archive rejection, then saves only after explicit restore and retry", async () => {
    mount();
    await expectNote("FICTIONAL_BASE_A1");
    const client = h.client as unknown as SupabaseClient<Database>;
    await setOwnedProjectArchived(client, {
      projectId: scopes[0].projectId,
      requestId: "c2070000-0000-4000-8000-000000000072",
      archived: true,
      expectedRevision: 0,
    });
    fireEvent.change(screen.getByLabelText("Conversation notes"), {
      target: { value: "FICTIONAL_LOCAL_DURING_ARCHIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Restore this idea in Account");
    expect(records.get(scopes[0].draftId)?.document?.answers[0]?.note).toBe("FICTIONAL_BASE_A1");
    await expectNote("FICTIONAL_LOCAL_DURING_ARCHIVE");
    await setOwnedProjectArchived(client, {
      projectId: scopes[0].projectId,
      requestId: "c2070000-0000-4000-8000-000000000073",
      archived: false,
      expectedRevision: 1,
    });
    expect(h.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\./);
    expect(records.get(scopes[0].draftId)?.document?.answers[0]?.note).toBe(
      "FICTIONAL_LOCAL_DURING_ARCHIVE",
    );
    expect(records.get(scopes[1].draftId)?.document?.answers[0]?.note).toBe("FICTIONAL_BASE_A2");
  });
  it.each([1, 2] as const)(
    "ignores a delayed completion receipt after switching to scope %i and recovers it on return",
    async (target) => {
      const ack = deferred<CompleteDraftResult>();
      records.get(scopes[0].draftId)!.document!.currentQuestion = 1;
      const interviewId = "c2070000-0000-4000-8000-000000000081";
      h.complete.mockImplementationOnce(async ({ data }) => {
        records.set(data.draftId, {
          ...records.get(data.draftId)!,
          status: "completed",
          document: null,
          interviewId,
          completedAt: "2026-10-18T19:00:00Z",
        });
        return ack.promise;
      });
      const view = mount();
      fireEvent.click(
        await screen.findByRole("checkbox", { name: /I conducted this conversation/ }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
      await waitFor(() => expect(h.complete).toHaveBeenCalledOnce());
      if (target === 1) fireEvent.click(screen.getByRole("button", { name: "Choose A2 by id" }));
      else {
        h.client.setUser(OWNER_B);
        view.rerender(view.tree(OWNER_B));
      }
      await expectNote(`FICTIONAL_BASE_${scopes[target].marker}`);
      await act(async () =>
        ack.resolve({ ok: true, interviewId, replayed: false, completedRevision: 2 }),
      );
      expect(
        screen.queryByRole("heading", { name: "Interview completion receipt" }),
      ).not.toBeInTheDocument();
      await expectNote(`FICTIONAL_BASE_${scopes[target].marker}`);
      if (target === 1) fireEvent.click(screen.getByRole("button", { name: "Choose A1 by id" }));
      else {
        h.client.setUser(OWNER_A);
        view.rerender(view.tree(OWNER_A));
      }
      expect(
        await screen.findByRole("heading", { name: "Interview completion receipt" }),
      ).toBeVisible();
      expect(h.complete).toHaveBeenCalledExactlyOnceWith({
        data: { projectId: scopes[0].projectId, draftId: scopes[0].draftId, expectedRevision: 2 },
      });
      expect(h.save).not.toHaveBeenCalled();
    },
  );
  it("does not claim a completion after its acknowledgement is lost and recovers the committed terminal receipt on re-entry", async () => {
    records.get(scopes[0].draftId)!.document!.currentQuestion = 1;
    h.complete.mockImplementationOnce(async ({ data }) => {
      records.set(data.draftId, {
        ...records.get(data.draftId)!,
        status: "completed",
        document: null,
        interviewId: "c2070000-0000-4000-8000-000000000082",
        completedAt: "2026-10-18T19:00:00Z",
      });
      return { ok: false, code: "UNAVAILABLE" };
    });
    mount();
    fireEvent.click(await screen.findByRole("checkbox", { name: /I conducted this conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Complete interview" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("result could not be confirmed");
    expect(
      screen.queryByRole("heading", { name: "Interview completion receipt" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose A2 by id" }));
    await expectNote("FICTIONAL_BASE_A2");
    fireEvent.click(screen.getByRole("button", { name: "Choose A1 by id" }));
    expect(
      await screen.findByRole("heading", { name: "Interview completion receipt" }),
    ).toBeVisible();
    expect(h.complete).toHaveBeenCalledOnce();
    expect(h.save).not.toHaveBeenCalled();
  });
});
