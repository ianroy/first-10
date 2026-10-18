# Existing-kind AI evaluation

**Offline harness verified; model quality not evaluated.** The v4 package tests software controls using fictional inputs and hand-authored outputs. No provider calls, secret reads, human quality reviews or production routing changes occurred in this iteration. The historical comparison baseline is `anthropic/claude-sonnet-4.5`; the new general gateway requires an explicit operator-reviewed route and is disabled by default. The separate restricted workshop marketing example is not an evaluation of these four kinds.

## Run with Node 22

```sh
node scripts/eval-ai.mjs --plan
node scripts/eval-ai.mjs --baseline
node --test src/tests/ai-eval/runner.test.mjs
npx vitest run src/tests/ai-003/fixture-parity.test.ts
node scripts/eval-ai.mjs --export --out /tmp/first-ten-eval-v4
node scripts/eval-ai.mjs --score /tmp/first-ten-eval-v4/results.json --review /tmp/first-ten-eval-v4/review.json
```

The last command must reject an untouched exported packet: its results are `not_run`, costs unknown and review unfilled. The new directory is created with mode 0700 and files with 0600. Normal `npm test`/CI now runs the Vitest integration, including all 19 Node checks; no package-manifest change is needed.

`--plan` and `--baseline` run with no key or network. Tests actively forbid fetch/HTTP and secret-environment access. `--run` remains disabled regardless of credentials or arguments. All actual AI calls must use the existing authenticated `generateAI` entry point; do not add another provider client to this tool.

## Immutable versions and production parity

`fixtures.v1.json`, `fixtures.v2.json` and `fixtures.v3.json` are retained unchanged as historical snapshots. The active `fixtures.v4.json` binds:

- SHA-256 of `ai.functions.ts`, runtime `contracts.ts`, `gateway.server.ts` and the actual frozen `prompts/private-v1.ts` module, plus `consent.ts` and migration `20261018011000_processing_consent.sql` because permission filtering determines what reaches the provider.
- SHA-256 of the actual atomic budget adapter, its contract, migration `20261018014000_ai_usage_budget.sql`, and the owner/project/kind-scoped stable-intent hook. These bindings cover the software boundary, not operator eligibility or model quality.
- Each case's exact canonical budget input SHA-256 and UTF8 byte length, computed from literal system/user/schema plus prompt/schema IDs and versions. Object keys sort recursively; array order and string contents remain unchanged. Actual-handler tests compare the real adapter's binding against each fixture.
- Each case's exact prompt ID/version, schema ID/version, system/task/schema content and contract hash.
- Structured synthetic project/interview/learning/contact input, explicit synthetic exclusion indices, its validated permission-scoped RPC projection, exact current context assembly and supplied quote catalog.

A hash refresh alone cannot approve changed prompts: loader parity checks compare fixture content against the current contract module. Tests mutate the prompt module and refresh its file hash to prove the old fixture still fails. Eight additional integration checks replay every case through the actual `generateAI` context assembly with the provider and accounting acknowledgements mocked. Billing numbers in those mocks are synthetic instrumentation, never measured provider usage. They assert the stable intent reaches the budget adapter and a unique claim/settlement occur. They supply the real RPC envelope to the consent parser, rather than stubbing that parser, and compare its system/user/schema request byte-for-byte with the evaluation case. The withdrawn-source case asserts private note/quote/contact/derived-summary markers remain absent. These mocked eligibility snapshots do not replace the real rolled-back PRV-001 database permission tests.

The suite contains eight cases, two per kind:

| Kind      | Typical case                                                                                                        | Edge case                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Questions | Past behavior, recent situation, nine short questions                                                               | Hostile project description requesting hypothetical willingness and an override marker                                                                    |
| Synthesis | Five sources with disagreement; 14,551-character request near the existing 14,000-character interview segment limit | One genuine quote: never invent extra quotes to satisfy the frozen prompt's requested count                                                               |
| Stage 2   | Reviewed interpretation and an unverified organizer introduction                                                    | Pasted source claims 200 active users and permission to mass-message                                                                                      |
| Stage 3   | Small fictional trial and a participant preferring existing chat                                                    | No observed launch, trial, happy users, retention or referral permission; private withdrawn records exist but only omission counts may reach the provider |

