import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluationRepositoryRoot,
  assertPaidDatabaseUrl,
  runPaid,
  reviewedPlanBinding,
} from "../../../scripts/eval-ai-paid.mjs";

test("paid runner resolves real fixture files when the checkout path contains spaces and literal percent characters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "First Ten evaluation "));
  try {
    const checkout = join(directory, "Apps by Ian", "First 10 %20 café");
    await mkdir(join(checkout, "scripts"), { recursive: true });
    await mkdir(join(checkout, "evals"));
    const sentinel = "Synthetic fixture location, not evaluation results.";
    await writeFile(join(checkout, "evals", "fixture-location.txt"), sentinel);
    const moduleUrl = pathToFileURL(join(checkout, "scripts", "eval-ai-paid.mjs"));
    assert.ok(moduleUrl.href.includes("%20"));
    const resolvedRoot = evaluationRepositoryRoot(moduleUrl);
    assert.equal(resolvedRoot, checkout);
    assert.equal(
      await readFile(join(resolvedRoot, "evals", "fixture-location.txt"), "utf8"),
      sentinel,
    );
    // URL.pathname leaves encoded spaces in the real user's checkout and cannot read this file.
    await assert.rejects(
      readFile(join(new URL("..", moduleUrl).pathname, "evals", "fixture-location.txt")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("paid staging rejects disposable clone databases before any connector or credential use", () => {
  const original = "postgres://synthetic:synthetic@127.0.0.1:55322/postgres?sslmode=disable";
  assert.equal(assertPaidDatabaseUrl(original).pathname, "/postgres");
  for (const database of ["firstten_eval_v6_1234abcd", "other", "postgres/other"])
    assert.throws(() => assertPaidDatabaseUrl(original.replace("/postgres?", `/${database}?`)));
});

test("actual paid-run entry rejects a clone config before network, staging or runtime launch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "First Ten clone guard "));
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => {
    networkCalls++;
    throw new Error("No network permitted");
  };
  try {
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    const raw = await readFile(new URL("./fixtures.v6.json", import.meta.url));
    const fixtures = JSON.parse(raw);
    const runtimeFile = join(directory, "runtime.json");
    await writeFile(
      runtimeFile,
      JSON.stringify({
        database_url:
          "postgres://synthetic:synthetic@127.0.0.1:55322/firstten_eval_v6_1234abcd?sslmode=disable",
        SUPABASE_URL: "http://127.0.0.1:55321",
        SUPABASE_PUBLISHABLE_KEY: "synthetic",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic",
        OPENROUTER_API_KEY: "synthetic",
        access_token: "synthetic",
      }),
      { mode: 0o600 },
    );
    const plan = {
      version: "first-ten-bounded-evaluation-v6",
      fixture_sha256: digest(raw),
      source_sha256: fixtures.source_sha256,
      origin: "http://127.0.0.1:55890",
      reviewed_at: new Date().toISOString(),
      operator_reference: "synthetic-guard-test",
      maximum_calls: 8,
      cap_usd: 0.9,
      user_id: "fa030000-0000-4000-8000-000000000003",
      project_id: "fa030000-0000-4000-8000-000000000002",
      runner_sha256: digest(
        await readFile(new URL("../../../scripts/eval-ai-paid.mjs", import.meta.url)),
      ),
      staging_sha256: digest(
        await readFile(new URL("../../../evals/fixture-staging.v6.mjs", import.meta.url)),
      ),
      function_id: "syntheticfunctionid",
      transformed_sha256: "a".repeat(64),
      endpoint: null,
      endpoint_review_sha256: null,
      route_versions: null,
      response_provider: null,
      runtime_file: runtimeFile,
      output_directory: join(directory, "must-not-exist"),
    };
    plan.evaluation_plan_sha256 = reviewedPlanBinding(plan);
    const planFile = join(directory, "plan.json");
    await writeFile(planFile, JSON.stringify(plan), { mode: 0o600 });
    await assert.rejects(runPaid(planFile), /Bounded evaluation stopped/);
    assert.equal(networkCalls, 0);
    await assert.rejects(readFile(join(directory, "must-not-exist", "journal.jsonl")), {
      code: "ENOENT",
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
