import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  result: vi.fn(),
  header: vi.fn(),
  headers: {} as Record<string, string>,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.test", { headers: h.headers }),
  setResponseHeader: h.header,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { submitFoundingPartner } from "@/lib/founding-partners.functions";
const submit = submitFoundingPartner as unknown as (args: { data: unknown }) => Promise<unknown>;
const valid = {
  email: "Teacher@Example.test",
  school: "Example school",
  kind: "interest",
  note: "",
  website: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  h.headers = {};
  vi.stubEnv("SUPABASE_URL", "https://fixture.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
  vi.stubEnv("VERCEL", "0");
  h.rpc.mockReturnValue({ abortSignal: h.result });
  h.result.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  null,
  {},
  { ...valid, email: "bad" },
  { ...valid, email: "x".repeat(255) + "@example.test" },
  { ...valid, school: " " },
  { ...valid, school: "x".repeat(201) },
  { ...valid, note: "x".repeat(2001) },
  { ...valid, website: "bot" },
  { ...valid, website: " " },
  { ...valid, kind: "admin" },
  { ...valid, role: "admin" },
  { ...valid, kind: "feedback", note: " " },
])("rejects invalid, oversized or honeypot input before privileged I/O", async (data) => {
  expect(await submit({ data })).toEqual({ ok: false, code: "INVALID" });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("normalizes bounded input and returns no submitted data, identifiers or secret", async () => {
  expect(
    await submit({ data: { ...valid, school: " Example school ", note: " Requested pilot " } }),
  ).toEqual({ ok: true });
  expect(h.rpc).toHaveBeenCalledWith("record_founding_partner", {
    p_email: "teacher@example.test",
    p_school: "Example school",
    p_kind: "interest",
    p_note: "Requested pilot",
    p_ip_hash: null,
  });
  expect(h.header).toHaveBeenCalledWith("Cache-Control", "no-store");
});
it("hashes only the platform IP in Vercel and never stores raw IP or arbitrary forwarding headers", async () => {
  h.headers = { "x-forwarded-for": "203.0.113.99", "x-vercel-forwarded-for": "192.0.2.45" };
  await submit({ data: valid });
  expect(h.rpc.mock.calls[0]![1].p_ip_hash).toBeNull();
  vi.stubEnv("VERCEL", "1");
  await submit({ data: valid });
  expect(h.rpc.mock.calls[1]![1].p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("192.0.2.45");
  expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("203.0.113.99");
});
it("accepts feedback but preserves throttling and fails closed without exposing backend data", async () => {
  h.result.mockResolvedValueOnce({ data: { ok: false, code: "RATE_LIMITED" }, error: null });
  expect(
    await submit({ data: { ...valid, kind: "feedback", note: "Please improve the examples" } }),
  ).toEqual({ ok: false, code: "RATE_LIMITED" });
  for (const response of [
    { data: { ok: true, email: valid.email }, error: null },
    { data: null, error: { message: "private detail" } },
  ]) {
    h.result.mockResolvedValueOnce(response);
    expect(await submit({ data: valid })).toEqual({ ok: false, code: "UNAVAILABLE" });
  }
  h.result.mockRejectedValueOnce(new Error("private detail"));
  expect(await submit({ data: valid })).toEqual({ ok: false, code: "UNAVAILABLE" });
});
it("does not attempt an RPC when service configuration is unavailable", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(await submit({ data: valid })).toEqual({ ok: false, code: "UNAVAILABLE" });
  expect(h.rpc).not.toHaveBeenCalled();
});
