import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, copyFile, writeFile, symlink, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  loadRuntimeFixtures,
  RUNTIME_FIXTURE_PATH,
} from "../../../scripts/runtime-ai-fixtures.mjs";
import {
  runtimeEvaluationBindings,
  getRuntimeEvaluationCase,
} from "../../../src/lib/ai/runtime-evaluation-plan.ts";
import { validateGroundedOutput } from "../../../src/lib/prompts/grounding-v2.ts";
import { hash, semanticChecks } from "../../../scripts/eval-ai.mjs";
const fixtures = await loadRuntimeFixtures();
const baseline = JSON.parse(await readFile("evals/offline-baseline.v7.json", "utf8"));
test("eight current runtime cases match the actual scoped assembler, canonical hash and immutable authored sources", () => {
  assert.equal(fixtures.cases.length, 8);
  for (const c of fixtures.cases) {
    const fixed = getRuntimeEvaluationCase(c.id);
    assert.equal(fixed.assembled.system, c.system);
    assert.equal(fixed.assembled.user, c.user);
    assert.deepEqual(fixed.assembled.schema, c.schema);
    assert.equal(fixed.binding.contextSha256, c.budget_binding_sha256);
    assert.equal(fixed.binding.inputBytes, c.budget_input_bytes);
  }
  assert.equal(runtimeEvaluationBindings().cases.length, 8);
});
test("software baseline is hash-bound, strictly grounded and contains no fabricated model result", () => {
  assert.equal(baseline.fixture_sha256, fixtures.fixture_sha256);
  for (const c of fixtures.cases) {
    const fixed = getRuntimeEvaluationCase(c.id);
    const output = baseline.cases.find((row) => row.id === c.id).output;
    const validated = validateGroundedOutput(
      c.kind,
      output,
      fixed.packed.sources,
      fixed.packed.omissions,
    );
    assert.ok(validated.receipt);
    assert.deepEqual(semanticChecks(c, validated.draft), []);
  }
});
test("withdrawn edge sources remain excluded from runtime prompts", () => {
  const user = getRuntimeEvaluationCase("stage3-edge-v7").assembled.user;
  for (const marker of [
    "WITHDRAWN_PRIVATE_NOTE",
    "WITHDRAWN_PRIVATE_QUOTE",
    "WITHDRAWN_DERIVED_SUMMARY",
    "WITHDRAWN_CONTACT_SOURCE",
  ])
    assert.equal(user.includes(marker), false);
});
async function tree() {
  const root = await mkdtemp(join(tmpdir(), "first-ten-runtime-parity-"));
  for (const path of [RUNTIME_FIXTURE_PATH, ...Object.keys(fixtures.source_sha256)]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(path, join(root, path));
  }
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
  return root;
}
test("changed gateway, runtime policy or canonical binding invalidates the current source manifest", async () => {
  for (const path of [
    "src/lib/ai/gateway.server.ts",
    "src/lib/ai/runtime-evaluation.server.ts",
    "src/lib/ai/budget-binding.ts",
  ]) {
    const root = await tree();
    try {
      await writeFile(
        join(root, path),
        (await readFile(join(root, path), "utf8")) + "\n// unreviewed change\n",
      );
      await assert.rejects(loadRuntimeFixtures(root), /Production source changed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("refreshing only a changed prompt's hash cannot fake semantic parity", async () => {
  const root = await tree();
  try {
    const path = "src/lib/prompts/private-v1.ts";
    const changed = (await readFile(join(root, path), "utf8")).replace(
      "warm, practical coach",
      "unreviewed coach",
    );
    await writeFile(join(root, path), changed);
    const fixture = JSON.parse(await readFile(join(root, RUNTIME_FIXTURE_PATH), "utf8"));
    fixture.source_sha256[path] = hash(changed);
    await writeFile(join(root, RUNTIME_FIXTURE_PATH), JSON.stringify(fixture));
    await assert.rejects(loadRuntimeFixtures(root), /parity failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("tampered context, source omissions, schema and scope do not pass a refreshed fixture", async () => {
  let mutation = 0;
  for (const mutate of [
    (f) => f.cases[0].budget_input_bytes++,
    (f) => f.cases[0].selected_source_identities[0].consentRevision++,
    (f) => f.cases[0].packing_omissions.budget++,
    (f) => (f.cases[0].schema.properties.extra = { type: "string" }),
    (f) => (f.cases[2].permission_context.sources = []),
    (f) => delete f.source_sha256["src/lib/ai/runtime-evaluation.server.ts"],
  ]) {
    const root = await tree();
    try {
      const fixture = JSON.parse(await readFile(join(root, RUNTIME_FIXTURE_PATH), "utf8"));
      mutate(fixture);
      await writeFile(join(root, RUNTIME_FIXTURE_PATH), JSON.stringify(fixture));
      await assert.rejects(loadRuntimeFixtures(root), `Mutation ${mutation} was not rejected`);
    } finally {
      await rm(root, { recursive: true, force: true });
      mutation++;
    }
  }
});
