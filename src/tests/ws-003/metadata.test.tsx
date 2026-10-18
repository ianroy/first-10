import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSavedActivity } from "@/components/workspace/useSavedActivity";
import { resumeDestination, savedTime } from "@/components/workspace/saved-activity";
const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  rows: {} as Record<string, { data: unknown; error: unknown }>,
  calls: [] as {
    table: string;
    columns: string;
    filters: [string, unknown][];
    signal?: AbortSignal;
  }[],
  hold: false,
  release: null as null | (() => void),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: h.getUser },
    from(table: string) {
      const call: (typeof h.calls)[number] = { table, columns: "", filters: [] };
      const q = {
        select: (columns: string) => {
          call.columns = columns;
          return q;
        },
        eq: (key: string, value: unknown) => {
          call.filters.push([key, value]);
          return q;
        },
        order: () => q,
        limit: () => q,
        abortSignal: (signal: AbortSignal) => {
          call.signal = signal;
          return q;
        },
        maybeSingle: () => {
          h.calls.push(call);
          const reply = h.rows[table] ?? { data: null, error: null };
          if (h.hold && table === "discovery_workspaces") {
            h.hold = false;
            return new Promise((resolve) => {
              h.release = () => resolve(reply);
            });
          }
          return Promise.resolve(reply);
        },
      };
      return q;
    },
  },
}));
const owner = "90000000-0000-4000-8000-000000000001";
const alpha = "90000000-0000-4000-8000-000000000002";
const beta = "90000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-18T14:30:00Z";
function Probe({ projectId = alpha }: { projectId?: string }) {
  const result = useSavedActivity(owner, projectId);
  return (
    <p data-testid="result">
      {result.isLoading ? "loading" : result.error ? "unavailable" : JSON.stringify(result.data)}
    </p>
  );
}
function view(projectId = alpha) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrap = (id: string) => (
    <QueryClientProvider client={qc}>
      <Probe projectId={id} />
    </QueryClientProvider>
  );
  return { ...render(wrap(projectId)), wrap };
}
beforeEach(() => {
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: owner } }, error: null });
  h.rows = {};
  h.calls = [];
  h.hold = false;
  h.release = null;
});
afterEach(cleanup);
it("requests only timestamp/revision metadata, with explicit owner/project scope and active drafts", async () => {
  h.rows["discovery_workspaces"] = {
    error: null,
    data: { user_id: owner, project_id: alpha, updated_at: timestamp, revision: 5 },
  };
  view();
  await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent('"revision":5'));
  expect(h.calls).toHaveLength(3);
  for (const call of h.calls) {
    expect(call.columns.split(",")).toEqual(["user_id", "project_id", "updated_at", "revision"]);
    expect(call.columns).not.toMatch(/document|history|answers|questions|notes|quote/);
    expect(call.filters).toContainEqual(["user_id", owner]);
    expect(call.filters).toContainEqual(["project_id", alpha]);
  }
  expect(h.calls.find((call) => call.table === "interview_drafts")?.filters).toContainEqual([
    "status",
    "active",
  ]);
});
it("does not perform private reads when a fresh identity differs or cannot be verified", async () => {
  h.getUser.mockResolvedValue({ data: { user: { id: beta } }, error: null });
  view();
  await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("unavailable"));
  expect(h.calls).toHaveLength(0);
});
it("keeps known metadata while explicitly marking a partial failure and excludes a foreign reply", async () => {
  h.rows["discovery_workspaces"] = {
    error: null,
    data: { user_id: owner, project_id: alpha, updated_at: timestamp, revision: 5 },
  };
  h.rows["interview_drafts"] = { error: { message: "private database detail" }, data: null };
  h.rows["marketing_plans"] = {
    error: null,
    data: { user_id: beta, project_id: alpha, updated_at: timestamp, revision: 9 },
  };
  view();
  await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent('"incomplete":true'));
  expect(screen.getByTestId("result")).toHaveTextContent('"revision":5');
  expect(screen.getByTestId("result")).not.toHaveTextContent('"revision":9');
  expect(screen.getByTestId("result")).not.toHaveTextContent("private database detail");
});
it("does not let a slow saved timestamp from a prior project become the current suggestion", async () => {
  h.hold = true;
  h.rows["discovery_workspaces"] = {
    error: null,
    data: { user_id: owner, project_id: alpha, updated_at: timestamp, revision: 5 },
  };
  const rendered = view();
  await waitFor(() => expect(h.release).not.toBeNull());
  h.rows = {};
  rendered.rerender(rendered.wrap(beta));
  await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent('"known":[]'));
  expect(h.calls[0]?.signal?.aborted).toBe(true);
  await act(async () => h.release?.());
  expect(screen.getByTestId("result")).not.toHaveTextContent('"revision":5');
});
it("chooses a known saved activity by save time, not revision or ladder stage", () => {
  expect(
    resumeDestination({ questions: [] }, [
      { kind: "discovery", savedAt: "2026-10-18T12:00:00Z", revision: 90 },
      { kind: "interview", savedAt: timestamp, revision: 2 },
      { kind: "marketing", savedAt: "unknown", revision: 20 },
    ]),
  ).toEqual({
    to: "/interview",
    label: "Incomplete interview drafts",
    savedAt: timestamp,
    revision: 2,
  });
});
it("labels missing activity times honestly and distinguishes saved preparation from a completed interview", () => {
  expect(resumeDestination({ questions: ["What happened last time?"] }, [])).toEqual({
    to: "/interview",
    label: "Saved interview preparation",
    savedAt: null,
    revision: null,
  });
  expect(resumeDestination({ questions: [] }, [])).toEqual({
    to: "/discovery",
    label: "Start discovery",
    savedAt: null,
    revision: null,
  });
  expect(savedTime("invalid")).toBe("Time unavailable");
  expect(savedTime(null)).toBe("Time unavailable");
});
