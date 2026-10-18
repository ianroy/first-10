import { describe, expect, it, vi } from "vitest";
import {
  publicAddress,
  publicURL,
  githubTarget,
  githubPath,
} from "@/lib/context/url-policy.server";
import {
  fetchPublic,
  freshDeadline,
  type PublicTransport,
} from "@/lib/context/fetch-public.server";
import { staticHTMLText, retrieveWebsite } from "@/lib/context/extract.server";
const ip = { address: "8.8.8.8", family: 4 as const };
function transport(
  body = "Public text",
  headers: Record<string, string> = { "content-type": "text/plain" },
) {
  return {
    resolve: vi.fn(async () => [ip]),
    request: vi.fn(async (url: URL) => ({
      status: 200,
      headers,
      body: Buffer.from(body),
      url: url.href,
    })),
  };
}
describe("CTX001 public address and URL policy", () => {
  it.each([
    "http://public.example.org/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://user:password@public.example.org/",
    "https://public.example.org:8443/",
    "https://public.example.org/?token=x",
    "https://public.example.org/#section",
    "https://public.example.org/%2e%2e/admin",
    "https://public.example.org/../admin",
    "https://public.example.org\\@127.0.0.1/",
    "https://service.internal/",
    "https://localhost/",
    "https://public.example.org./",
  ])("rejects %s", (url) => expect(() => publicURL(url)).toThrow());
  it("accepts a plain public HTTPS URL, never assuming its DNS is safe", () => {
    expect(publicURL("https://product.example.org/product").href).toBe(
      "https://product.example.org/product",
    );
  });
  it("denies private, reserved, mapped, multicast, transition and documentation addresses", () => {
    for (const a of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.1.1.1",
      "255.255.255.255",
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:8.8.8.8",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "2002:7f00:1::",
      "3fff::1",
    ])
      expect(publicAddress(a), a).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("bounds GitHub repository paths and never treats a URL or dotfile as a selected file", () => {
    expect(githubTarget("https://github.com/ianroy/first-10.git").repo).toBe("first-10");
    expect(githubPath("src/App.tsx")).toBe("src/App.tsx");
    for (const p of [
      ".env",
      "../README.md",
      "src/components/App.tsx",
      "https://evil.org/a.md",
      "node_modules/x.js",
      "secret.bin",
      "a%2fb.md",
    ])
      expect(() => githubPath(p)).toThrow();
    expect(() => githubTarget("https://github.com/ianroy/first-10/tree/main")).toThrow();
  });
});
describe("CTX001 pinned-hop orchestration", () => {
  it("vets every DNS answer and sends only a selected vetted address to the transport", async () => {
    const t = transport();
    await fetchPublic("https://product.example.org/", freshDeadline(), { transport: t });
    expect(t.request).toHaveBeenCalledWith(
      expect.any(URL),
      ip,
      expect.any(Object),
      262144,
      expect.any(String),
    );
    t.resolve.mockResolvedValueOnce([ip, { address: "127.0.0.1", family: 4 }]);
    t.request.mockClear();
    await expect(
      fetchPublic("https://product.example.org/", freshDeadline(), { transport: t }),
    ).rejects.toThrow();
    expect(t.request).not.toHaveBeenCalled();
  });
  it("re-resolves same-host redirects and rejects a new private answer", async () => {
    const t = transport();
    t.request.mockResolvedValueOnce({
      status: 302,
      headers: { location: "/next" },
      body: Buffer.alloc(0),
      url: "https://product.example.org/",
    });
    t.resolve
      .mockResolvedValueOnce([ip])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(
      fetchPublic("https://product.example.org/", freshDeadline(), { transport: t }),
    ).rejects.toThrow();
    expect(t.resolve).toHaveBeenCalledTimes(2);
    expect(t.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    "https://other.example.org/",
    "http://product.example.org/",
    "https://127.0.0.1/",
    "https://product.example.org/?secret=x",
  ])("rejects redirect %s without another request", async (location) => {
    const t = transport();
    t.request.mockResolvedValueOnce({
      status: 302,
      headers: { location },
      body: Buffer.alloc(0),
      url: "https://product.example.org/",
    });
    await expect(
      fetchPublic("https://product.example.org/", freshDeadline(), { transport: t }),
    ).rejects.toThrow();
    expect(t.request).toHaveBeenCalledTimes(1);
  });
  it("has a strict redirect, request and whole-operation deadline", async () => {
    const t = transport();
    t.request.mockImplementation(async (url: URL) => ({
      status: 302,
      headers: { location: "/next" },
      body: Buffer.alloc(0),
      url: url.href,
    }));
    await expect(
      fetchPublic("https://product.example.org/", freshDeadline(), { transport: t }),
    ).rejects.toThrow();
    expect(t.request).toHaveBeenCalledTimes(3);
    await expect(
      fetchPublic(
        "https://product.example.org/",
        { endsAt: Date.now() - 1, requests: 0 },
        { transport: t },
      ),
    ).rejects.toThrow();
    await expect(
      fetchPublic(
        "https://product.example.org/",
        { endsAt: Date.now() + 1000, requests: 10 },
        { transport: t },
      ),
    ).rejects.toThrow();
  });
  it("extracts inert static text, decodes entities and makes no subresource requests", async () => {
    const html =
      '<html><head><title>ignored</title></head><body><h1>Product &amp; purpose</h1><script>fetch("PRIVATE")</script><style>secret</style><p>For student founders.</p><iframe src="https://127.0.0.1"></iframe></body></html>';
    const text = staticHTMLText(html);
    expect(text).toContain("Product & purpose");
    expect(text).not.toContain("PRIVATE");
    expect(text).not.toContain("secret");
    const t = transport(html, { "content-type": "text/html; charset=utf-8" });
    const sources = await retrieveWebsite("https://product.example.org/", t);
    expect(sources[0]!.format).toBe("html_static_text");
    expect(t.request).toHaveBeenCalledOnce();
    expect(sources[0]!.text).toBe(text);
  });
  it("rejects huge extracted text, credentials, binary and unsupported content types without saving a partial page", async () => {
    for (const t of [
      transport("x".repeat(25000)),
      transport("ghp_" + "x".repeat(20)),
      transport("\0binary"),
      transport("file", { "content-type": "application/pdf" }),
    ])
      await expect(retrieveWebsite("https://product.example.org/", t)).rejects.toThrow();
  });
});
