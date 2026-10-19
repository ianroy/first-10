// Author the new closed-runtime software baseline once; never edits historical artifacts.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { assembleAIContextV2 } from "../../../src/lib/prompts/context-v2.ts";
import { budgetInputBinding } from "../../../src/lib/ai/budget-binding.ts";
import { runtimeEvaluationBindings } from "../../../src/lib/ai/runtime-evaluation-plan.ts";
import { RUNTIME_SOURCE_PATHS } from "../../../scripts/runtime-ai-fixtures.mjs";
import { hash } from "../../../scripts/eval-ai.mjs";
const original = JSON.parse(await readFile("src/tests/ai-eval/fixtures.v6.json", "utf8"));
const baseline = JSON.parse(await readFile("evals/offline-baseline.v6.json", "utf8"));
const fixture = {
  ...original,
  version: "first-ten-existing-kinds-v7",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  source_sha256: {},
};
fixture.cases = original.cases.map((c) => {
  const { assembled } = assembleAIContextV2(
    c.permission_context,
    c.permission_context.projectId,
    c.kind,
  );
  if (
    c.system !== assembled.system ||
    c.user !== assembled.user ||
    !isDeepStrictEqual(c.schema, assembled.schema)
  )
    throw new Error(
      "Prompt semantics changed; author new cases and reviewed baselines instead of refreshing hashes.",
    );
  const binding = budgetInputBinding(assembled);
  if (
    binding.contextSha256 !== c.budget_binding_sha256 ||
    binding.inputBytes !== c.budget_input_bytes
  )
    throw new Error("Canonical context binding changed.");
  const id = c.id.replace(/v6$/, "v7");
  const runtime = runtimeEvaluationBindings().cases.find((row) => row.id === id);
  if (runtime?.contextSha256 !== binding.contextSha256 || runtime.inputBytes !== binding.inputBytes)
    throw new Error("Authored runtime fixture differs from permission-scoped replay.");
  return { ...c, id };
});
for (const path of RUNTIME_SOURCE_PATHS) fixture.source_sha256[path] = hash(await readFile(path));
const raw = JSON.stringify(fixture, null, 2) + "\n";
await writeFile("src/tests/ai-eval/fixtures.v7.json", raw, { flag: "wx" });
await writeFile(
  "evals/offline-baseline.v7.json",
  JSON.stringify(
    {
      ...baseline,
      version: "first-ten-offline-baseline-v7",
      fixture_sha256: hash(raw),
      cases: baseline.cases.map((c) => ({ ...c, id: c.id.replace(/v6$/, "v7") })),
      negative_cases: baseline.negative_cases.map((c) => ({
        ...c,
        caseId: c.caseId.replace(/v6$/, "v7"),
      })),
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
