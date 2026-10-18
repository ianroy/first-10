# AI usage budget foundation (AI-004)

This migration installs accounting, not permission to spend. **General AI stays disabled and the global stop also closes the fixed workshop generator until an operator explicitly reviews it.** No paid requests were made to build or test this foundation. `generateAI` and the gateway now use these controls, but activation still requires reviewed operator configuration, current eval evidence, and the AI-007 consent-version work. General paid routes remain disabled. No product model quality pass is claimed.

## Run ceiling and opening balance

The authorized run ceiling is **$25 total**. The entire existing fixed fictional marketing allowance of $1 is carved out permanently; its historical reservations are never refunded. General AI has at most **$24 including all pre-ledger general spending and uncertain earlier requests**. The opening hold is not new money. An unknown historical charge must receive a conservative hold, not a zero estimate. Review account/provider records before setting an opening balance. If that cannot establish a defensible bound, leave general AI disabled.

`ai_usage_global_policy` initially has `global_stop=true`, `general_enabled=false`, and no reviewed opening hold. No route, user, or project allowance is seeded. All tables are in `firstten_private`, have RLS, and deny direct access to anonymous, authenticated, and service roles. Browser requests cannot set cost, grant limits, reconcile unknown charges, or change policy. A platform-admin app grant is not an operator SQL grant.

Amounts are integer microdollars (1 USD = 1,000,000). The service settles only a trustworthy OpenRouter account charge, rounded upward; the original cost number stays in the content-free settlement. Input/output tokens, model, provider and generation ID are retained. Prompts, source text and drafts are not stored in the ledger.

## Route review before enabling

A reviewed operator SQL transaction must lock the singleton global policy **before** modifying route/allowance rows. Record a short ticket reference, not student information. Policy mutation triggers append a content-free audit event. Do not delete accounting or audit records to regain allowance. Deleting an auth user/project does not delete historical charges.

For each existing kind (`questions`, `synthesis`, `stage2`, `stage3`), create a new version with:

- One exact model ID from the migration's small candidate allowlist, one exact reviewed provider endpoint slug, and a bounded list of expected response provider names. An allowlisted model is a candidate, not a quality approval.
- A route purpose (`product` or `eval_only`) and hashes of the corresponding reviewed quality evidence/evaluation plan and endpoint/billing-bound review; checks expire within 24 hours. No automatically refreshed timestamp is acceptable. Root must promote routes only after the existing eval quality gate passes.
- Reviewed endpoint input/context token ceiling, total **billable** output ceiling, UTF8 application input-byte cap, and upper input/output prices in microdollars per million tokens. All fields are required and positive.
- Explicit user and owner/project ledger-lifetime/daily money limits, concurrency and one-minute start limits. Choose these allowances with prior scoped spending in mind; only the global opening hold represents pre-ledger spending, so scoped counters themselves cover this ledger. There are no default user grants and no class/teacher access to private work.

An `eval_only` route is a distinct bootstrap: its quality hash binds a reviewed **synthetic evaluation plan**, never a claim of model quality, paid-evaluation completion, or human approval of generated drafts. It requires one exact evaluation user UUID and project UUID, a fresh trusted `auth.users.raw_app_meta_data.synthetic=true` marker, and an allowlist of 1–32 SHA256 hashes of the exact authorized assembled prompt/schema/version binding. A user-editable synthetic marker or checklist is insufficient. SQL checks this scope/hash/marker at reservation and again at claim. Editing the synthetic project cannot authorize new context. Provision only that fictional evaluation user's/project's limited allowances for a bounded future evaluation. Product routes require actual promotion evidence; a plan hash alone is insufficient. No product route, synthetic evaluator, or allowance is provisioned by this migration, and no paid evaluation was run.

The reservation is the upward-rounded price of the **entire reviewed endpoint input/context ceiling plus bounded billable output**. This deliberately over-reserves relative to a short actual prompt. A byte length or local token estimate is not a tokenizer proof. If endpoint context limits, reasoning billing, cache accounting, routing, tools, media, plugins or fees cannot fit the verified all-in bound, do not enable that route. The foundation only supports one text-only paid attempt. It does not approve tools, plugins, media, model fallback, provider fallback, or automatic retries.

The server returns endpoint parameters with an exact model, provider `only`/`order`, `allow_fallbacks=false`, `require_parameters=true`, no data collection, ZDR, `max_tokens` and input/output `max_price`. Privacy settings can make a route unavailable; they must not be silently relaxed. Base provider slugs can include regional variants; review endpoint identity and observed provider metadata rather than assuming one base slug pins a region.

## Enforced request flow and remaining activation gates

