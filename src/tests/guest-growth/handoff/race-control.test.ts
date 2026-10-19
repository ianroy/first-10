import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
// @ts-expect-error source-only Node harness has no browser declarations
import { observeRaceFailure } from "./races.mjs";
it("observes early rejection during lock polling while retaining failure and cleanup", async () => {
  const failure = Error("Injected overlap RPC failure");
  let cleaned = false;
  const run = async () => {
    try {
      const pending = observeRaceFailure(Promise.reject(failure));
      await new Promise((r) => setTimeout(r, 5));
      await pending;
    } finally {
      cleaned = true;
    }
  };
  await expect(run()).rejects.toBe(failure);
  expect(cleaned).toBe(true);
});
it("separates every parameter from SQL identifier tokens in all race queries", () => {
  const src = readFileSync("src/tests/guest-growth/handoff/races.mjs", "utf8"),
    ast = ts.createSourceFile("races.mjs", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS),
    bad: string[] = [];
  let count = 0;
  const visit = (n: ts.Node) => {
    if (
      ts.isTaggedTemplateExpression(n) &&
      ["a", "b", "admin", "s", "c"].includes(n.tag.getText(ast)) &&
      ts.isTemplateExpression(n.template)
    ) {
      let before = n.template.head.text;
      for (const span of n.template.templateSpans) {
        count++;
        if (/[a-z0-9_$]$/i.test(before) || /^[a-z0-9_$]/i.test(span.literal.text))
          bad.push(before + "<parameter>" + span.literal.text);
        before = span.literal.text;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(ast);
  expect(count).toBeGreaterThan(50);
  expect(bad).toEqual([]);
});
