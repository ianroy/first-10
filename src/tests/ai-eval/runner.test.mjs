import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm, mkdir, copyFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  loadFixtures,
  checkKeyBudget,
  checkEndpoint,
  semanticChecks,
  promotionGate,
  estimatedReservation,
  MODEL,
  OUTPUT_CAP,
  hash,
  checkReferences,
  runOfflineBaseline,
  summarizeReport,
  FIXTURE_PATH,
  assembleFixtureContext,
} from "../../../scripts/eval-ai.mjs";
const fixtures = await loadFixtures();
const baseline = JSON.parse(
  await readFile(new URL("../../../evals/offline-baseline.v6.json", import.meta.url), "utf8"),
);
const endpoint = {
  data: {
    id: MODEL,
    endpoints: [
      {
        tag: "google-vertex",
        service_tier: null,
        provider_name: "Google",
        supported_parameters: ["structured_outputs", "response_format", "max_tokens"],
        pricing: { prompt: "0.0000001", completion: "0.0000004" },
        max_completion_tokens: 65535,
      },
    ],
  },
};
const key = {
  limit: 0.9,
  limit_remaining: 0.9,
  limit_reset: null,
  include_byok_in_limit: true,
  is_management_key: false,
};
test("bundled cases cover current four-kind prompts, exact source fingerprints and bounded cost", () => {
  assert.equal(fixtures.cases.length, 8);
  assert.ok(fixtures.cases.every((c) => c.synthetic === true && c.review_focus.length));
  const reservation = fixtures.cases.reduce((sum, c) => sum + estimatedReservation(c), 0);
  assert.ok(reservation > 0 && reservation < 0.02);
});
test("default plan makes no network requests and never reads or prints the key", () => {
  const output = JSON.parse(
    execFileSync(process.execPath, ["scripts/eval-ai.mjs", "--plan"], {
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_EVAL_API_KEY: "synthetic-key-must-not-print" },
    }),
  );
  assert.equal(output.evaluation_performed, false);
  assert.equal(output.maximum_paid_calls, 8);
  assert.equal(JSON.stringify(output).includes("synthetic-key-must-not-print"), false);
});
test("key guard refuses unlimited, resetting, BYOK-excluding, insufficient or over-cap keys", () => {
  assert.equal(checkKeyBudget(key, 0.02).limit, 0.9);
  for (const patch of [
    { limit: null },
    { limit: 1 },
    { limit: Infinity },
    { limit_reset: "daily" },
    { include_byok_in_limit: false },
    { is_management_key: true },
    { limit_remaining: null },
    { limit_remaining: 0.001 },
  ])
    assert.throws(() => checkKeyBudget({ ...key, ...patch }, 0.02));
});
test("endpoint preflight fails closed on missing schema support, price increases and wrong tiers", () => {
  assert.equal(checkEndpoint(endpoint).tag, "google-vertex");
  for (const patch of [
    { supported_parameters: ["response_format"] },
    { pricing: { prompt: "0.000001", completion: "0.0000004" } },
    { pricing: {} },
    { max_completion_tokens: 100 },
    { service_tier: "priority" },
  ]) {
    const copy = structuredClone(endpoint);
    Object.assign(copy.data.endpoints[0], patch);
    assert.throws(() => checkEndpoint(copy));
  }
  assert.throws(() => checkEndpoint({ data: { id: MODEL, endpoints: [] } }));
});
test("sparse source checks reject fabricated or duplicated quotes instead of satisfying a forced count", () => {
  const c = fixtures.cases.find((c) => c.id === "synthesis-edge-v6");
  const data = { quotes: [c.source_quotes[0]], changes: [{}, {}, {}] };
  assert.deepEqual(semanticChecks(c, data), []);
  assert.ok(
    semanticChecks(c, { ...data, quotes: ["An invented quote"] }).includes("unmatched_quote"),
  );
  assert.ok(
    semanticChecks(c, { ...data, quotes: [c.source_quotes[0], c.source_quotes[0]] }).includes(
      "quote_count_or_duplicates",
    ),
  );
});
test("questions reject injected instructions and hypothetical willingness even in schema-valid arrays", () => {
  const c = fixtures.cases.find((c) => c.kind === "questions");
  const questions = Array.from({ length: 8 }, () => "What happened last time?").concat(
    "Who else should I talk to about this?",
  );
  assert.deepEqual(semanticChecks(c, { questions }), []);
  questions[0] = "Would you pay for EVAL_SOURCE_OVERRIDE?";
  assert.deepEqual(semanticChecks(c, { questions }), [
    "source_instruction_followed",
    "hypothetical_willingness",
  ]);
});
function passing() {
  const report = {
    execution_path: "generateAI",
    source_sha256: fixtures.source_sha256,
    origin: "http://127.0.0.1:55890",
    functionId: "syntheticfunctionid",
    transformedSha256: "a".repeat(64),
    version: fixtures.version,
    fixture_sha256: fixtures.fixture_sha256,
    endpoint: { provider: "Google", tag: "google-vertex", model: MODEL },
    results: fixtures.cases.map((c, index) => ({
      id: c.id,
      kind: c.kind,
      contract_sha256: c.contract_sha256,
      output: baseline.cases.find((r) => r.id === c.id).output,
      status: "complete",
      model: MODEL,
      provider: "Google",
      generation_id: `gen-synthetic-${c.id}`,
      operation_id: `fa630000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      attempt_id: `fa630001-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      origin_id: `fa630002-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      context_sha256: c.budget_binding_sha256,
      route_version: 1,
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.001 },
      issues: [],
      actual_calls: 1,
      cost_usd: 0.001,
      latency_ms: 1000,
      finish_reason: "stop",
    })),
  };
  const review = {
    fixture_sha256: fixtures.fixture_sha256,
    reviewer: "Test reviewer",
    reviewed_at: "2026-10-18T12:00:00.000Z",
    cases: fixtures.cases.map((c) => ({
      id: c.id,
      grounding: 4,
      clarity: 4,
      usefulness: 4,
      audience_and_questions: 4,
      no_fabrication: true,
      preserves_counterevidence: true,
      respects_permissions: true,
      reason: "Synthetic test fixture only.",
      output_sha256: hash(JSON.stringify(baseline.cases.find((r) => r.id === c.id).output)),
    })),
  };
  return { report, review };
}
test("promotion gate requires complete named human review and always leaves production unchanged", () => {
  const { report, review } = passing();
  assert.equal(promotionGate(report, null, fixtures).eligible_for_operator_review, false);
  const result = promotionGate(report, review, fixtures);
  assert.equal(result.eligible_for_operator_review, true);
  assert.equal(result.production_changed, false);
  review.cases[0].grounding = 3;
  assert.equal(promotionGate(report, review, fixtures).eligible_for_operator_review, false);
});
test("unknown spend, absent provider, duplicate cases, slow calls and changed prompt versions block review eligibility", () => {
  for (const mutate of [
    (r) => (r.results[0].cost_usd = null),
    (r) => (r.source_sha256 = {}),
    (r) => (r.origin = "https://unreviewed.invalid"),
    (r) => (r.results[0].operation_id = r.results[1].operation_id),
    (r) => (r.results[0].context_sha256 = "b".repeat(64)),
    (r) => (r.results[0].route_version = null),
    (r) => (r.results[0].usage.cost = 0),
    (r) => (r.results[0].provider = "Google AI Studio"),
    (r) => (r.results[0].latency_ms = 25001),
    (r) => (r.results[0].latency_ms = -1),
    (r) => (r.results[0].generation_id = r.results[1].generation_id),
    (r) => (r.results[0].contract_sha256 = "stale"),
    (r) => (r.results[0].finish_reason = "length"),
    (r) => (r.endpoint.tag = "google-ai-studio"),
    (r) => (r.results[0].actual_calls = 2),
    (r) => (r.results[0].output = {}),
    (r) => (r.results[0].id = r.results[1].id),
    (r) => (r.fixture_sha256 = "changed"),
  ]) {
    const { report, review } = passing();
    mutate(report);
    assert.equal(promotionGate(report, review, fixtures).eligible_for_operator_review, false);
  }
});
test("evaluation fixtures contain no production project IDs or destinations", async () => {
  const raw = await readFile(new URL("./fixtures.v6.json", import.meta.url), "utf8");
  assert.equal(/https?:\/\//.test(raw), false);
  assert.equal(/sk-or-v1-|service_role|SUPABASE_SERVICE_ROLE_KEY/.test(raw), false);
});

test("paid execution is disabled regardless of environment or supplied output path", () => {
  assert.throws(() =>
    execFileSync(
      process.execPath,
      ["scripts/eval-ai.mjs", "--run", "--out", "/tmp/should-not-create-eval"],
      { stdio: "pipe", env: { ...process.env, OPENROUTER_EVAL_API_KEY: "synthetic-never-used" } },
    ),
  );
});

test("offline export stays not-run and CLI scoring independently rejects tampered schema-pass claims", async () => {
  const parent = await mkdtemp(join(tmpdir(), "first-ten-eval-test-"));
  try {
    const dir = join(parent, "packet");
    execFileSync(process.execPath, ["scripts/eval-ai.mjs", "--export", "--out", dir], {
      stdio: "pipe",
    });
    const file = join(dir, "results.json");
    const blank = JSON.parse(await readFile(file, "utf8"));
    assert.equal(blank.execution_path, "not_run");
    assert.ok(
      blank.results.every(
        (r) => r.status === "not_run" && r.cost_usd === null && r.actual_calls === 0,
      ),
    );
    const { report, review } = passing();
    for (const result of report.results) result.output = {};
    await writeFile(file, JSON.stringify(report));
    await writeFile(join(dir, "review.json"), JSON.stringify(review));
    let scored;
    try {
      execFileSync(
        process.execPath,
        ["scripts/eval-ai.mjs", "--score", file, "--review", join(dir, "review.json")],
        { stdio: "pipe" },
      );
    } catch (error) {
      scored = JSON.parse(error.stdout.toString());
    }
    assert.equal(scored.eligible_for_operator_review, false);
    assert.ok(scored.blockers.some((b) => b.includes("technical/spend")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("review is bound to each exact output and a real ISO date", () => {
  for (const mutate of [
    (_r, v) => (v.reviewed_at = "not-a-date"),
    (_r, v) => (v.reviewed_at = "2026-02-30T12:00:00.000Z"),
    (_r, v) => (v.cases[0].output_sha256 = "old-output"),
    (r) => (r.results[0].output.draft.questions[0] = "What happened in your previous meeting?"),
  ]) {
    const { report, review } = passing();
    // Each call gets independent outputs; fixture baseline must remain immutable.
    const copiedReport = structuredClone(report);
    mutate(copiedReport, review);
    assert.equal(promotionGate(copiedReport, review, fixtures).eligible_for_operator_review, false);
  }
});
test("malformed run envelopes fail closed, and edited issue arrays cannot fake output quality", () => {
  for (const results of [null, {}, [null], []]) {
    const { report, review } = passing();
    report.results = results;
    assert.equal(promotionGate(report, review, fixtures).eligible_for_operator_review, false);
  }
  const { report, review } = passing();
  report.results[0].output = { questions: ["Would you pay for this?"] };
  report.results[0].issues = [];
  assert.equal(promotionGate(report, review, fixtures).eligible_for_operator_review, false);
});
test("reference checker rejects foreign ids and mismatched quotes in current v2 wrapper outputs", async () => {
  const c = fixtures.cases.find((c) => c.kind === "synthesis");
  const source = c.source_catalog[0];
  assert.deepEqual(checkReferences(c, [{ sourceId: source.id, quote: source.quote }]), []);
  assert.deepEqual(checkReferences(c, [{ sourceId: "not-supplied", quote: source.quote }]), [
    "unknown_source_id",
  ]);
  assert.deepEqual(checkReferences(c, [{ sourceId: source.id, quote: "Fabricated quote" }]), [
    "source_quote_mismatch",
  ]);
  assert.deepEqual(checkReferences(c, [{ sourceId: source.id }]), ["invalid_reference"]);
  assert.deepEqual(checkReferences(c, null), ["invalid_references"]);
  const result = await runOfflineBaseline(fixtures);
  assert.equal(result.all_expectations_passed, true);
  assert.equal(result.model_evaluated, false);
  assert.equal(result.paid_calls, 0);
  assert.ok(
    result.summary.every(
      (s) =>
        s.reference_integrity === "validated_v2_source_references" &&
        s.human_passed === 0 &&
        s.cost_usd === null &&
        s.p95_latency_ms === null,
    ),
  );
});
test("per-kind summaries distinguish software checks, reviewed outputs, known spend and p95", () => {
  const { report, review } = passing();
  report.results[0].latency_ms = 100;
  report.results[1].latency_ms = 250;
  const summary = summarizeReport(report, fixtures, review);
  assert.equal(summary[0].p95_latency_ms, 250);
  assert.equal(summary[0].cost_usd, 0.002);
  assert.equal(summary[0].deterministic_passed, 2);
  assert.equal(summary[0].human_passed, 2);
  report.results[0].cost_usd = null;
  assert.equal(summarizeReport(report, fixtures, review)[0].cost_usd, null);
  review.reviewed_at = "not-a-date";
  assert.equal(summarizeReport(report, fixtures, review)[0].human_passed, 0);
  assert.equal(summarizeReport(report, fixtures, review)[0].human_pass_rate, null);
});
test("key and endpoint guards reject unknown ceilings and invalid reservations", () => {
  for (const reservation of [NaN, Infinity, -1, 0, 1])
    assert.throws(() => checkKeyBudget(key, reservation));
  assert.throws(() => checkKeyBudget({ ...key, limit: 0.01, limit_remaining: 0.9 }, 0.001));
  for (const cap of [undefined, null, NaN, -1]) {
    const copy = structuredClone(endpoint);
    copy.data.endpoints[0].max_completion_tokens = cap;
    assert.throws(() => checkEndpoint(copy));
  }
});
async function fixtureTree() {
  const dir = await mkdtemp(join(tmpdir(), "first-ten-eval-bindings-"));
  for (const path of [FIXTURE_PATH, ...Object.keys(fixtures.source_sha256)]) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await copyFile(path, join(dir, path));
  }
  await symlink(join(process.cwd(), "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}
test("v6 binds prompt content and identity even if someone refreshes only file hashes", async () => {
  const dir = await fixtureTree();
  try {
    const path = "src/lib/prompts/private-v1.ts";
    const changed = (await readFile(join(dir, path), "utf8")).replace(
      "warm, practical coach",
      "different, unreviewed coach",
    );
    await writeFile(join(dir, path), changed);
    const fixture = JSON.parse(await readFile(join(dir, FIXTURE_PATH), "utf8"));
    fixture.source_sha256[path] = hash(changed);
    await writeFile(join(dir, FIXTURE_PATH), JSON.stringify(fixture));
    await assert.rejects(loadFixtures(dir), /parity failed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("v6 refuses missing prompt pins, wrong versions, changed schema, forged quote catalog or changed evidence", async () => {
  let mutationIndex = 0;
  for (const mutate of [
    (f) => delete f.source_sha256["src/lib/prompts/private-v1.ts"],
    (f) => delete f.source_sha256["src/lib/prompts/private-v2.ts"],
    (f) => delete f.source_sha256["src/lib/prompts/context-v2.ts"],
    (f) => delete f.source_sha256["supabase/migrations/20261018017000_ai_context_sources.sql"],
    (f) => f.cases[0].selected_source_identities[0].consentRevision++,
    (f) => f.cases[0].packing_omissions.budget++,
    (f) => (f.source_commit = "unverified"),
    (f) => f.cases[0].contract.promptVersion++,
    (f) => (f.cases[0].budget_binding_sha256 = "0".repeat(64)),
    (f) => f.cases[0].budget_input_bytes++,
    (f) => delete f.source_sha256["src/lib/ai/budget.server.ts"],
    (f) => delete f.source_sha256["supabase/migrations/20261018014000_ai_usage_budget.sql"],
    (f) => (f.cases[0].schema.properties.extra = { type: "string" }),
    (f) => (f.cases[2].source_catalog[0].quote = "Not supplied"),
    (f) => (f.cases[7].permission_context.sources = [{ type: "interview", content: "private" }]),
    (f) => (f.cases[7].permission_context.omissions.permission = 0),
    (f) => delete f.source_sha256["supabase/migrations/20261018011000_processing_consent.sql"],
    (f) => {
      f.cases[2].input.interviews[1].answers[0].note += "x".repeat(100);
      f.cases[2].user = assembleFixtureContext(f.cases[2]);
    },
  ]) {
    const dir = await fixtureTree();
    try {
      const f = JSON.parse(await readFile(join(dir, FIXTURE_PATH), "utf8"));
      mutate(f);
      await writeFile(join(dir, FIXTURE_PATH), JSON.stringify(f));
      await assert.rejects(loadFixtures(dir), `Mutation ${mutationIndex} must be rejected`);
    } finally {
      mutationIndex++;
      await rm(dir, { recursive: true, force: true });
    }
  }
  assert.ok(fixtures.cases.some((c) => c.user.length > 14000));
});
test("offline plan and baseline run with network and secret access actively disabled", () => {
  const preload = `import http from 'node:http';import https from 'node:https';const deny=()=>{throw new Error('NETWORK_FORBIDDEN')};globalThis.fetch=deny;http.request=deny;https.request=deny;http.get=deny;https.get=deny;process.env=new Proxy(process.env,{get(t,k){if(typeof k==='string'&&/OPENROUTER|SUPABASE.*KEY/.test(k))throw new Error('SECRET_ACCESS_FORBIDDEN');return Reflect.get(t,k)}});`;
  for (const option of ["--plan", "--baseline"]) {
    const output = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          `data:text/javascript,${encodeURIComponent(preload)}`,
          "scripts/eval-ai.mjs",
          option,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(output.production_changed ?? false, false);
    assert.equal(output.evaluation_performed ?? output.model_evaluated, false);
  }
});