1. Keep every AI call under `generateAI`; first perform the current fresh identity and permission-scoped context checks. Use the exact authorized prompt, schema, prompt/schema IDs and versions to create the SHA256 binding through `budgetInputBinding`: JSON object keys sort recursively, arrays keep their order, and literal strings stay unchanged; the binding includes system/user/schema plus exact prompt/schema IDs and versions. Never hash the provider key. Refresh processing permissions immediately before dispatch; a reservation is not consent.
2. Use a stable server-validated operation intent across duplicate client deliveries. `useAIIntent` retains an identifier in owner/project/kind-scoped session storage across ambiguous responses and remounts; only an acknowledged success or an explicit new-request action permits a new identifier. No prompt or draft is stored there. `prepareAIBudget` requires that stable UUID and never invents a replacement for a retry. Do not expose a separate browser-accessible service budget API.
3. Reserve through the service-only RPC using the verified owner/project. Import the service client only after fresh `getUser`; SQL independently checks current auth-user existence and project ownership. Price/caps/model are read from operator policy, never supplied by the browser.
4. Claim immediately before the provider call. Dispatch **only** on the one positive `dispatch:true` acknowledgement. A repeated claim, a lost acknowledgement, or a malformed receipt never permits another provider call. One attempt ID is single-use, even when the same caller retries it. The gateway enforces the returned model/provider/output policy and one HTTP attempt; environment model overrides cannot replace operator policy.
5. Record trusted provider usage and settle before returning a validated draft. Missing cost/generation/usage metadata, timeouts, aborted connections and ambiguous HTTP failures retain the full hold. Do not treat missing `usage.cost` as 0. A provider request may have been billed even when output parsing/schema validation fails. The schema-invalid draft may settle known usage, with `outputValid=false` and no returned result.
6. On known price/model/provider/token policy violations, settle the actual charge, withhold output, and stop future dispatches. A duplicate generation ID holds the second operation at its full reservation and commits the global stop. Never retry because recording failed. Unknown reservations and their concurrency slots do not expire automatically.
7. Upgrade immutable eval fixtures/source bindings after this entrypoint/gateway change (v4 is a separate coordinated integration). Actual-handler and gateway tests cover stable replay, lost claim acknowledgements, billed invalid drafts and budget failures. Keep general routes disabled until the current quality gate, operator balance review and AI-007 controls are complete. These offline checks do not prove model quality or authorize product promotion.

The fresh authorized-context reload happens immediately before the separate SQL dispatch claim. This is **not an atomic consent-version fence**: withdrawal can race the gap or arrive after dispatch. In-flight/transmitted requests cannot be recalled. AI-007 must bind reviewed consent/source versions at the dispatch boundary before stronger guarantees or broader activation are claimed. A detected permission/source change cancels only an unclaimed reservation and sends no provider request.

The fixed fictional route retains its strict pre-existing $1 ledger and checks, plus the new shared global stop. The $1 carveout includes all its previous and future activity. Its standalone cents reservation is not a general-route grant or a verified actual-cost ledger.

## Stop, reconcile and disable

Use a reviewed owner SQL session. No browser admin panel or service-role key may run these operator actions. Do not include credentials in a query, ticket, log or test expectation.

```sql
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT singleton FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
UPDATE firstten_private.ai_usage_global_policy
 SET global_stop=true, operator_reference='review-ticket-stop'
 WHERE singleton;
COMMIT;
```

Stopping blocks new general dispatch claims and new workshop reservations; it cannot recall in-flight/transmitted requests. Previously dispatched service settlements must remain available to record real charges. Revoking/removing a user/project allowance, reducing a current cap below total existing holds, or disabling/changing a route also prevents a stale reserved operation from dispatching. Rate and concurrency reductions are checked again at claim.

Only the operator may call `firstten_private.close_unknown_ai_usage(operation_uuid,'review-ticket')` after an actual uncertainty review. It releases the concurrency slot **without releasing the money hold**. Later trusted provider metadata can reconcile that operation through the same settlement service boundary. The provider generation metadata endpoint can help find an account charge; failure/not-found alone is not proof of no charge. There is no browser refund path. Cancellation releases money only while the DB state proves the operation has not been claimed.

Rollback: set the global stop, disable routes, revoke public service RPC execution, and keep the historical tables. Dropping ledgers or restoring an old cents-only function would lose the combined ceiling. Do not reset opening holds to manufacture remaining allowance. External key/account spend limits can add defense but are not modified by this task and do not replace atomic application accounting. No key rotation or key-setting changes were performed.

## Local verification

`PATH=/Users/ianroy/.local/bin:$PATH npm test -- src/tests/ai-004` tests contracts and lost/duplicate acknowledgements without any provider call. All environments are synthetic before helper invocation.

`PATH=/Users/ianroy/.local/bin:$PATH node scripts/check-ai-budget-concurrency.mjs` requires the exact local Docker container bound to 55322. It creates a randomly named `firstten_ai_budget_test_[hex8]` database, restores **schema only**, applies 14000 there (or tests its already-installed schema with migration-default singleton data), runs all rollback PgTAP fixtures, and tests concurrent reservations/claims in independent committed sessions. It drops only that created database and verifies absence. It never copies source rows or changes the source database's policy. Do not point this runner at another stack or hosted Supabase.

## Official parameter and billing references (reviewed2026-10-18)

OpenRouter's [provider selection documentation](https://openrouter.ai/docs/guides/routing/provider-selection) defines provider filters/fallback behavior and `max_price` **per million tokens**, not a per-request dollar cap. Exact regional/provider selection needs endpoint review.

The [usage accounting guide](https://openrouter.ai/docs/cookbook/administration/usage-accounting) describes `usage.cost` as the account charge; upstream inference cost is a separate field. Native token counts and reasoning/cache details may differ from a local estimate. The [generation metadata endpoint](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation) exposes generation ID, provider, native usage and `total_cost` for authenticated reconciliation.

The [parameters reference](https://openrouter.ai/docs/api_reference/parameters) says the output limit includes reasoning and visible output **on most providers**. That qualification is why an endpoint-specific reviewed total billable bound is required rather than assuming all providers work identically. The [current key metadata reference](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key) documents key limits and remaining allowance; account/key controls provide a separate layer, not transactional user/project budgets.
