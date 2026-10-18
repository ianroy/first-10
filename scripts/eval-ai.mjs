#!/usr/bin/env node
// Offline only. Every actual AI call must use the existing authenticated generateAI function.
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MODEL = "google/gemini-2.5-flash-lite";
export const PROVIDER = "google-vertex";
export const CAP_USD = 0.9;
export const OUTPUT_CAP = 2500;
export const MAX_CALLS = 8;
const KINDS = ["questions", "synthesis", "stage2", "stage3"];
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function loadFixtures(root = ROOT) {
  const raw = await readFile(resolve(root, "src/tests/ai-eval/fixtures.v1.json"), "utf8");
  const fixture = JSON.parse(raw);
  if (
    fixture.cases.length !== MAX_CALLS ||
    new Set(fixture.cases.map((c) => c.id)).size !== MAX_CALLS
  )
    throw new Error("Expected eight distinct versioned cases.");
  for (const kind of KINDS)
    if (fixture.cases.filter((c) => c.kind === kind).length !== 2)
      throw new Error("Every existing AI kind needs typical and edge coverage.");
  for (const c of fixture.cases)
    if (c.synthetic !== true || typeof c.system !== "string" || typeof c.user !== "string")
      throw new Error("Only bundled synthetic fixtures are allowed.");
  for (const [path, expected] of Object.entries(fixture.source_sha256))
    if (hash(await readFile(resolve(root, path))) !== expected)
      throw new Error(
        `Production source changed: ${path}. Review and version fixtures before running.`,
      );
  return { ...fixture, fixture_sha256: hash(raw) };
}

export function estimatedReservation(c) {
  // Deliberately conservative text-byte proxy plus 4096 framing/schema tokens; not a tokenizer proof.
  // The dedicated non-resetting key limit is the external total-spend guard.
  const inputProxy = Buffer.byteLength(c.system + c.user + JSON.stringify(c.schema), "utf8") + 4096;
  return (inputProxy * 0.1 + OUTPUT_CAP * 0.4) / 1_000_000;
}
export function checkKeyBudget(data, reservation) {
  if (
    !data ||
    !Number.isFinite(data.limit) ||
    data.limit <= 0 ||
    data.limit > CAP_USD ||
    data.limit_reset !== null ||
    data.include_byok_in_limit !== true ||
    data.is_management_key !== false ||
    !Number.isFinite(data.limit_remaining) ||
    data.limit_remaining < reservation ||
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
    if (!endpoint.supported_parameters?.includes(parameter))
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
export function promotionGate(report, review, fixtures) {
  const blockers = [];
  if (report.execution_path !== "generateAI")
    blockers.push("No execution evidence from the authorized generateAI path.");
  if (report.fixture_sha256 !== fixtures.fixture_sha256 || report.version !== fixtures.version)
    blockers.push("Fixture/prompt version mismatch.");
  if (
    !Array.isArray(report.results) ||
    report.results.length !== MAX_CALLS ||
    new Set(report.results?.map((r) => r.id)).size !== MAX_CALLS
  )
    blockers.push("Incomplete or duplicate run.");
  for (const c of fixtures.cases) {
    const r = report.results?.find((item) => item.id === c.id);
    if (
      !r ||
      r.status !== "complete" ||
      r.model !== MODEL ||
      r.issues?.length !== 0 ||
      !Number.isFinite(r.cost_usd) ||
      r.cost_usd < 0 ||
      !Number.isFinite(r.latency_ms) ||
      r.latency_ms > 25_000 ||
      r.actual_calls !== 1 ||
      !r.provider ||
      r.provider !== report.endpoint?.provider ||
      !r.generation_id
    )
      blockers.push(`${c.id}: technical/spend evidence incomplete or failed.`);
    const score = review?.cases?.find((item) => item.id === c.id);
    if (
      !score ||
      ["grounding", "clarity", "usefulness", "audience_and_questions"].some(
        (key) => !Number.isInteger(score[key]) || score[key] < 4 || score[key] > 5,
      ) ||
      score.no_fabrication !== true ||
      score.preserves_counterevidence !== true ||
      score.respects_permissions !== true ||
      typeof score.reason !== "string" ||
      !score.reason.trim()
    )
      blockers.push(`${c.id}: human review is missing or below the acceptance floor.`);
  }
  if (
    !review?.reviewer?.trim() ||
    !review?.reviewed_at ||
    review?.fixture_sha256 !== fixtures.fixture_sha256
  )
    blockers.push("Named, dated human review must match the fixtures.");
  const costs = report.results?.map((r) => r.cost_usd) ?? [];
  if (costs.some((c) => !Number.isFinite(c)) || costs.reduce((a, b) => a + b, 0) > CAP_USD)
    blockers.push("Spend not reconciled within the evaluation cap.");
  return {
    eligible_for_operator_review: blockers.length === 0,
    production_changed: false,
    blockers,
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
      status: "not_run",
      model: null,
      provider: null,
      generation_id: null,
      actual_calls: 0,
      cost_usd: null,
      latency_ms: null,
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
  } else if (args.length === 3 && args[0] === "--export" && args[1] === "--out") {
    await exportPacket(fixtures, resolve(args[2]));
  } else if (args[0] === "--run") {
    throw new Error(
      "Paid execution is disabled. Use only the existing authenticated generateAI path after its bounded evaluation controls are implemented.",
    );
  } else if (args.length === 4 && args[0] === "--score" && args[2] === "--review") {
    const report = JSON.parse(await readFile(resolve(args[1]), "utf8"));
    const review = JSON.parse(await readFile(resolve(args[3]), "utf8"));
    const { validateAIOutput } = await import("../src/lib/ai/contracts.ts");
    for (const result of report.results ?? []) {
      const c = fixtures.cases.find((item) => item.id === result.id);
      if (!c) continue;
      try {
        result.issues = semanticChecks(c, validateAIOutput(c.kind, result.output));
      } catch {
        result.issues = ["output_schema_failed"];
      }
    }
    const decision = promotionGate(report, review, fixtures);
    console.log(JSON.stringify(decision, null, 2));
    if (!decision.eligible_for_operator_review) process.exitCode = 1;
  } else
    throw new Error(
      "Usage: node scripts/eval-ai.mjs [--plan | --export --out <new-directory> | --score results.json --review review.json]. Paid execution is disabled.",
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      "Evaluation stopped. Check the fixture version, documented key cap, route eligibility and command arguments. No production setting was changed; reconcile any partial results before rerunning.",
    );
    process.exitCode = 1;
  });
