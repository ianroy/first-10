import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authorization: "Bearer valid-fixture-token",
  getUser: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  setStatus: vi.fn(),
  setHeader: vi.fn(),
  requests: [] as {
    table: string;
    columns: string;
    options: unknown;
    filters: [string, unknown][];
  }[],
  unavailable: new Set<string>(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://fixture.invalid/admin", {
      headers: h.authorization ? { authorization: h.authorization } : {},
    }),
  setResponseStatus: h.setStatus,
  setResponseHeader: h.setHeader,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: h.createClient }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: h.from, rpc: h.rpc },
}));
import { getAdminSnapshot } from "@/lib/admin.functions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://fixture.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-fixture-never-return");
  h.authorization = "Bearer valid-fixture-token";
  h.requests = [];
  h.unavailable.clear();
  h.rpc.mockReturnValue({
    abortSignal: async () => ({
      data: {
        interestRequests: 0,
        feedbackSubmissions: 0,
        distinctRespondents: 0,
        excludedFixtures: 1,
      },
      error: null,
    }),
  });
  h.getUser.mockResolvedValue({
    data: { user: { id: "presenter-id", app_metadata: { firstten_demo_admin: true } } },
    error: null,
  });
  h.createClient.mockReturnValue({ auth: { getUser: h.getUser } });
  h.from.mockImplementation((table: string) => {
    const row = {
      table,
      columns: "",
      options: undefined as unknown,
      filters: [] as [string, unknown][],
    };
    const query = {
      select: (columns: string, options: unknown) => {
        row.columns = columns;
        row.options = options;
        return query;
      },
      eq: (name: string, value: unknown) => {
        row.filters.push([name, value]);
        return query;
      },
      abortSignal: async () => {
        h.requests.push(row);
        return {
          data: null,
          count: row.filters.some(([field]) => field === "user_id") ? 2 : 7,
          error: h.unavailable.has(table) ? { message: "private database detail" } : null,
        };
      },
    };
    return query;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only admin aggregate authorization", () => {
  it.each(["", "Basic fixture", "Bearer a,b", "Bearer two tokens"])(
    "rejects invalid bearer form %j before any privileged or auth lookup",
    async (header) => {
      h.authorization = header;
      await expect(getAdminSnapshot()).rejects.toThrow("Admin access denied.");
      expect(h.setStatus).toHaveBeenCalledWith(403);
      expect(h.from).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.createClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    { app_metadata: {}, user_metadata: { firstten_demo_admin: true } },
    { app_metadata: { firstten_demo_admin: false } },
    { app_metadata: { firstten_demo_admin: "true" } },
  ])("ignores editable/profile or nonboolean role grants: %j", async (metadata) => {
    h.getUser.mockResolvedValue({
      data: { user: { id: "ordinary-user", ...metadata } },
      error: null,
    });
    await expect(getAdminSnapshot()).rejects.toThrow("Admin access denied.");
    expect(h.getUser).toHaveBeenCalledWith("valid-fixture-token");
    expect(h.setStatus).toHaveBeenCalledWith(403);
    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("fails closed for rejected or revoked auth, including lookup failure", async () => {
    h.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid token" } });
    await expect(getAdminSnapshot()).rejects.toThrow("Admin access denied.");
    h.getUser.mockRejectedValueOnce(new Error("provider detail"));
    await expect(getAdminSnapshot()).rejects.toThrow("Admin access denied.");
    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.setStatus).toHaveBeenCalledWith(403);
  });

  it("checks the fresh role on every request and stops aggregate reads after revocation", async () => {
    await getAdminSnapshot();
    expect(h.from).toHaveBeenCalledTimes(12);
    h.getUser.mockResolvedValueOnce({
      data: { user: { id: "presenter-id", app_metadata: {} } },
      error: null,
    });
    await expect(getAdminSnapshot()).rejects.toThrow("Admin access denied.");
    expect(h.from).toHaveBeenCalledTimes(12);
    expect(h.rpc).toHaveBeenCalledOnce();
    expect(h.getUser).toHaveBeenCalledTimes(2);
  });

  it("returns only count aggregates, labels presenter rows separately, and prohibits HTTP caching", async () => {
    const result = await getAdminSnapshot();
    expect(result.status).toBe("ready");
    expect(result.metrics).toHaveLength(6);
    expect(result.partners).toEqual({
      interestRequests: 0,
      feedbackSubmissions: 0,
      distinctRespondents: 0,
      excludedFixtures: 1,
    });
    expect(h.rpc).toHaveBeenCalledWith("get_founding_partner_counts");
    expect(result.metrics.every((m) => m.total === 7 && m.presenter === 2)).toBe(true);
    expect(h.requests).toHaveLength(12);
    expect(
      h.requests.every(
        (r) =>
          r.columns === "id" &&
          JSON.stringify(r.options) === JSON.stringify({ count: "exact", head: true }),
      ),
    ).toBe(true);
    expect(
      h.requests.filter((r) =>
        r.filters.some(([key, value]) => key === "user_id" && value === "presenter-id"),
      ),
    ).toHaveLength(6);
    expect(
      h.requests
        .filter((r) => r.table === "interviews")
        .every((r) => r.filters.some(([key, value]) => key === "completed" && value === true)),
    ).toBe(true);
    expect(
      h.requests
        .filter((r) => r.table === "learnings")
        .every((r) => r.filters.some(([key, value]) => key === "accepted" && value === true)),
    ).toBe(true);
    expect(h.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "presenter-id",
      "service-fixture-never-return",
      "valid-fixture-token",
      "sb_publishable_fixture",
      "app_metadata",
      "user_metadata",
      "email",
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it("reports unconfigured or failed counts as unavailable, never zero or leaked errors", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const unconfigured = await getAdminSnapshot();
    expect(unconfigured.status).toBe("unavailable");
    expect(unconfigured.metrics.every((m) => m.total === null && m.presenter === null)).toBe(true);
    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-fixture-never-return");
    h.unavailable.add("interviews");
    const partial = await getAdminSnapshot();
    expect(partial.status).toBe("partial");
    expect(partial.metrics.find((m) => m.key === "interviews")).toMatchObject({
      total: null,
      presenter: null,
    });
    expect(JSON.stringify(partial)).not.toContain("private database detail");
  });
  it("keeps malformed, unavailable or private partner RPC data out of the response", async () => {
    for (const data of [null, { email: "private@example.test" }, { interestRequests: -1 }]) {
      h.rpc.mockReturnValueOnce({ abortSignal: async () => ({ data, error: null }) });
      const result = await getAdminSnapshot();
      expect(result.partners).toBeNull();
      expect(result.status).toBe("partial");
      expect(JSON.stringify(result)).not.toContain("private@example.test");
    }
  });
});
