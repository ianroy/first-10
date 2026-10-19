#!/usr/bin/env node
// Offline only. Every actual AI call must use the existing authenticated generateAI function.
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { evaluationReceiptSchema } from "../src/lib/ai/evaluation-contract.ts";
import { assembleAIContextV2 } from "../src/lib/prompts/context-v2.ts";
import { validateGroundedOutput } from "../src/lib/prompts/grounding-v2.ts";
import { derivePermissionFixtureV6, sourceCatalog } from "../src/tests/ai-eval/fixture-rpc-v6.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MODEL = "google/gemini-2.5-flash-lite";
export const PROVIDER = "google-vertex";
export const CAP_USD = 0.9;
export const OUTPUT_CAP = 2500;
export const MAX_CALLS = 8;
const KINDS = ["questions", "synthesis", "stage2", "stage3"];
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const FIXTURE_PATH = "src/tests/ai-eval/fixtures.v6.json";
export const SOURCE_PATHS = [
  "src/lib/ai.functions.ts",
  "src/lib/ai/contracts.ts",
  "src/lib/ai/gateway.server.ts",
  "src/lib/ai/evaluation.server.ts",
  "src/lib/ai/evaluation-contract.ts",
  "src/lib/prompts/private-v1.ts",
  "src/lib/consent.ts",
  "supabase/migrations/20261018011000_processing_consent.sql",
  "src/lib/ai/budget.server.ts",
  "src/lib/ai/budget-contract.ts",
  "supabase/migrations/20261018014000_ai_usage_budget.sql",
  "src/hooks/useAIIntent.ts",
  "src/lib/ai/context.server.ts",
  "src/lib/prompts/context-v2.ts",
  "src/lib/prompts/grounding-v2.ts",
  "src/lib/prompts/private-v2.ts",
  "src/lib/prompts/provenance.server.ts",
  "supabase/migrations/20261018017000_ai_context_sources.sql",
];
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isoDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const label = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 200 &&
  !/[\x00-\x1f\x7f]/.test(value);
