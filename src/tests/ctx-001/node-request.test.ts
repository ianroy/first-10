import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: h.request, default: { request: h.request } }));
import { nodePublicTransport, freshDeadline } from "@/lib/context/fetch-public.server";
let req: EventEmitter & {
  destroy: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  setTimeout: ReturnType<typeof vi.fn>;
};
let callback: (
  res: EventEmitter & {
    headers: Record<string, string>;
    statusCode: number;
    destroy: ReturnType<typeof vi.fn>;
  },
) => void;
beforeEach(() => {
  req = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: vi.fn(), setTimeout: vi.fn() });
  h.request.mockImplementation((_url, _options, cb) => {
    callback = cb;
    return req;
  });
});
afterEach(() => vi.clearAllMocks());
function socket(address = "8.8.8.8", authorized = true) {
  const tls = Object.assign(new EventEmitter(), { remoteAddress: address, authorized });
  req.emit("socket", tls);
  tls.emit("secureConnect");
  return tls;
}
function response(body: Buffer, headers: Record<string, string> = {}) {
  const res = Object.assign(new EventEmitter(), { headers, statusCode: 200, destroy: vi.fn() });
  callback(res);
  res.emit("data", body);
  res.emit("end");
  return res;
}
describe("CTX001 real Node-request boundary options", () => {
  it("pins DNS, preserves TLS identity, disables pooling/proxies, and sends no ambient credentials", async () => {
    const result = nodePublicTransport.request(
      new URL("https://product.example.org/"),
      { address: "8.8.8.8", family: 4 },
      freshDeadline(),
      10,
      "text/plain",
    );
    const options = h.request.mock.calls[0]![1];
    expect(options).toMatchObject({
      agent: false,
      proxyEnv: {},
      family: 4,
      autoSelectFamily: false,
      servername: "product.example.org",
      rejectUnauthorized: true,
      maxHeaderSize: 16384,
    });
    expect(Object.keys(options.headers).sort()).toEqual([
      "Accept",
      "Accept-Encoding",
      "User-Agent",
    ]);
    const lookup = vi.fn();
    options.lookup("product.example.org", {}, lookup);
    expect(lookup).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(req.end).not.toHaveBeenCalled();
    socket();
    expect(req.end).toHaveBeenCalledOnce();
    response(Buffer.from("safe"));
    expect((await result).body.toString()).toBe("safe");
  });
  it.each([
    ["127.0.0.1", true],
    ["8.8.4.4", true],
    ["8.8.8.8", false],
  ] as const)("rejects connected address/certificate mismatch %s", async (address, authorized) => {
    const result = nodePublicTransport.request(
      new URL("https://product.example.org/"),
      { address: "8.8.8.8", family: 4 },
      freshDeadline(),
      10,
      "text/plain",
    );
    socket(address, authorized);
    await expect(result).rejects.toThrow();
    expect(req.end).not.toHaveBeenCalled();
    expect(req.destroy).toHaveBeenCalled();
  });
  it.each([
    { body: "too much", headers: {} },
    { body: "x", headers: { "content-length": "1000" } },
    { body: "x", headers: { "content-encoding": "gzip" } },
  ])("aborts oversized/compressed response", async ({ body, headers }) => {
    const result = nodePublicTransport.request(
      new URL("https://product.example.org/"),
      { address: "8.8.8.8", family: 4 },
      freshDeadline(),
      3,
      "text/plain",
    );
    socket();
    response(Buffer.from(body), headers);
    await expect(result).rejects.toThrow();
    expect(req.destroy).toHaveBeenCalled();
  });
  it("does not send HTTP after an elapsed deadline even if the timer callback has not run", async () => {
    vi.useFakeTimers();
    try {
      const d = freshDeadline();
      const result = nodePublicTransport.request(
        new URL("https://product.example.org/"),
        { address: "8.8.8.8", family: 4 },
        d,
        10,
        "text/plain",
      );
      vi.setSystemTime(d.endsAt + 1);
      socket();
      await expect(result).rejects.toThrow();
      expect(req.end).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("destroys an idle request and never retries it", async () => {
    const result = nodePublicTransport.request(
      new URL("https://product.example.org/"),
      { address: "8.8.8.8", family: 4 },
      freshDeadline(),
      10,
      "text/plain",
    );
    const idle = req.setTimeout.mock.calls[0]![1];
    idle();
    await expect(result).rejects.toThrow();
    expect(h.request).toHaveBeenCalledOnce();
  });
});
