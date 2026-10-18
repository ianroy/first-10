import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { assembleAIContextV2 } = await import(root + "/src/lib/prompts/context-v2.ts");
const { derivePermissionFixtureV5, sourceCatalog, groundedFixtureOutput } = await import(
  root + "/src/tests/ai-eval/fixture-rpc-v5.mjs"
);
const { hash, contractHash, fixtureBudgetBinding, SOURCE_PATHS } = await import(
  root + "/scripts/eval-ai.mjs"
);
const old = JSON.parse(await readFile(root + "/src/tests/ai-eval/fixtures.v4.json", "utf8"));
const baseline = JSON.parse(await readFile(root + "/evals/offline-baseline.v4.json", "utf8"));
const fixture = {
  ...old,
  version: "first-ten-existing-kinds-v5",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source_sha256: {},
};
for (const path of SOURCE_PATHS)
  fixture.source_sha256[path] = hash(await readFile(root + "/" + path));
fixture.cases = old.cases.map((original) => {
  const c = structuredClone(original);
  if (c.id === "synthesis-typical-v4")
    c.input.interviews.push({
      answers: [
        {
          q: "What does this long log tell us?",
          note: "Fictional repeated detail; not independent evidence. ".repeat(215),
          quote: "This long log is still only one unverified record.",
        },
      ],
      tags: [],
    });
  const permission_context = derivePermissionFixtureV5(c);
  const { contract, packed, assembled } = assembleAIContextV2(
    permission_context,
    permission_context.projectId,
    c.kind,
  );
  const next = {
    ...c,
    id: c.id.replace(/v4$/, "v5"),
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
  next.review_focus = [
    ...c.review_focus,
    "V2 complete-record context, source reference integrity, owner-reported authenticity and explicit omitted-source limits.",
  ];
  return next;
});
const text = JSON.stringify(fixture, null, 2) + "\n";
await writeFile(root + "/src/tests/ai-eval/fixtures.v5.json", text, { flag: "wx" });
const nextBaseline = {
  ...baseline,
  version: "first-ten-offline-baseline-v5",
  fixture_sha256: hash(text),
  reference_capability: "validated_v2_source_references",
  cases: baseline.cases.map((row) => {
    const c = fixture.cases.find((c) => c.id === row.id.replace(/v4$/, "v5"));
    const draft = structuredClone(row.output);
    if (c.kind === "synthesis") draft.quotes = c.source_quotes.slice(0, 6);
    return { ...row, id: c.id, output: groundedFixtureOutput(c, draft) };
  }),
  negative_cases: baseline.negative_cases.map((row) => {
    const c = fixture.cases.find((c) => c.id === row.caseId.replace(/v4$/, "v5"));
    const output = groundedFixtureOutput(c, row.output);
    const groundingFailure = ["unmatched_quote", "quote_count_or_duplicates"].some((issue) =>
      row.expectedIssues.includes(issue),
    );
    return {
      ...row,
      caseId: c.id,
      output,
      expectedIssues: groundingFailure ? ["output_schema_failed"] : row.expectedIssues,
    };
  }),
};
// Explicit new failure cases exercise the actual reference-bearing contract.
const synthesis = fixture.cases.find((c) => c.id === "synthesis-typical-v5");
const first = nextBaseline.cases.find((c) => c.id === synthesis.id);
const forged = structuredClone(first.output);
forged.grounding.observations[0].sourceId = "src_" + "f".repeat(64);
const hidden = structuredClone(nextBaseline.cases.find((c) => c.id === "stage3-edge-v5").output);
hidden.grounding.missingEvidence = hidden.grounding.missingEvidence.filter(
  (m) => m.reason !== "omitted_sources",
);
nextBaseline.negative_cases.push(
  {
    id: "unknown-source-id",
    caseId: synthesis.id,
    output: forged,
    expectedIssues: ["output_schema_failed"],
  },
  {
    id: "hidden-withheld-evidence",
    caseId: "stage3-edge-v5",
    output: hidden,
    expectedIssues: ["output_schema_failed"],
  },
);
await writeFile(
  root + "/evals/offline-baseline.v5.json",
  JSON.stringify(nextBaseline, null, 2) + "\n",
  { flag: "wx" },
);