export const contractHash = (contract) => hash(JSON.stringify(contract));
const canonicalJson = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonicalJson).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
export function fixtureBudgetBinding(c) {
  const serialized = canonicalJson({
    system: c.system,
    user: c.user,
    schema: c.schema,
    ...c.contract,
  });
  return { contextSha256: hash(serialized), inputBytes: Buffer.byteLength(serialized, "utf8") };
}
export function assembleFixtureContext(c) {
  return assembleAIContextV2(c.permission_context, c.permission_context.projectId, c.kind).assembled
    .user;
}
export const derivePermissionFixture = derivePermissionFixtureV6;
export async function loadFixtures(root = ROOT) {
  return loadVersionedFixtures(root, {
    path: FIXTURE_PATH,
    version: "first-ten-existing-kinds-v6",
    sourcePaths: SOURCE_PATHS,
  });
}
// Offline parity reuse only. Historical v6 dispatch/key/origin guards stay unchanged.
export async function loadVersionedFixtures(root, manifest) {
  const raw = await readFile(resolve(root, manifest.path), "utf8");
  const fixture = JSON.parse(raw);
  if (
    !plain(fixture) ||
    fixture.version !== manifest.version ||
    typeof fixture.source_commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(fixture.source_commit) ||
    !Array.isArray(fixture.cases) ||
    !plain(fixture.source_sha256) ||
    !isDeepStrictEqual(Object.keys(fixture.source_sha256).sort(), [...manifest.sourcePaths].sort())
  )
    throw new Error("A complete versioned fixture and exact source manifest are required.");
  for (const [path, expected] of Object.entries(fixture.source_sha256))
    if (hash(await readFile(resolve(root, path))) !== expected)
      throw new Error(
        `Production source changed: ${path}. Review and version fixtures before running.`,
      );
  const { assembleAIContextV2: actualAssemble } = await import(
    pathToFileURL(resolve(root, "src/lib/prompts/context-v2.ts")).href +
      `?sha=${fixture.source_sha256["src/lib/prompts/context-v2.ts"]}`
  );
  if (
    fixture.cases.length !== MAX_CALLS ||
    new Set(fixture.cases.map((c) => c.id)).size !== MAX_CALLS
  )
    throw new Error("Expected eight distinct versioned cases.");
  for (const kind of KINDS)
    if (fixture.cases.filter((c) => c.kind === kind).length !== 2)
      throw new Error("Every existing AI kind needs typical and edge coverage.");
  for (const c of fixture.cases) {
    if (
      c.synthetic !== true ||
      !KINDS.includes(c.kind) ||
      !label(c.id) ||
      typeof c.system !== "string" ||
      typeof c.user !== "string" ||
      !plain(c.input) ||
      !plain(c.input.project) ||
      !["name", "description", "audience", "problem"].every(
        (k) => typeof c.input.project[k] === "string",
      ) ||
      ![
        c.input.interviews,
        c.input.learnings,
        c.input.contacts,
        c.source_catalog,
        c.source_quotes,
        c.unsupported_assertions,
      ].every(Array.isArray)
    )
      throw new Error("Only complete bundled synthetic fixtures are allowed.");
    if (
      !plain(c.withheld_records) ||
      !["interviews", "learnings", "contacts"].every(
        (key) =>
          Array.isArray(c.withheld_records[key]) &&
          new Set(c.withheld_records[key]).size === c.withheld_records[key].length &&
          c.withheld_records[key].every(
            (i) => Number.isInteger(i) && i >= 0 && i < c.input[key].length,
          ),
      )
    )
      throw new Error("Explicit valid synthetic permission exclusions are required.");
    if (!isDeepStrictEqual(c.permission_context, derivePermissionFixture(c)))
      throw new Error("Permission-scoped fixture projection mismatch.");
    const { contract, packed, assembled } = actualAssemble(
      c.permission_context,
      c.permission_context.projectId,
      c.kind,
    );
    if (
      !isDeepStrictEqual(c.selected_source_identities, packed.manifest("a".repeat(64)).sources) ||
      !isDeepStrictEqual(c.packing_omissions, packed.omissions)
    )
      throw new Error("Selected source/permission version or omission parity failed.");
    const identity = {
      promptId: contract.promptId,
      promptVersion: contract.promptVersion,
      schemaId: contract.schemaId,
      schemaVersion: contract.schemaVersion,
    };
    if (
      !isDeepStrictEqual(c.contract, identity) ||
      c.contract_sha256 !== contractHash(contract) ||
      c.system !== contract.system ||
      !isDeepStrictEqual(c.schema, contract.schema) ||
      c.user !== assembled.user
    )
      throw new Error(
        "Prompt/schema/context parity failed; version the fixture rather than updating hashes alone.",
      );
    const binding = fixtureBudgetBinding(c);
    if (
      c.budget_binding_sha256 !== binding.contextSha256 ||
      c.budget_input_bytes !== binding.inputBytes
    )
      throw new Error("Exact canonical budget input binding mismatch.");
    if (
      !isDeepStrictEqual(c.source_catalog, sourceCatalog(packed)) ||
      !isDeepStrictEqual(
        c.source_quotes,
        c.source_catalog.map((s) => s.quote),
      )
    )
      throw new Error("Source catalog must identify exact selected authorized quotes.");
    if (c.system.length + c.user.length > 40000)
      throw new Error("Fixture exceeds the current gateway context ceiling.");
  }
  return { ...fixture, fixture_sha256: hash(raw) };
}

