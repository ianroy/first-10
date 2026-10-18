import { expect, it } from "vitest";
import { buildMarketingDestination } from "./marketing-destination";
const tags = { source: "campus-club", medium: "flyer", campaign: "week-one" };
it("keeps the entered host/path while stripping credentials, all query data and fragments", () => {
  const result = buildMarketingDestination({
    url: "https://user:secret@example.edu/study?email=private@example.com&redirect=https://evil.test&utm_source=old#token",
    ...tags,
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    const url = new URL(result.url);
    expect(url.host).toBe("example.edu");
    expect(url.pathname).toBe("/study");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.hash).toBe("");
    expect([...url.searchParams.keys()]).toEqual(["utm_source", "utm_medium", "utm_campaign"]);
    expect(result.url).not.toMatch(/secret|private|evil|token/);
    expect(result.removed).toHaveLength(3);
  }
});
it.each([
  "",
  "example.edu",
  "//example.edu",
  "javascript:alert(1)",
  "data:text/html,hi",
  "https://localhost/x",
  "http://127.1",
  "http://2130706433",
  "http://10.2.3.4",
  "https://[::1]/",
  "https://host.internal",
  "https://example.edu\\@evil.test",
  "https://example.edu/%0aheader",
])("rejects unsafe or ambiguous destination %s", (url) =>
  expect(buildMarketingDestination({ url, ...tags }).ok).toBe(false),
);
it.each(["person@example.edu", "name space", "../foo", "<script>", "", "a".repeat(81)])(
  "rejects unsafe or unbounded tag %s",
  (source) =>
    expect(buildMarketingDestination({ url: "https://example.edu/", ...tags, source }).ok).toBe(
      false,
    ),
);
