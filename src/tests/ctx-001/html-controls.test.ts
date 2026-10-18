import { describe, expect, it, vi } from "vitest";
import { decodeText, retrieveWebsite, staticHTMLText } from "@/lib/context/extract.server";
import type { PublicTransport } from "@/lib/context/fetch-public.server";

function transport(body: Buffer, contentType = "text/html"): PublicTransport {
  return {
    resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
    request: vi.fn(async (url: URL) => ({
      status: 200,
      headers: { "content-type": contentType },
      body,
      url: url.href,
    })),
  };
}

describe("CTX001 inert HTML controls", () => {
  it("omits hydration controls in scripts/styles without executing or fetching them", async () => {
    const html =
      '<!doctype html><html><head><script src="https://127.0.0.1/private">self.$R=["\0","\0\0"];throw Error("executed");</script><style>body{--payload:"\u0001"}</style></head><body><h1>Real product</h1><p>For student founders.</p></body></html>';
    const t = transport(Buffer.from(html));
    const rows = await retrieveWebsite("https://product.example.org/", t);
    expect(rows[0]!.text).toBe("Real product\nFor student founders.");
    expect(rows[0]!.bytes).toBe(Buffer.byteLength(html));
    expect(t.resolve).toHaveBeenCalledTimes(1);
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(rows[0]!.text).not.toMatch(/self|payload|executed|127/);
  });

  it.each([
    "<p>before\0after</p>",
    "<body>\0</body>",
    "<p>before\u0001after</p>",
    "<p>before\u007fafter</p>",
    "<p>&#1;</p>",
    '<p title="\0">Visible</p>',
    "<!--\0--><p>Visible</p>",
    '<script>const early="</script>\0<p>Visible</p>',
    "<script>ignored\0</script><p>Visible\0</p>",
  ])("still rejects controls outside omitted elements: %j", (html) => {
    expect(() => staticHTMLText(html)).toThrow();
  });

  it("handles implicit head, malformed raw text and nested ignored elements by parsed boundaries", () => {
    expect(staticHTMLText("<script>\0</script><p>Visible</p>")).toBe("Visible");
    expect(
      staticHTMLText(
        "<head><script>\0</script></head><body><svg><text>\0</text></svg><p>Visible</p>",
      ),
    ).toBe("Visible");
    expect(() => staticHTMLText("<p>Visible</p><script>ignored\0")).toThrow();
    expect(() => staticHTMLText("<script>\0")).toThrow();
    expect(staticHTMLText("<p>A\tB\r\nC</p>")).toContain("A B");
  });

  it("keeps strict UTF-8 decoding for HTML and whole-body control rejection for plain/Markdown/GitHub text", async () => {
    await expect(
      retrieveWebsite("https://product.example.org/", transport(Buffer.from([0xc3, 0x28]))),
    ).rejects.toThrow();
    for (const contentType of ["text/plain", "text/markdown"]) {
      await expect(
        retrieveWebsite(
          "https://product.example.org/",
          transport(Buffer.from("<script>\0</script><p>Visible</p>"), contentType),
        ),
      ).rejects.toThrow();
    }
    expect(() => decodeText(Buffer.from('{"name":"\0"}'))).toThrow();
    expect(() => decodeText(Buffer.from("# file\n\0"))).toThrow();
  });

  it("preserves bounded node/depth/text rejection even with omitted control payloads", () => {
    expect(() => staticHTMLText("<div>".repeat(130) + "deep" + "</div>".repeat(130))).toThrow();
    expect(() => staticHTMLText("<i>x</i>".repeat(7600))).toThrow();
    expect(() => staticHTMLText("<script>\0</script><p>" + "x".repeat(25000) + "</p>")).toThrow();
  });
});
