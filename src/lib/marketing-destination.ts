import { isPublicMarketingUrl } from "./marketing-plan";
export function buildMarketingDestination(input: {
  url: string;
  source: string;
  medium: string;
  campaign: string;
}): { ok: true; url: string; removed: string[] } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (
    !input.url.trim() ||
    input.url.length > 2048 ||
    Array.from(input.url.trim()).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === "\\",
    ) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(input.url) ||
    !/^https?:\/\//i.test(input.url.trim())
  )
    return bad(
      "Enter an explicit public http or https destination URL without spaces or control characters.",
    );
  for (const label of [input.source, input.medium, input.campaign])
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(label))
      return bad(
        "Use 1–80 lowercase letters, numbers, hyphens or underscores for each tag. Never include a person's name or email.",
      );
  try {
    const url = new URL(input.url.trim());
    const removed: string[] = [];
    if (url.username || url.password) removed.push("embedded credentials");
    if (url.search) removed.push("all existing query parameters");
    if (url.hash) removed.push("fragment");
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    if (!isPublicMarketingUrl(url.href))
      return bad("Use a public web destination, not a local or private address.");
    url.searchParams.set("utm_source", input.source);
    url.searchParams.set("utm_medium", input.medium);
    url.searchParams.set("utm_campaign", input.campaign);
    if (url.href.length > 2048) return bad("The tagged URL is too long.");
    return { ok: true, url: url.href, removed };
  } catch {
    return bad("Enter a valid public web destination URL.");
  }
}
