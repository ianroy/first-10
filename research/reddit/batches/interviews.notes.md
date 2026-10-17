# interviews batch notes

STATUS: 0 rows. No Reddit threads could be retrieved or verified, so none were logged (no invented URLs).

- WebFetch refused reddit.com and old.reddit.com ("unable to fetch"); .json search endpoint also refused.
- WebSearch with site:reddit.com returned zero Reddit results across 4 query variants; allowed_domains=["reddit.com"] is rejected by the search API (crawler-blocked domain).
- Only non-Reddit secondary sources surfaced (blogs, HN item 28667439, Product Talk, vendor guides); not coded since task is Reddit-only.
- New tags added: none.
- Next step: have the user supply Reddit URLs/exports (or paste threads), or run from a session with direct browser access (Chrome tools) to read threads.