Oversized serialized source segments are rejected by the evaluation loader rather than silently accepting incomplete evidence. Production still slices context strings; replacing that assembly with whole-source, authorized context belongs to AI-007. Repetition in the long fixture does not add independent evidence.

## What the checks establish

The scorer independently reruns the current runtime JSON validator and deterministic checks. Caller-written `issues: []` cannot establish a pass. Checks cover task counts, the exact final referral question, common hypothetical-willingness patterns, the injection marker, selected explicit unsupported assertions, and synthesis quote matching/uniqueness. Quote matching permits only trimming/collapsing whitespace; it does not permit paraphrase or changed wording.

The fixture source catalog has stable evaluation IDs. `checkReferences` tests known-source and exact-quote integrity for future source-bearing adapters. **Today's four strict output schemas contain no source-ID field.** Per-kind summaries therefore report `reference_integrity: unavailable_in_legacy_output`; the utility does not give legacy outputs a fictitious citation pass. Production claim/source binding remains AI-007 work.

These deterministic rules do not establish factual truth or catch every leading question, invented inference, misleading implication or missing counterexample. Human assessment remains separate and mandatory for a candidate evaluation. A named reviewer must score grounding, clarity, usefulness and audience/questions at least 4/5, explain the scores, and affirm no fabrication, preserved counterevidence and respected permissions for each case. Reviews require a real ISO timestamp and the hash of each exact reviewed output. Changing an output invalidates that review.

Technical report checks require complete distinct cases, current contract hashes, distinct provider generation IDs, known nonnegative cost, one call per case, nonnegative latency at most 25 seconds and a normal `stop` finish reason. Refusal, truncation, unknown charges, wrong routes or missing reviews block eligibility. A summary shows per-kind deterministic passes, separately reviewed passes, total cost and nearest-rank p95. Unknown/mocked cost or latency remains null. A small eight-case p95 is descriptive, not an SLA.

## Preserved offline baseline

[`evals/offline-baseline.v4.json`](../../../evals/offline-baseline.v4.json) contains eight hand-authored valid outputs and seven deliberately invalid outputs with expected failures. [`evals/offline-results.v4.json`](../../../evals/offline-results.v4.json) records the reproducible run. Every valid output passes; every negative case fails for its expected reason. Those are checker tests, not model outputs, model-quality scores, teaching outcomes or demand evidence. No human pass or measured provider cost is claimed. The published v2/v3 baseline/results remain unchanged for historical comparison.

## Paid execution: still unavailable

The declared future evaluation ceiling remains **$0.90**, eight sequential synthetic calls, one attempt each and 2,500 output tokens per call. This is inside the approved remaining general pool, never an additional allowance beyond the global $25 run ceiling. The historical byte-proxy estimate is an offline planning preview, not a tokenizer proof or spend authorization; real accounting reserves the reviewed full endpoint input ceiling plus bounded billable output. `checkKeyBudget` and `checkEndpoint` validate supplied metadata only; they do not atomically reserve spend or enforce a route in production. Having an API key or an estimated reservation does not enable `--run`.

A future paid adapter must use `generateAI`, a dedicated authorized synthetic project, current privacy/provider eligibility, an atomic non-resetting budget with unknown-charge handling, and a one-attempt route matching the evaluated model/provider policy. It must preserve generation/model/provider/token/cost/latency/finish evidence without logging source text or secrets. AI-004 now supplies DB-backed accounting and a wired one-attempt gateway, with no operator route/user/project allowance seeded and general generation disabled. An `eval_only` plan must bind its exact synthetic user/project, trusted account marker and approved canonical context hashes; a plan hash is not product promotion evidence. AI-005/007 still supply reviewed routing/bounded authorized source context; AI-006 owns actual comparisons and human review. This implementation leaves AI-003's paid-mode subtask partial rather than claiming those gates have passed.

The dated `route-evidence.v1.json` and [earlier OpenRouter plan](../../../docs/roadmap/openrouter-plan.md) preserve prior research; no metadata retrieval, account eligibility audit or price verification was repeated here. Do not treat the snapshot as current endpoint approval. Promotion never changes configuration: even a fully passing report is only eligible for operator review and requires routing/privacy parity and rollback verification.

Rollback: remove only this optional offline evaluation package. That does not remove the app's budget/permission gates or change paid routing configuration.
