#!/usr/bin/env node
/** Explicit local-only operator evaluation. All generation uses the ACTUAL authenticated generateAI server function. */
import { open, readFile, lstat, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadFixtures, hash, MODEL, PROVIDER, checkEndpoint, evaluateOutput } from "./eval-ai.mjs";
import { assembleAIContextV2 } from "../src/lib/prompts/context-v2.ts";
import { evaluationReceiptSchema } from "../src/lib/ai/evaluation-contract.ts";
import {
  fixtureStatements,
  EVALUATOR_USER_ID,
  EVALUATOR_PROJECT_ID,
  assertLocalDatabaseUrl,
} from "../evals/fixture-staging.v6.mjs";
export function evaluationRepositoryRoot(moduleUrl = import.meta.url) {
  return resolve(fileURLToPath(new URL("..", moduleUrl)));
}
const ROOT = evaluationRepositoryRoot();
export function reviewedPlanBinding(plan) {
  return hash(
    JSON.stringify({
      version: plan.version,
      fixture_sha256: plan.fixture_sha256,
      source_sha256: plan.source_sha256,
      origin: plan.origin,
      function_id: plan.function_id,
      transformed_sha256: plan.transformed_sha256,
      runner_sha256: plan.runner_sha256,
      staging_sha256: plan.staging_sha256,
      maximum_calls: plan.maximum_calls,
      cap_usd: plan.cap_usd,
      user_id: plan.user_id,
      project_id: plan.project_id,
      endpoint: plan.endpoint,
      endpoint_review_sha256: plan.endpoint_review_sha256,
      route_versions: plan.route_versions,
      response_provider: plan.response_provider,
      operator_reference: plan.operator_reference,
      reviewed_at: plan.reviewed_at,
    }),
  );
}
const deny = () =>
  new Error(
    "Bounded evaluation stopped; inspect the private journal and reconcile uncertain operations before any new run.",
  );
export async function readPrivateJson(path) {
  const s = await lstat(path);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid() ||
    (s.mode & 0o077) !== 0 ||
    s.size > 100_000
  )
    throw deny();
  return JSON.parse(await readFile(path, "utf8"));
}
export function assertLocalOrigin(value) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    !/^55[89][0-9]{2}$/.test(u.port) ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password
  )
    throw deny();
  return u.origin;
}
/** Paid API55321 and its SQL staging must address the SAME original local database.
 * Clone URLs remain valid only for the separate rollback rehearsal, never a paid run. */
