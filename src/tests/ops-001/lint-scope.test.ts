import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("verification lint scope", () => {
  const eslint = new ESLint();

  it("ignores generated build output regardless of whether a build has run", async () => {
    for (const path of [
      ".vercel/output/functions/__server.func/index.mjs",
      ".vercel/output/static/assets/client.js",
      ".output/server/index.mjs",
      ".vinxi/build/client.js",
      "dist/assets/client.js",
    ]) {
      expect(await eslint.isPathIgnored(path), path).toBe(true);
    }
  });

  it("continues checking application and roadmap sources", async () => {
    for (const path of [
      "src/lib/data.ts",
      "src/routes/index.tsx",
      "scripts/roadmap.mjs",
      "scripts/roadmap.test.mjs",
    ]) {
      expect(await eslint.isPathIgnored(path), path).toBe(false);
    }
  });
});
