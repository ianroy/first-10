import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadFixtures,
  checkKeyBudget,
  checkEndpoint,
  semanticChecks,
  promotionGate,
  estimatedReservation,
  MODEL,
  OUTPUT_CAP,
} from "../../../scripts/eval-ai.mjs";
const fixtures = await loadFixtures();
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
  const c = fixtures.cases.find((c) => c.id === "synthesis-edge-v1");
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
    version: fixtures.version,
    fixture_sha256: fixtures.fixture_sha256,
    endpoint: { provider: "Google" },
    results: fixtures.cases.map((c) => ({
      id: c.id,
      status: "complete",
      model: MODEL,
      provider: "Google",
      generation_id: "synthetic-generation",
      issues: [],
      actual_calls: 1,
      cost_usd: 0.001,
      latency_ms: 1000,
    })),
  };
  const review = {
    fixture_sha256: fixtures.fixture_sha256,
    reviewer: "Test reviewer",
    reviewed_at: "2026-10-18",
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
    (r) => (r.results[0].provider = "Google AI Studio"),
    (r) => (r.results[0].latency_ms = 25001),
    (r) => (r.results[0].actual_calls = 2),
    (r) => (r.results[0].issues = ["unmatched_quote"]),
    (r) => (r.results[0].id = r.results[1].id),
    (r) => (r.fixture_sha256 = "changed"),
  ]) {
    const { report, review } = passing();
    mutate(report);
    assert.equal(promotionGate(report, review, fixtures).eligible_for_operator_review, false);
  }
});
test("evaluation fixtures contain no production project IDs or destinations", async () => {
  const raw = await readFile(new URL("./fixtures.v1.json", import.meta.url), "utf8");
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