export function assertPaidDatabaseUrl(value) {
  const url = assertLocalDatabaseUrl(value);
  if (url.pathname !== "/postgres") throw deny();
  return url;
}
/** Real SDK serializer/framed response parser. No handwritten server-function wire format. */
export async function invokeGenerateAI({
  origin,
  functionId,
  token,
  request,
  signal,
  fetcher = fetch,
}) {
  assertLocalOrigin(origin);
  if (!/^[A-Za-z0-9_-]{10,1024}$/.test(functionId)) throw deny();
  const { createClientRpc } = await import("@tanstack/react-start/client-rpc");
  const { createServerFn } = await import("@tanstack/react-start");
  const { runWithStartContext } = await import("@tanstack/start-storage-context");
  const previous = process.env["TSS_SERVER_FN_BASE"];
  process.env["TSS_SERVER_FN_BASE"] = `${origin}/_serverFn/`;
  try {
    const rpc = createServerFn({ method: "POST" }).handler(createClientRpc(functionId));
    let attempts = 0;
    return await runWithStartContext({ startOptions: {} }, () =>
      rpc({
        method: "POST",
        data: request,
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
        signal,
        fetch: async (url, init) => {
          if (
            ++attempts !== 1 ||
            new URL(url).origin !== origin ||
            new URL(url).pathname !== `/_serverFn/${functionId}`
          )
            throw deny();
          return fetcher(url, { ...init, redirect: "error", signal });
        },
      }),
    );
  } finally {
    if (previous === undefined) delete process.env["TSS_SERVER_FN_BASE"];
    else process.env["TSS_SERVER_FN_BASE"] = previous;
  }
}
export async function discoverGenerateAI(server) {
  const transformed = await server.environments.client.transformRequest("/src/lib/ai.functions.ts");
  const code = transformed?.code ?? "";
  const matches = [...code.matchAll(/createClientRpc\("([A-Za-z0-9_-]+)"\)/g)];
  if (matches.length !== 1 || !code.includes("export const generateAI =")) throw deny();
  return { functionId: matches[0][1], transformedSha256: hash(code) };
}
export async function appendJournal(handle, value) {
  await handle.write(JSON.stringify(value) + "\n");
  await handle.sync(); // Stable operation identity reaches durable storage BEFORE the request.
}
export function validatePaidResult(c, result, binding) {
  const receipt = evaluationReceiptSchema.parse(result?.evaluation);
  if (
    receipt.operationId !== binding.operationId ||
    receipt.contextSha256 !== c.budget_binding_sha256 ||
    receipt.routeVersion !== binding.routeVersion ||
    receipt.model !== MODEL ||
    receipt.provider !== binding.provider ||
    receipt.finishReason !== "stop" ||
    evaluateOutput(c, { draft: result.draft, grounding: result.grounding }).length
  )
    throw deny();
  return {
    id: c.id,
    kind: c.kind,
    contract_sha256: c.contract_sha256,
    status: "complete",
    model: receipt.model,
    provider: receipt.provider,
    generation_id: receipt.generationId,
    actual_calls: receipt.attempts,
    cost_usd: receipt.usage.cost,
    latency_ms: receipt.latencyMs,
    finish_reason: receipt.finishReason,
    operation_id: receipt.operationId,
    attempt_id: receipt.attemptId,
    context_sha256: receipt.contextSha256,
    route_version: receipt.routeVersion,
    origin_id: receipt.originId,
    usage: receipt.usage,
    output: { draft: result.draft, grounding: result.grounding },
    issues: [],
  };
}
/** Generates an unapproved packet; no credentials are read, no network/provider call is made. */
export async function preparePaidPlan(outputPath) {
  const fixtures = await loadFixtures(ROOT);
  const { createServer } = await import("vite");
  const server = await createServer({
    root: ROOT,
    envDir: false,
    server: { host: "127.0.0.1", port: 55890, strictPort: true },
    logLevel: "silent",
  });
  try {
    const compiled = await discoverGenerateAI(server);
    const plan = {
      version: "first-ten-bounded-evaluation-v6",
      fixture_sha256: fixtures.fixture_sha256,
      source_sha256: fixtures.source_sha256,
      origin: "http://127.0.0.1:55890",
      function_id: compiled.functionId,
      transformed_sha256: compiled.transformedSha256,
      runner_sha256: hash(await readFile(new URL(import.meta.url))),
      staging_sha256: hash(
        await readFile(new URL("../evals/fixture-staging.v6.mjs", import.meta.url)),
      ),
      maximum_calls: 8,
      cap_usd: 0.9,
      user_id: EVALUATOR_USER_ID,
      project_id: EVALUATOR_PROJECT_ID,
      endpoint: null,
      endpoint_review_sha256: null,
      route_versions: null,
      response_provider: null,
      operator_reference: "",
      reviewed_at: "",
      evaluation_plan_sha256: null,
      runtime_file: "",
      output_directory: "",
    };
    const handle = await open(resolve(outputPath), "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(plan, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    console.log(
      JSON.stringify({ status: "unapproved_plan_saved", paid_calls: 0, credentials_read: false }),
    );
  } finally {
    await server.close();
  }
}
export async function runPaid(planPath) {
  const fixtures = await loadFixtures(ROOT);
  const plan = await readPrivateJson(resolve(planPath));
  const origin = assertLocalOrigin(plan.origin);
  const reviewedAt = Date.parse(plan.reviewed_at);
  if (
    plan.version !== "first-ten-bounded-evaluation-v6" ||
    plan.fixture_sha256 !== fixtures.fixture_sha256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(plan.operator_reference ?? "") ||
    !Number.isFinite(reviewedAt) ||
    reviewedAt > Date.now() ||
    Date.now() - reviewedAt > 86400000 ||
    !isDeepStrictEqual(plan.source_sha256, fixtures.source_sha256) ||
    plan.maximum_calls !== 8 ||
    plan.cap_usd !== 0.9 ||
    plan.user_id !== EVALUATOR_USER_ID ||
    plan.project_id !== EVALUATOR_PROJECT_ID ||
    plan.evaluation_plan_sha256 !== reviewedPlanBinding(plan) ||
    plan.staging_sha256 !==
      hash(await readFile(new URL("../evals/fixture-staging.v6.mjs", import.meta.url))) ||
    plan.runner_sha256 !== hash(await readFile(new URL(import.meta.url)))
  )
    throw deny();
  // Explicit private runtime inputs only. Never use an ambient production provider/service credential.
  const secrets = await readPrivateJson(resolve(plan.runtime_file));
  const databaseUrl = assertPaidDatabaseUrl(secrets.database_url);
  if (
    secrets.SUPABASE_URL !== "http://127.0.0.1:55321" ||
    !secrets.SUPABASE_PUBLISHABLE_KEY ||
    !secrets.SUPABASE_SERVICE_ROLE_KEY ||
    typeof secrets.OPENROUTER_API_KEY !== "string" ||
    !secrets.OPENROUTER_API_KEY.trim() ||
    !secrets.access_token
  )
    throw deny();
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl.href, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  let server, journal;
  const previous = Object.fromEntries(
    [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENROUTER_API_KEY",
    ].map((k) => [k, process.env[k]]),
  );
  try {
    const [user] =
      await sql`SELECT id FROM auth.users WHERE id=${EVALUATOR_USER_ID} AND raw_app_meta_data->'synthetic'='true'::jsonb`;
    const [existing] =
      await sql`SELECT count(*)::int AS n FROM public.projects WHERE id=${EVALUATOR_PROJECT_ID}`;
    const [policy] =
      await sql`SELECT global_stop,general_enabled,opening_hold_micro,opening_reviewed_at FROM firstten_private.ai_usage_global_policy WHERE singleton`;
    if (
      !user ||
      existing.n !== 0 ||
      !policy ||
      policy.global_stop ||
      !policy.general_enabled ||
      policy.opening_hold_micro === null ||
      !policy.opening_reviewed_at
    )
      throw deny();
    const endpointResponse = await fetch(`https://openrouter.ai/api/v1/models/${MODEL}/endpoints`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!endpointResponse.ok) throw deny();
    const endpoint = checkEndpoint(await endpointResponse.json());
    if (endpoint.tag !== PROVIDER || !isDeepStrictEqual(endpoint, plan.endpoint)) throw deny();
    const identityResponse = await fetch("http://127.0.0.1:55321/auth/v1/user", {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        apikey: secrets.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${secrets.access_token}`,
      },
    });
    if (!identityResponse.ok) throw deny();
    const identity = await identityResponse.json();
    if (identity.id !== EVALUATOR_USER_ID || identity.app_metadata?.synthetic !== true)
      throw deny();
    const routes = await sql`SELECT * FROM firstten_private.ai_usage_route_policies WHERE enabled`;
    for (const c of fixtures.cases) {
      const route = routes.find((r) => r.kind === c.kind);
      if (
        !route ||
        route.purpose !== "eval_only" ||
        route.eval_user_id !== EVALUATOR_USER_ID ||
        route.eval_project_id !== EVALUATOR_PROJECT_ID ||
        !route.eval_context_sha256?.includes(c.budget_binding_sha256) ||
        route.model !== MODEL ||
        route.provider_slug !== PROVIDER ||
        !Number.isSafeInteger(endpoint.context_length) ||
        endpoint.context_length < 1 ||
        route.input_token_ceiling < endpoint.context_length ||
        route.output_token_ceiling !== 2500 ||
        route.prompt_micro_per_million < Math.ceil(endpoint.prompt_usd_per_token * 1e12) ||
        route.completion_micro_per_million < Math.ceil(endpoint.completion_usd_per_token * 1e12) ||
        !route.response_providers.includes(plan.response_provider) ||
        route.version !== plan.route_versions?.[c.kind] ||
        route.quality_review_sha256 !== plan.evaluation_plan_sha256 ||
        route.bounds_review_sha256 !== plan.endpoint_review_sha256
      )
        throw deny();
    }
    const runDirectory = resolve(plan.output_directory);
    await mkdir(runDirectory, { mode: 0o700 });
    journal = await open(resolve(runDirectory, "journal.jsonl"), "wx", 0o600);
    await appendJournal(journal, {
      state: "prepared",
      fixture_sha256: fixtures.fixture_sha256,
      origin,
      source_sha256: fixtures.source_sha256,
      runner_sha256: plan.runner_sha256,
      staging_sha256: plan.staging_sha256,
    });
    for (const k of Object.keys(previous)) process.env[k] = secrets[k];
    const { createServer } = await import("vite");
    server = await createServer({
      root: ROOT,
      envDir: false,
      server: { host: "127.0.0.1", port: Number(new URL(origin).port), strictPort: true },
      logLevel: "silent",
    });
    await server.listen();
    const compiled = await discoverGenerateAI(server);
    if (
      compiled.functionId !== plan.function_id ||
      compiled.transformedSha256 !== plan.transformed_sha256
    )
      throw deny();
    const results = [];
    for (const [index, c] of fixtures.cases.entries()) {
      const operationId = randomUUID();
      await appendJournal(journal, {
        state: "staging",
        id: c.id,
        operationId,
        context_sha256: c.budget_binding_sha256,
      });
      const context = await sql.begin(async (tx) => {
        for (const statement of fixtureStatements(c, index === 0)) await tx.unsafe(statement);
        const [row] =
          await tx`SELECT public.get_ai_processing_context_v2(${EVALUATOR_PROJECT_ID}::uuid,${c.kind}) AS result`;
        if (!row.result?.ok || !isDeepStrictEqual(row.result.data, c.permission_context))
          throw deny();
        return row.result.data;
      });
      // Real SQL projection must assemble to the immutable exact prompt binding, not a JS-only fixture claim.
      const assembled = assembleAIContextV2(context, EVALUATOR_PROJECT_ID, c.kind);
      if (assembled.assembled.user !== c.user || assembled.assembled.system !== c.system)
        throw deny();
      await appendJournal(journal, {
        state: "dispatch_intent",
        id: c.id,
        operationId,
        context_sha256: c.budget_binding_sha256,
        origin,
        ...compiled,
      });
      try {
        const raw = await invokeGenerateAI({
          origin,
          functionId: compiled.functionId,
          token: secrets.access_token,
          request: {
            kind: c.kind,
            projectId: EVALUATOR_PROJECT_ID,
            operationId,
            withEvaluation: true,
          },
          signal: AbortSignal.timeout(60000),
        });
        const result = validatePaidResult(c, raw, {
          operationId,
          routeVersion: plan.route_versions[c.kind],
          provider: plan.response_provider,
        });
        results.push(result);
        await appendJournal(journal, { state: "complete", ...result, origin, ...compiled });
      } catch {
        await appendJournal(journal, { state: "unknown_or_withheld", id: c.id, operationId });
        throw deny(); // NEVER replay, auto-retry, replace an ID, cancel or refund an ambiguous dispatch.
      }
    }
    const report = {
      version: fixtures.version,
      fixture_sha256: fixtures.fixture_sha256,
      execution_path: "generateAI",
      origin,
      ...compiled,
      source_sha256: fixtures.source_sha256,
      endpoint: { model: MODEL, tag: PROVIDER, provider: plan.response_provider },
      results,
    };
    const handle = await open(resolve(runDirectory, "results.json"), "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(report, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    console.log(
      JSON.stringify({
        status: "complete",
        calls: results.length,
        cost_usd: results.reduce((s, r) => s + r.cost_usd, 0),
        human_review: "not_performed",
        production_changed: false,
      }),
    );
  } finally {
    await Promise.allSettled([server?.close(), journal?.close(), sql.end({ timeout: 5 })]);
    for (const [k, v] of Object.entries(previous))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length === 4 && process.argv[2] === "--prepare")
    preparePaidPlan(process.argv[3]).catch(() => {
      console.error("Evaluation plan preparation failed; no paid request was made.");
      process.exitCode = 1;
    });
  else if (process.argv.length !== 4 || process.argv[2] !== "--run") {
    console.error(
      "Usage: node scripts/eval-ai-paid.mjs [--prepare <new-private-plan.json> | --run <private-reviewed-plan.json>]. Local-only; no production policies are changed.",
    );
    process.exitCode = 1;
  } else
    runPaid(process.argv[3]).catch(() => {
      console.error(
        "Bounded evaluation stopped. Reconcile the private journal; do not automatically retry or reset any allowance.",
      );
      process.exitCode = 1;
    });
}
