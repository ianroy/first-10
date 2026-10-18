/** Author NEW immutable v6 once. Historical v2-v5 inputs and reports are never overwritten. */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { assembleAIContextV2 } from "../../../src/lib/prompts/context-v2.ts";
import {
  derivePermissionFixtureV6,
  sourceCatalog,
  groundedFixtureOutput,
} from "./fixture-rpc-v6.mjs";
import {
  hash,
  contractHash,
  fixtureBudgetBinding,
  SOURCE_PATHS,
} from "../../../scripts/eval-ai.mjs";
const old = JSON.parse(await readFile("src/tests/ai-eval/fixtures.v5.json", "utf8"));
const baseline = JSON.parse(await readFile("evals/offline-baseline.v5.json", "utf8"));
const fixture = {
  ...old,
  version: "first-ten-existing-kinds-v6",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  source_sha256: {},
};
for (const path of SOURCE_PATHS) fixture.source_sha256[path] = hash(await readFile(path));
fixture.cases = old.cases.map((original) => {
  const c = { ...structuredClone(original), id: original.id.replace(/v5$/, "v6") };
  const permission_context = derivePermissionFixtureV6(c);
  const { contract, packed, assembled } = assembleAIContextV2(
    permission_context,
    permission_context.projectId,
    c.kind,
  );
  const next = {
    ...c,
    system: assembled.system,
    user: assembled.user,
    schema: assembled.schema,
    contract: {
      promptId: contract.promptId,
      promptVersion: contract.promptVersion,
      schemaId: contract.schemaId,
      schemaVersion: contract.schemaVersion,
    },
    contract_sha256: contractHash(contract),
    permission_context,
    selected_source_identities: packed.manifest("a".repeat(64)).sources,
    packing_omissions: packed.omissions,
    source_catalog: sourceCatalog(packed),
  };
  next.source_quotes = next.source_catalog.map((s) => s.quote);
  const binding = fixtureBudgetBinding(next);
  next.budget_binding_sha256 = binding.contextSha256;
  next.budget_input_bytes = binding.inputBytes;
  return next;
});
const raw = JSON.stringify(fixture, null, 2) + "\n";
await writeFile("src/tests/ai-eval/fixtures.v6.json", raw, { flag: "wx" });
// Preserve the existing negative test manipulations while replacing only source IDs.
const idMap = new Map(
  old.cases.flatMap((c, i) =>
    [c.permission_context.project, ...c.permission_context.sources].map((s) => [
      s.sourceId,
      [
        fixture.cases[i].permission_context.project,
        ...fixture.cases[i].permission_context.sources,
      ].find(
        (n) =>
          n.type === s.type &&
          (s.type === "project" || n.recordId.slice(-3) === s.recordId.slice(-3)),
      )?.sourceId,
    ]),
  ),
);
const remap = (value) =>
  typeof value === "string"
    ? (idMap.get(value) ?? value)
    : Array.isArray(value)
      ? value.map(remap)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]))
        : value;
const nextBaseline = {
  ...baseline,
  version: "first-ten-offline-baseline-v6",
  fixture_sha256: hash(raw),
  cases: baseline.cases.map((row) => {
    const c = fixture.cases.find((c) => c.id === row.id.replace(/v5$/, "v6"));
    return { ...row, id: c.id, output: groundedFixtureOutput(c, row.output.draft) };
  }),
  negative_cases: baseline.negative_cases.map((row) => ({
    ...row,
    caseId: row.caseId.replace(/v5$/, "v6"),
    output: remap(row.output),
  })),
};
await writeFile("evals/offline-baseline.v6.json", JSON.stringify(nextBaseline, null, 2) + "\n", {
  flag: "wx",
});
