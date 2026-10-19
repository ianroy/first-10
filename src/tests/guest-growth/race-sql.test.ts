import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

const raceSource = readFileSync("src/tests/guest-growth/races.mjs", "utf8");
const sqlTags = new Set(["admin", "a", "b", "s", "c"]);
function boundaries(source: string) {
  const ast = ts.createSourceFile(
    "race.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const parameters: { before: string; after: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node) && sqlTags.has(node.tag.getText(ast))) {
      if (ts.isTemplateExpression(node.template)) {
        let before = node.template.head.text;
        for (const span of node.template.templateSpans) {
          parameters.push({ before, after: span.literal.text });
          before = span.literal.text;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return parameters;
}
const touchesIdentifier = ({ before, after }: { before: string; after: string }) =>
  /[a-z0-9_$]$/i.test(before) || /^[a-z0-9_$]/i.test(after);

it("keeps every tagged race SQL parameter separate from SQL identifiers and keywords", () => {
  const parameters = boundaries(raceSource);
  expect(parameters.length).toBeGreaterThan(60);
  expect(parameters.filter(touchesIdentifier)).toEqual([]);
  // Negative controls reproduce driver placeholders such as $1AND and $1FOR.
  expect(
    boundaries("admin`SELECT 1 WHERE id=${id}AND revision=${revision}FOR UPDATE`").filter(
      touchesIdentifier,
    ),
  ).toHaveLength(2);
});
