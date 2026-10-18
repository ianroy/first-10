import { createHash } from "node:crypto";
import { parse } from "parse5";
import { PUBLIC_CONTEXT_LIMITS as L, remoteSourceSchema, type RemoteSource } from "./contracts";
import { PublicRetrievalError } from "./url-policy.server";
import { fetchPublic, freshDeadline, type PublicTransport } from "./fetch-public.server";
export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const forbiddenControl = (n: number) => (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
function decodeUTF8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PublicRetrievalError();
  }
}
/** Plain text and GitHub JSON/files retain whole-body control rejection. */
export function decodeText(bytes: Buffer): string {
  const value = decodeUTF8(bytes);
  if (Array.from(value).some((c) => forbiddenControl(c.charCodeAt(0))))
    throw new PublicRetrievalError();
  return value;
}
function boundedPreview(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) throw new PublicRetrievalError();
  if (Buffer.byteLength(clean) > L.previewBytes) throw new PublicRetrievalError("SOURCE_TOO_LARGE");
  return clean;
}
type TreeNode = {
  nodeName: string;
  value?: string;
  childNodes?: TreeNode[];
  sourceCodeLocation?: { startOffset: number; endOffset: number } | null;
};
export function staticHTMLText(html: string) {
  // Locations preserve evidence of literal NULs that HTML parsing would otherwise drop.
  const document = parse(html, { sourceCodeLocationInfo: true }) as unknown as TreeNode;
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
  const ignoredRanges: { startOffset: number; endOffset: number }[] = [];
  const stack: { node: TreeNode; depth: number; hidden: boolean }[] = [
    { node: document, depth: 0, hidden: false },
  ];
  let count = 0;
  while (stack.length) {
    const { node, depth, hidden } = stack.pop()!;
    if (++count > 15000 || depth > 128) throw new PublicRetrievalError();
    const omitted = hidden || ignored.has(node.nodeName);
    if (ignored.has(node.nodeName) && node.sourceCodeLocation)
      ignoredRanges.push(node.sourceCodeLocation);
    if (!omitted) {
      if (node.nodeName === "#text") {
        const value = node.value ?? "";
        if (Array.from(value).some((c) => forbiddenControl(c.charCodeAt(0))))
          throw new PublicRetrievalError();
        parts.push(value);
      }
      if (blocks.has(node.nodeName)) parts.push("\n");
    }
    for (let i = (node.childNodes?.length ?? 0) - 1; i >= 0; i--)
      stack.push({ node: node.childNodes![i]!, depth: depth + 1, hidden: omitted });
  }
  // Permit raw controls only inside a parser-confirmed omitted element. Never remove
  // controls with a markup regex: malformed tags and script end tags must follow HTML semantics.
  ignoredRanges.sort((a, b) => a.startOffset - b.startOffset);
  let rangeIndex = 0;
  let ignoredUntil = -1;
  for (let i = 0; i < html.length; i++) {
    while (rangeIndex < ignoredRanges.length && ignoredRanges[rangeIndex]!.startOffset <= i)
      ignoredUntil = Math.max(ignoredUntil, ignoredRanges[rangeIndex++]!.endOffset);
    if (forbiddenControl(html.charCodeAt(i)) && i >= ignoredUntil) throw new PublicRetrievalError();
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
  const html = contentType === "text/html";
  const decoded = html ? decodeUTF8(response.body) : decodeText(response.body);
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
