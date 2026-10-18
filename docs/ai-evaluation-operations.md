# Bounded synthetic evaluation (AI-003 v6)

The software supports eight sequential synthetic calls through the **existing authenticated `generateAI`**. This is not an evaluation result or authorization to enable a route. No paid calls, model-quality scores, named human review or product promotion have been performed by this implementation. The $0.90 evaluation ceiling is inside the run's $25 total, with the permanent $1 workshop carve-out and general opening hold unchanged.

## Offline checks

Use Node 22:

```sh
node scripts/eval-ai.mjs --plan
node scripts/eval-ai.mjs --baseline
node --test src/tests/ai-eval/runner.test.mjs
node --test src/tests/ai-eval/runtime-adapter-v6.test.mjs
npx vitest run src/tests/ai-003
```

The runtime test starts a loopback Vite server on port 55889, substitutes only a synthetic provider key, blocks external fetch destinations, discovers the actual compiled function ID, and sends a real SDK-framed request. The app's actual authentication middleware rejects its invalid token before any provider access. It also rejects a stale function ID. This proves invocation compatibility and denial behavior; it does not prove a paid response or a provider's eligibility.

`check-sql-parity-v6.mjs` is a separate, explicitly approved Docker rehearsal. It guards the exact dedicated Supabase container, all port mappings on 55322, a new schema-only clone and zero copied users/projects. It stages all eight cases under the real authenticated RLS role, uses the real consent RPC and compares the complete real `get_ai_processing_context_v2` response with v6. Everything rolls back; the clone is dropped and its absence verified. It does not copy source rows, apply migrations, activate policies or write to the original or hosted database. Do not run it against another container.

## Operator prerequisites, currently unmet

Paid execution is **local-only** initially. Production/hosted origins are deliberately rejected because no reviewed hosted staging adapter exists. Never paste production research or a production login into this run.

1. Review the actual account's prior charges/uncertainty and establish a defensible opening hold. Preserve every existing charge, reservation, audit and history entry. Keep the permanent workshop carve-out. Never reset a ledger to make the evaluation fit.
2. Supply an explicitly isolated local runtime and trusted synthetic evaluator `fa030000-0000-4000-8000-000000000003`. The marker must be `auth.users.raw_app_meta_data.synthetic=true`, not user-editable metadata. Its fixed evaluation project `fa030000-0000-4000-8000-000000000002` must **not exist** at the start. If any earlier run created it, stop and reconcile; the runner does not erase it or resume uncertain requests.
3. Review the exact model `google/gemini-2.5-flash-lite`, standard endpoint `google-vertex`, provider response name, structured-output support, privacy/account eligibility and the full billable input/output bound. Current metadata must match the reviewed plan. The route must reserve the entire endpoint context ceiling and 2,500 bounded billable output tokens. Reasoning, caching, fees or unavailable privacy behavior that invalidate that bound block execution.
4. Create explicit `eval_only` DB routes for each of the four existing kinds, exact evaluator/project, and that kind's two immutable v6 assembled context hashes. Bind quality hash to the synthetic **plan**, not a quality claim; bind billing/endpoint review independently. Provision small explicit evaluator/project allowances and fresh bounded route expiry. The runner neither creates these grants nor changes policy. Missing/global-stop/expired/insufficient gates fail closed through the real budget RPC.
5. Provide the **actual serving runtime key**, dedicated, non-resetting and capped at at most $0.90 including BYOK, non-management, with remaining allowance for the full worst-case next reservation. Every evaluation request checks that exact key against the official fixed `/api/v1/key` endpoint server-side with a 5-second timeout, no redirects, a 16KiB body limit and no response/key logs. An unlimited ambient key is never an alternative.

## Prepare and run

```sh
node scripts/eval-ai-paid.mjs --prepare /private/tmp/first-ten-eval-plan.json
```

