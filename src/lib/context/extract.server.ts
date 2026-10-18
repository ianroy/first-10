import { createHash } from "node:crypto";
import { parse } from "parse5";
import { PUBLIC_CONTEXT_LIMITS as L, remoteSourceSchema, type RemoteSource } from "./contracts";
import { PublicRetrievalError } from "./url-policy.server";
import { fetchPublic, freshDeadline, type PublicTransport } from "./fetch-public.server";
export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export function decodeText(bytes: Buffer): string {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (
      Array.from(value).some((c) => {
        const n = c.charCodeAt(0);
        return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
      })
    )
      throw new Error();
    return value;
  } catch {
    throw new PublicRetrievalError();
  }
}
function boundedPreview(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) throw new PublicRetrievalError();
  if (Buffer.byteLength(clean) > L.previewBytes) throw new PublicRetrievalError("SOURCE_TOO_LARGE");
  return clean;
}
type TreeNode = { nodeName: string; value?: string; childNodes?: TreeNode[] };
export function staticHTMLText(html: string) {
  const document = parse(html) as unknown as TreeNode;
  const ignored = new Set([
    "head",
    "script",
    "style",
    "template",
    "noscript",
    "iframe",
    "object",
    "embed",
    "svg",
    "canvas",
  ]);
  const blocks = new Set([
    "p",
    "div",
    "section",
    "article",
    "main",
    "header",
    "footer",
    "nav",
    "h1",
    "h2",
    "h3",
    "h4",
    "li",
    "ul",
    "ol",
    "br",
    "tr",
  ]);
  const parts: string[] = [];
  const stack: { node: TreeNode; depth: number }[] = [{ node: document, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > 15000 || depth > 128) throw new PublicRetrievalError();
    if (ignored.has(node.nodeName)) continue;
    if (node.nodeName === "#text") parts.push(node.value ?? "");
    if (blocks.has(node.nodeName)) parts.push("\n");
    for (let i = (node.childNodes?.length ?? 0) - 1; i >= 0; i--)
      stack.push({ node: node.childNodes![i]!, depth: depth + 1 });
  }
  return boundedPreview(
    parts
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}
export async function retrieveWebsite(
  url: string,
  transport?: PublicTransport,
): Promise<RemoteSource[]> {
  const deadline = freshDeadline();
  const response = await fetchPublic(url, deadline, transport ? { transport } : {});
  const contentType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (!["text/html", "text/plain", "text/markdown"].includes(contentType ?? ""))
    throw new PublicRetrievalError();
  const decoded = decodeText(response.body);
  const html = contentType === "text/html";
  const text = html ? staticHTMLText(decoded) : boundedPreview(decoded);
  if (Date.now() >= deadline.endsAt) throw new PublicRetrievalError("UNAVAILABLE");
  return [
    remoteSourceSchema.parse({
      url: response.url,
      title: new URL(response.url).hostname,
      format: html ? "html_static_text" : "plain_text",
      contentHash: sha256(response.body),
      previewHash: sha256(text),
      text,
      bytes: response.body.length,
      commitSha: null,
      path: null,
      blobSha: null,
    }),
  ];
}