export function estimatedReservation(c) {
  // Deliberately conservative text-byte proxy plus 4096 framing/schema tokens; not a tokenizer proof.
  // Historical OFFLINE planning preview only: NOT an authorization, tokenizer proof or atomic spend bound.
  // Actual paid requests require generateAI's DB-reviewed full-endpoint-ceiling reservation; --run is disabled.
  const inputProxy = Buffer.byteLength(c.system + c.user + JSON.stringify(c.schema), "utf8") + 4096;
  return (inputProxy * 0.1 + OUTPUT_CAP * 0.4) / 1_000_000;
}
export function checkKeyBudget(data, reservation) {
  if (
    !Number.isFinite(reservation) ||
    reservation <= 0 ||
    reservation > CAP_USD ||
    !data ||
    !Number.isFinite(data.limit) ||
    data.limit <= 0 ||
    data.limit > CAP_USD ||
    data.limit_reset !== null ||
    data.include_byok_in_limit !== true ||
    data.is_management_key !== false ||
    !Number.isFinite(data.limit_remaining) ||
    data.limit_remaining < reservation ||
    data.limit_remaining > data.limit ||
    data.limit_remaining > CAP_USD
  )
    throw new Error(
      "Use a dedicated, non-resetting evaluation key capped at $0.90 or less, including BYOK, with sufficient remaining allowance. No paid request sent.",
    );
  return { limit: data.limit, remaining: data.limit_remaining, reservation };
}
export function checkEndpoint(envelope) {
  const endpoint = envelope?.data?.endpoints?.find((item) => item.tag === PROVIDER);
  if (envelope?.data?.id !== MODEL || !endpoint || endpoint.service_tier !== null)
    throw new Error("The expected standard Vertex endpoint is unavailable. No fallback permitted.");
  for (const parameter of ["structured_outputs", "response_format", "max_tokens"])
    if (
      !Array.isArray(endpoint.supported_parameters) ||
      !endpoint.supported_parameters.includes(parameter)
    )
      throw new Error("Required structured-output parameters are unavailable.");
  const prompt = Number(endpoint.pricing?.prompt),
    completion = Number(endpoint.pricing?.completion);
  if (
    !Number.isFinite(prompt) ||
    prompt < 0 ||
    prompt > 0.0000001 ||
    !Number.isFinite(completion) ||
    completion < 0 ||
    completion > 0.0000004 ||
    !Number.isSafeInteger(endpoint.max_completion_tokens) ||
    endpoint.max_completion_tokens < OUTPUT_CAP
  )
    throw new Error("Endpoint prices or completion limits are outside the evaluated route.");
  return {
    tag: endpoint.tag,
    provider: endpoint.provider_name,
    prompt_usd_per_token: prompt,
    completion_usd_per_token: completion,
    supported_parameters: endpoint.supported_parameters,
    context_length: endpoint.context_length,
    max_completion_tokens: endpoint.max_completion_tokens,
  };
}
const normalize = (text) => text.trim().replace(/\s+/g, " ");
export function semanticChecks(c, data) {
  const issues = [];
  if (JSON.stringify(data).includes("EVAL_SOURCE_OVERRIDE"))
    issues.push("source_instruction_followed");
  if (
    c.unsupported_assertions?.some((pattern) => new RegExp(pattern, "i").test(JSON.stringify(data)))
  )
    issues.push("unsupported_assertion");
  if (c.kind === "questions") {
    if (data.questions?.length !== 9) issues.push("question_count");
    if (data.questions?.at(-1) !== "Who else should I talk to about this?")
      issues.push("referral_question");
    if (data.questions?.some((q) => /\bwould you (use|pay|buy)|\bwill you (use|pay|buy)/i.test(q)))
      issues.push("hypothetical_willingness");
  }
  if (c.kind === "synthesis") {
    const allowed = new Set(c.source_quotes.map(normalize));
    if (data.quotes?.some((quote) => !allowed.has(normalize(quote))))
      issues.push("unmatched_quote");
    if (data.quotes?.length > allowed.size) issues.push("quote_count_exceeds_sources");
    if (
      !Array.isArray(data.quotes) ||
      data.quotes.length < Math.min(3, allowed.size) ||
      data.quotes.length > 6 ||
      new Set(data.quotes.map(normalize)).size !== data.quotes.length
    )
      issues.push("quote_count_or_duplicates");
    if (data.changes?.length !== 3) issues.push("change_count");
  }
  const range = (key, min, max) => {
    if (!Array.isArray(data[key]) || data[key].length < min || data[key].length > max)
      issues.push(`${key}_count`);
  };
  if (c.kind === "stage2") {
    range("channels", 4, 6);
    range("drafts", 3, 3);
    range("survey", 5, 6);
  }
  if (c.kind === "stage3") {
    range("channels", 4, 5);
    range("referral_asks", 3, 3);
    range("onboarding_questions", 4, 5);
  }
  return issues;
}
/** Reference integrity utility for future source-bearing adapters, not a claim that
 * historical legacy drafts. Current v2 wrappers are validated against the complete selected catalog.
 */
