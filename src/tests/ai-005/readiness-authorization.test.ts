import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ admin: vi.fn(), audit: vi.fn(), inspect: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://fixture.invalid", { headers: { authorization: "Bearer fictional" } }),
  setResponseHeader: h.header,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/admin-auth.server", () => ({ requirePlatformAdmin: h.admin }));
vi.mock("@/lib/admin-audit.server", () => ({ auditPlatformAdminAction: h.audit }));
vi.mock("@/lib/ai/readiness.server", () => ({ inspectRuntimeAIKey: h.inspect }));
import { getAIKeyReadiness } from "@/lib/ai/readiness.functions";
const run = () =>
  (getAIKeyReadiness as unknown as (v: unknown) => Promise<unknown>)({ context: { supabase: {} } });
beforeEach(() => {
  vi.resetAllMocks();
  h.admin.mockResolvedValue({ userId: "verified-operator" });
  h.audit.mockResolvedValue("audit-receipt");
  h.inspect.mockResolvedValue({ status: "unconfigured" });
});
it("does not inspect a credential when current database admin authority is absent", async () => {
  h.admin.mockRejectedValueOnce(new Error("Admin access denied."));
  await expect(run()).rejects.toThrow("Admin access denied.");
  expect(h.inspect).not.toHaveBeenCalled();
  expect(h.audit).not.toHaveBeenCalled();
});
it("requires an audit before even the free external metadata request", async () => {
  h.audit.mockRejectedValueOnce(new Error("Audit unavailable"));
  await expect(run()).rejects.toThrow("Audit unavailable");
  expect(h.inspect).not.toHaveBeenCalled();
});
it("withholds metadata if authority is revoked during the request", async () => {
  h.admin
    .mockResolvedValueOnce({ userId: "verified-operator" })
    .mockRejectedValueOnce(new Error("Revoked"));
  await expect(run()).rejects.toThrow("Revoked");
  expect(h.inspect).toHaveBeenCalledOnce();
  expect(h.audit).toHaveBeenCalledOnce();
});
it("requires a fresh role check and successful audit before releasing metadata", async () => {
  h.audit.mockResolvedValueOnce("initial").mockRejectedValueOnce(new Error("Audit unavailable"));
  await expect(run()).rejects.toThrow("Audit unavailable");
  expect(h.admin).toHaveBeenCalledTimes(2);
  expect(h.inspect.mock.invocationCallOrder[0]!).toBeGreaterThan(
    h.audit.mock.invocationCallOrder[0]!,
  );
});
it("returns only the bounded readiness result and disables caching", async () => {
  await expect(run()).resolves.toEqual({ status: "unconfigured" });
  expect(h.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  expect(h.admin).toHaveBeenCalledTimes(2);
  expect(h.audit).toHaveBeenCalledTimes(2);
});