Preparation generates a **blank, unapproved** 0600 plan from current immutable fixtures and the actual Vite client transform. No credentials are read and no network or provider request is made. Fill the operator reference/date, exact reviewed endpoint/billing evidence hash, route versions, response provider and private runtime/output paths. Compute `evaluation_plan_sha256` with the exported `reviewedPlanBinding(plan)` after reviewing it; that canonical binding includes the origin, actual compiled function/transform, fixture/source/runner/staging hashes, scope, route versions, limits and endpoint review. A plan expires after 24 hours and cannot approve changed source by refreshing only hashes.

The runtime JSON file must be a regular, nonsymlink file owned by the current OS user with mode 0600 (or stricter), containing only explicit isolated runtime values:

```json
{
  "database_url": "postgres://OPERATOR:PASSWORD@127.0.0.1:55322/postgres?sslmode=disable",
  "SUPABASE_URL": "http://127.0.0.1:55321",
  "SUPABASE_PUBLISHABLE_KEY": "EXPLICIT_LOCAL_KEY",
  "SUPABASE_SERVICE_ROLE_KEY": "EXPLICIT_LOCAL_SERVICE_KEY",
  "OPENROUTER_API_KEY": "EXPLICIT_DEDICATED_CAPPED_EVALUATION_KEY",
  "access_token": "EXPLICIT_SYNTHETIC_EVALUATOR_ACCESS_TOKEN"
}
```

These are placeholders, not credentials. Never commit the filled file, plan, private journal, generated draft or access token. The runner requires separate operator approval before staging the original local database; clone approval does not grant it. Do not run until every prerequisite is verified:

```sh
node scripts/eval-ai-paid.mjs --run /private/tmp/first-ten-eval-plan.json
```

The runner starts its own isolated loopback Vite runtime, with explicit runtime credentials substituted before server imports. It never sends a bearer token to arbitrary origins; HTTP is limited to `127.0.0.1` on a reviewed 558xx/559xx port and the exact generated server-function path. The SDK fetch hook prohibits redirects, retries and a second attempt. The exact `createServerFn(createClientRpc(...))` compiled client wrapper handles TanStack serialization and response framing; no invented server protocol or direct provider path exists.

For each case, it durably journals one stable operation UUID **before** staging/dispatch. It updates only the fixed fictional project and reserved child IDs, uses actual authenticated CRUD/consent RPCs, preserves consent history and every accounting/audit record, and compares the actual server permission projection and assembled prompt with the immutable case. No fixture text is accepted by `generateAI`. Each case uses distinct fixed child IDs, preventing source identity reuse across cases. Existing unrelated content or a preexisting evaluation project blocks staging.

The server rechecks fresh evaluator identity, exact eval-only route/user/project/context binding and key metadata before the existing atomic claim. The current permission/version fence still controls dispatch. Ordinary requests cannot bypass an eval-only route's key cap by omitting `withEvaluation`; demo and `withOrigin` combinations are rejected. Product/default response shapes are unchanged.

After the actual gateway, known-cost settlement and provenance write, the evaluation response contains the validated `{draft,grounding}` and only measured billing/model/provider/generation/finish/latency metadata with operation, attempt, source-context and route-version binding. Missing finish reason/latency/cost are not invented. Billed invalid output can settle as invalid, but returns no draft. Unknown outcomes retain their holds and stop the entire run. The journal is 0600, the new output directory 0700; stdout has only call/cost/status summaries. A crash/lost acknowledgement is never automatically replayed or given a new ID.

## Review and promotion

Use the private `results.json` and an independently filled, named, dated output-hash-bound review packet with the offline scorer. The blank human review must fail. Mechanical checks cover schema, reference integrity, exact quotes, unsupported assertion patterns and recent-behavior rules; they do not establish truth or teaching value. Per-kind costs and p95 describe only the eight measured synthetic calls. A passing report permits operator review only and **never enables a product route**. AI-005/006 privacy, comparison and promotion work remains necessary.

Any pending/unknown journal entry, stale source/route/permission binding, changed provider/endpoint, missing exact scope/allowance/opening hold, inadequate key budget or unavailable privacy setting stops the run. Reconcile existing outcomes first; do not reset accounting, auto-retry, silently switch models or relax privacy.