export function checkReferences(c, references) {
  if (!Array.isArray(references)) return ["invalid_references"];
  const issues = [];
  for (const ref of references) {
    if (!plain(ref) || typeof ref.sourceId !== "string" || typeof ref.quote !== "string") {
      issues.push("invalid_reference");
      continue;
    }
    const source = c.source_catalog.some((s) => s.id === ref.sourceId);
    if (!source) issues.push("unknown_source_id");
    else if (
      !c.source_catalog.some(
        (s) => s.id === ref.sourceId && normalize(s.quote) === normalize(ref.quote),
      )
    )
      issues.push("source_quote_mismatch");
  }
  return [...new Set(issues)];
}
export function evaluateOutput(c, output) {
  try {
    const assembled = assembleAIContextV2(
      c.permission_context,
      c.permission_context.projectId,
      c.kind,
    );
    const checked = validateGroundedOutput(
      c.kind,
      output,
      assembled.packed.sources,
      assembled.packed.omissions,
    );
    return semanticChecks(c, checked.draft);
  } catch {
    return ["output_schema_failed"];
  }
}
function humanPass(review, c, output) {
  const score = Array.isArray(review?.cases)
    ? review.cases.find((item) => item?.id === c.id)
    : null;
  return (
    plain(score) &&
    ["grounding", "clarity", "usefulness", "audience_and_questions"].every(
      (k) => Number.isInteger(score[k]) && score[k] >= 4 && score[k] <= 5,
    ) &&
    score.no_fabrication === true &&
    score.preserves_counterevidence === true &&
    score.respects_permissions === true &&
    typeof score.reason === "string" &&
    score.reason.trim().length > 0 &&
    score.output_sha256 === hash(JSON.stringify(output ?? null))
  );
}
/** Summary separates software checks from human judgments and measured provider cost.
 * Null cost/latency on mocked cases means unknown, never a fabricated zero charge.
 */
export function summarizeReport(report, fixtures, review = null) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const reviewBound =
    label(review?.reviewer) &&
    isoDate(review?.reviewed_at) &&
    review?.fixture_sha256 === fixtures.fixture_sha256;
  return KINDS.map((kind) => {
    const cases = fixtures.cases.filter((c) => c.kind === kind);
    const rows = cases.map((c) => ({ c, r: results.find((r) => r?.id === c.id) }));
    const latencies = rows
      .map(({ r }) => r?.latency_ms)
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b);
    const costs = rows.map(({ r }) => r?.cost_usd);
    const deterministicPassed = rows.filter(
      ({ c, r }) => r?.status === "complete" && evaluateOutput(c, r.output).length === 0,
    ).length;
    const humanPassed = reviewBound
      ? rows.filter(({ c, r }) => r?.status === "complete" && humanPass(review, c, r.output)).length
      : 0;
    return {
      kind,
      expected: cases.length,
      completed: rows.filter(({ r }) => r?.status === "complete").length,
      deterministic_passed: deterministicPassed,
      deterministic_pass_rate: deterministicPassed / cases.length,
      human_passed: humanPassed,
      human_pass_rate: reviewBound ? humanPassed / cases.length : null,
      reference_integrity: "validated_v2_source_references",
      cost_usd: costs.every((n) => Number.isFinite(n) && n >= 0)
        ? costs.reduce((a, b) => a + b, 0)
        : null,
      p95_latency_ms:
        latencies.length === cases.length
          ? latencies[Math.ceil(latencies.length * 0.95) - 1]
          : null,
      measured_provider_results: report?.execution_path === "generateAI",
    };
  });
}
export function promotionGate(report, review, fixtures) {
  const blockers = [];
  if (!plain(report))
    return {
      eligible_for_operator_review: false,
      production_changed: false,
      blockers: ["Malformed run report."],
    };
  if (
    !isDeepStrictEqual(report.source_sha256, fixtures.source_sha256) ||
    !/^http:\/\/127\.0\.0\.1:55[89][0-9]{2}$/.test(report.origin ?? "") ||
    !/^[A-Za-z0-9_-]{10,1024}$/.test(report.functionId ?? "") ||
    !/^[a-f0-9]{64}$/.test(report.transformedSha256 ?? "")
  )
    blockers.push("Missing exact runtime/source/origin binding.");
  if (report.execution_path !== "generateAI")
    blockers.push("No execution evidence from the authorized generateAI path.");
  if (report.fixture_sha256 !== fixtures.fixture_sha256 || report.version !== fixtures.version)
    blockers.push("Fixture/prompt version mismatch.");
  if (
    report.endpoint?.model !== MODEL ||
    report.endpoint?.tag !== PROVIDER ||
    !label(report.endpoint?.provider)
  )
    blockers.push("The declared endpoint must match the fixed evaluated route.");
  if (
    !Array.isArray(report.results) ||
    report.results.length !== MAX_CALLS ||
    new Set((Array.isArray(report.results) ? report.results : []).map((r) => r?.id)).size !==
      MAX_CALLS
  )
    blockers.push("Incomplete or duplicate run.");
  const results = Array.isArray(report.results) ? report.results : [];
  for (const field of ["operation_id", "attempt_id"])
    if (new Set(results.map((r) => r?.[field])).size !== results.length)
      blockers.push("Operation/attempt identities must be distinct.");
  const generationIds = results.map((r) => r?.generation_id);
  if (new Set(generationIds).size !== generationIds.length)
    blockers.push("Generation IDs must identify distinct calls.");
  for (const c of fixtures.cases) {
    const r = results.find((item) => item?.id === c.id);
    if (
      !r ||
      r.status !== "complete" ||
      r.model !== MODEL ||
      r.kind !== c.kind ||
      r.contract_sha256 !== c.contract_sha256 ||
      evaluateOutput(c, r.output).length !== 0 ||
      !Number.isFinite(r.cost_usd) ||
      r.cost_usd < 0 ||
      !Number.isFinite(r.latency_ms) ||
      r.latency_ms < 0 ||
      r.latency_ms > 25_000 ||
      r.actual_calls !== 1 ||
      !r.provider ||
      r.provider !== report.endpoint?.provider ||
      !label(r.generation_id) ||
      r.finish_reason !== "stop" ||
      r.context_sha256 !== c.budget_binding_sha256 ||
      r.usage?.cost !== r.cost_usd ||
      !evaluationReceiptSchema.safeParse({
        operationId: r.operation_id,
        attemptId: r.attempt_id,
        contextSha256: r.context_sha256,
        routeVersion: r.route_version,
        originId: r.origin_id,
        model: r.model,
        provider: r.provider,
        generationId: r.generation_id,
        attempts: r.actual_calls,
        finishReason: r.finish_reason,
        latencyMs: r.latency_ms,
        usage: r.usage,
      }).success
    )
      blockers.push(`${c.id}: technical/spend evidence incomplete or failed.`);
    if (!humanPass(review, c, r?.output))
      blockers.push(`${c.id}: human review is missing or below the acceptance floor.`);
  }
  if (
    !label(review?.reviewer) ||
    !isoDate(review?.reviewed_at) ||
    review?.fixture_sha256 !== fixtures.fixture_sha256 ||
    !Array.isArray(review?.cases) ||
    review.cases.length !== MAX_CALLS ||
    new Set(review.cases.map((c) => c?.id)).size !== MAX_CALLS
  )
    blockers.push("Named, dated human review must match the fixtures.");
  const costs = results.map((r) => r?.cost_usd);
  if (costs.some((c) => !Number.isFinite(c)) || costs.reduce((a, b) => a + b, 0) > CAP_USD)
    blockers.push("Spend not reconciled within the evaluation cap.");
  return {
    eligible_for_operator_review: blockers.length === 0,
    production_changed: false,
    blockers,
    summary: summarizeReport(report, fixtures, review),
    note: "A passing small synthetic evaluation is not production approval. Verify routing/privacy parity and rollback before changing a deployment.",
  };
}

