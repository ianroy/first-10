import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/interview-drafts.functions", () => ({
  listInterviewDrafts: mocks.list,
  loadInterviewDraft: mocks.load,
}));
import { loadPortfolioInterviewDrafts } from "@/lib/export/load-interview-drafts";
beforeEach(() => vi.resetAllMocks());
const summary = (id: string) => ({ id, revision: 3 });
const result = (id: string) => ({
  ok: true,
  draft: {
    id,
    projectId: "project-a",
    revision: 3,
    status: "active",
    document: {},
  },
});
it("fails the entire portfolio if any private draft cannot be acquired", async () => {
  mocks.list.mockResolvedValue({ ok: true, drafts: [summary("one"), summary("two")] });
  mocks.load.mockImplementation(async ({ data }: { data: { draftId: string } }) =>
    data.draftId === "two" ? { ok: false, code: "NOT_FOUND" } : result(data.draftId),
  );
  await expect(loadPortfolioInterviewDrafts("project-a")).rejects.toThrow("unavailable");
});
it.each([
  { projectId: "another-project" },
  { revision: 4 },
  { status: "completed" },
  { id: "another-draft" },
  { document: null },
])("rejects stale, completed or foreign draft details: %j", async (change) => {
  mocks.list.mockResolvedValue({ ok: true, drafts: [summary("one")] });
  mocks.load.mockResolvedValue({ ok: true, draft: { ...result("one").draft, ...change } });
  await expect(loadPortfolioInterviewDrafts("project-a")).rejects.toThrow("changed");
});
it("loads at most four private drafts concurrently and preserves listing order", async () => {
  const ids = Array.from({ length: 9 }, (_, index) => `draft-${index}`);
  mocks.list.mockResolvedValue({ ok: true, drafts: ids.map(summary) });
  let active = 0,
    peak = 0;
  mocks.load.mockImplementation(
    async ({ data }: { data: { projectId: string; draftId: string } }) => {
      expect(data.projectId).toBe("project-a");
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return result(data.draftId);
    },
  );
  expect((await loadPortfolioInterviewDrafts("project-a")).map((draft) => draft.id)).toEqual(ids);
  expect(peak).toBe(4);
});
it("does not load details when the scoped listing fails", async () => {
  mocks.list.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
  await expect(loadPortfolioInterviewDrafts("project-a")).rejects.toThrow("unavailable");
  expect(mocks.load).not.toHaveBeenCalled();
});
