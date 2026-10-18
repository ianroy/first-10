import { BlockList, isIP } from "node:net";
import { likelySecret } from "./contracts";
export class PublicRetrievalError extends Error {
  constructor(public readonly code = "UNSAFE_SOURCE") {
    super("Public source retrieval is unavailable. Continue manually.");
    this.name = "PublicRetrievalError";
  }
}
export function publicURL(raw: string): URL {
  if (
    raw.length > 2048 ||
    /[^\x21-\x7e]|[\\%]/.test(raw) ||
    likelySecret(raw) ||
    /%(?:2e|2f|5c|00|0a|0d)/i.test(raw)
  )
    throw new PublicRetrievalError();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicRetrievalError();
  }
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    host.endsWith(".") ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test|example|onion)$/.test(host) ||
    !host.split(".").every((s) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw.replace(/^https:\/\//, ""))
  )
    throw new PublicRetrievalError();
  return url;
}
const blocked4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(network, prefix, "ipv4");
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
const blocked6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked6.addSubnet(network, prefix, "ipv6");
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, "ipv4");
  // Exclude transition/mapped/private/reserved IPv6; conservative false negatives use manual paste.
  return (
    family === 6 &&
    global6.check(address, "ipv6") &&
    !blocked6.check(address, "ipv6") &&
    !blocked4.check(address, "ipv6")
  );
}
export function githubTarget(raw: string) {
  const url = publicURL(raw);
  const match = url.pathname.match(/^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100})\/?$/);
  if (url.hostname !== "github.com" || !match || match[2] === "." || match[2] === "..")
    throw new PublicRetrievalError();
  const repo = match[2]!.replace(/\.git$/, "");
  if (!repo || repo === "." || repo === "..") throw new PublicRetrievalError();
  return { owner: match[1]!, repo, url };
}
export function githubPath(path: string) {
  if (
    path.length > 200 ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(path) ||
    path.split("/").some((p) => p === "." || p === ".." || p.startsWith(".")) ||
    ["node_modules", "vendor", "dist", "build", "coverage"].includes(path.split("/")[0]!) ||
    !/\.(?:md|txt|json|tsx?|jsx?|css|html|ya?ml)$/i.test(path) ||
    /(?:^|\/)(?:package-lock|bun\.lock|yarn\.lock|pnpm-lock)/i.test(path)
  )
    throw new PublicRetrievalError();
  return path;
}