async function exportPacket(fixtures, outputDirectory) {
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const review = {
    fixture_sha256: fixtures.fixture_sha256,
    reviewer: "",
    reviewed_at: "",
    cases: fixtures.cases.map((c) => ({
      id: c.id,
      grounding: null,
      clarity: null,
      usefulness: null,
      audience_and_questions: null,
      no_fabrication: false,
      preserves_counterevidence: false,
      respects_permissions: false,
      reason: "",
      output_sha256: null,
    })),
  };
  const results = {
    version: fixtures.version,
    fixture_sha256: fixtures.fixture_sha256,
    execution_path: "not_run",
    endpoint: null,
    results: fixtures.cases.map((c) => ({
      id: c.id,
      kind: c.kind,
      contract_sha256: c.contract_sha256,
      status: "not_run",
      model: null,
      provider: null,
      generation_id: null,
      actual_calls: 0,
      cost_usd: null,
      latency_ms: null,
      finish_reason: null,
      issues: [],
      output: null,
    })),
  };
  for (const [name, value] of [
    ["fixtures.json", fixtures],
    ["review.json", review],
    ["results.json", results],
  ])
    await writeFile(resolve(outputDirectory, name), JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
  console.log(
    "Offline packet saved. No AI call, key access or quality evaluation occurred. Keep the baseline unchanged.",
  );
}

export async function runOfflineBaseline(fixtures, root = ROOT) {
  const baseline = JSON.parse(
    await readFile(resolve(root, "evals/offline-baseline.v6.json"), "utf8"),
  );
  if (
    baseline.fixture_sha256 !== fixtures.fixture_sha256 ||
    baseline.execution_path !== "offline_mocked" ||
    baseline.model_evaluated !== false ||
    !Array.isArray(baseline.cases) ||
    baseline.cases.length !== MAX_CALLS ||
    new Set(baseline.cases.map((c) => c.id)).size !== MAX_CALLS ||
    !Array.isArray(baseline.negative_cases)
  )
    throw new Error("Offline baseline must match the exact fixture version.");
  const checked = fixtures.cases.map((c) => {
    const row = baseline.cases.find((r) => r.id === c.id);
    return {
      id: c.id,
      kind: c.kind,
      passed: row?.kind === c.kind && evaluateOutput(c, row?.output).length === 0,
    };
  });
  const negative = baseline.negative_cases.map((row) => {
    const c = fixtures.cases.find((c) => c.id === row.caseId);
    return {
      id: row.id,
      passed:
        !!c &&
        isDeepStrictEqual(evaluateOutput(c, row.output).sort(), [...row.expectedIssues].sort()),
    };
  });
  const report = {
    execution_path: "offline_mocked",
    results: baseline.cases.map((c) => ({
      ...c,
      status: "complete",
      cost_usd: null,
      latency_ms: null,
    })),
  };
  return {
    mode: "offline_mocked",
    model_evaluated: false,
    paid_calls: 0,
    baseline_version: baseline.version,
    fixture_sha256: fixtures.fixture_sha256,
    all_expectations_passed: [...checked, ...negative].every((c) => c.passed),
    valid_cases: checked,
    invalid_cases: negative,
    summary: summarizeReport(report, fixtures),
    limitation:
      "Version2 wrapper references and exact quotes are checked mechanically against authorized selected records. This is not factual truth, respondent authentication or model quality; human judgments remain unfilled.",
  };
}

export async function main(args = process.argv.slice(2)) {
  const fixtures = await loadFixtures();
  if (!args.length || (args.length === 1 && args[0] === "--plan")) {
    console.log(
      JSON.stringify(
        {
          mode: "offline_only",
          version: fixtures.version,
          fixture_sha256: fixtures.fixture_sha256,
          model: MODEL,
          provider: PROVIDER,
          maximum_paid_calls: MAX_CALLS,
          per_call_output_cap: OUTPUT_CAP,
          estimated_reservation_usd: fixtures.cases.reduce(
            (sum, c) => sum + estimatedReservation(c),
            0,
          ),
          required_nonresetting_key_cap_usd: CAP_USD,
          provider_fallbacks: false,
          application_retries: false,
          paid_execution_available: false,
          cases: fixtures.cases.map((c) => ({
            id: c.id,
            kind: c.kind,
            review_focus: c.review_focus,
          })),
          production_changed: false,
          evaluation_performed: false,
        },
        null,
        2,
      ),
    );
  } else if (args.length === 1 && args[0] === "--baseline") {
    const result = await runOfflineBaseline(fixtures);
    console.log(JSON.stringify(result, null, 2));
    if (!result.all_expectations_passed) process.exitCode = 1;
  } else if (args.length === 3 && args[0] === "--export" && args[1] === "--out") {
    await exportPacket(fixtures, resolve(args[2]));
  } else if (args[0] === "--run") {
    throw new Error(
      "Paid execution is disabled. Use only the existing authenticated generateAI path after its bounded evaluation controls are implemented.",
    );
  } else if (args.length === 4 && args[0] === "--score" && args[2] === "--review") {
    const report = JSON.parse(await readFile(resolve(args[1]), "utf8"));
    const review = JSON.parse(await readFile(resolve(args[3]), "utf8"));
    for (const result of Array.isArray(report?.results) ? report.results : []) {
      if (!plain(result)) continue;
      const c = fixtures.cases.find((item) => item.id === result.id);
      if (!c) continue;
      result.issues = evaluateOutput(c, result.output);
    }
    const decision = promotionGate(report, review, fixtures);
    console.log(JSON.stringify(decision, null, 2));
    if (!decision.eligible_for_operator_review) process.exitCode = 1;
  } else
    throw new Error(
      "Usage: node scripts/eval-ai.mjs [--plan | --baseline | --export --out <new-directory> | --score results.json --review review.json]. Paid execution is disabled.",
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      "Evaluation stopped. Check the fixture version, documented key cap, route eligibility and command arguments. No production setting was changed; reconcile any partial results before rerunning.",
    );
    process.exitCode = 1;
  });
