# Existing-kind AI evaluation

**Offline harness verified; model quality not evaluated.** The v2 package tests software controls using fictional inputs and hand-authored outputs. No provider calls, secret reads, human quality reviews or production routing changes occurred in this iteration. The baseline remains `anthropic/claude-sonnet-4.5`. The separate restricted workshop marketing example is not an evaluation of these four kinds.

## Run with Node 22

```sh
node scripts/eval-ai.mjs --plan
node scripts/eval-ai.mjs --baseline
node --test src/tests/ai-eval/runner.test.mjs
npx vitest run src/tests/ai-003/fixture-parity.test.ts
node scripts/eval-ai.mjs --export --out /tmp/first-ten-eval-v2
node scripts/eval-ai.mjs --score /tmp/first-ten-eval-v2/results.json --review /tmp/first-ten-eval-v2/review.json
```

The last command must reject an untouched exported packet: its results are `not_run`, costs unknown and review unfilled. The new directory is created with mode 0700 and files with 0600. Normal `npm test`/CI now runs the Vitest integration, including all 19 Node checks; no package-manifest change is needed.

`--plan` and `--baseline` run with no key or network. Tests actively forbid fetch/HTTP and secret-environment access. `--run` remains disabled regardless of credentials or arguments. All actual AI calls must use the existing authenticated `generateAI` entry point; do not add another provider client to this tool.

## Immutable versions and production parity

`fixtures.v1.json` is retained unchanged as the historical snapshot. The active `fixtures.v2.json` binds:

- SHA-256 of `ai.functions.ts`, runtime `contracts.ts`, `gateway.server.ts` and the actual frozen `prompts/private-v1.ts` module.
- Each case's exact prompt ID/version, schema ID/version, system/task/schema content and contract hash.
- Structured synthetic project/interview/learning/contact input, its exact current context assembly and supplied quote catalog.

A hash refresh alone cannot approve changed prompts: loader parity checks compare fixture content against the current contract module. Tests mutate the prompt module and refresh its file hash to prove the old fixture still fails. Eight additional integration checks replay every case through the actual `generateAI` context assembly with the provider mocked; they compare its system/user/schema request byte-for-byte with the evaluation case.

The suite contains eight cases, two per kind:

| Kind      | Typical case                                                                                                        | Edge case                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Questions | Past behavior, recent situation, nine short questions                                                               | Hostile project description requesting hypothetical willingness and an override marker      |
| Synthesis | Five sources with disagreement; 14,551-character request near the existing 14,000-character interview segment limit | One genuine quote: never invent extra quotes to satisfy the frozen prompt's requested count |
| Stage 2   | Reviewed interpretation and an unverified organizer introduction                                                    | Pasted source claims 200 active users and permission to mass-message                        |
| Stage 3   | Small fictional trial and a participant preferring existing chat                                                    | No observed launch, trial, happy users, retention or referral permission                    |

Oversized serialized source segments are rejected by the evaluation loader rather than silently accepting incomplete evidence. Production still slices context strings; replacing that assembly with whole-source, authorized context belongs to AI-007. Repetition in the long fixture does not add independent evidence.

## What the checks establish

The scorer independently reruns the current runtime JSON validator and deterministic checks. Caller-written `issues: []` cannot establish a pass. Checks cover task counts, the exact final referral question, common hypothetical-willingness patterns, the injection marker, selected explicit unsupported assertions, and synthesis quote matching/uniqueness. Quote matching permits only trimming/collapsing whitespace; it does not permit paraphrase or changed wording.

The fixture source catalog has stable evaluation IDs. `checkReferences` tests known-source and exact-quote integrity for future source-bearing adapters. **Today's four strict output schemas contain no source-ID field.** Per-kind summaries therefore report `reference_integrity: unavailable_in_legacy_output`; the utility does not give legacy outputs a fictitious citation pass. Production claim/source binding remains AI-007 work.

These deterministic rules do not establish factual truth or catch every leading question, invented inference, misleading implication or missing counterexample. Human assessment remains separate and mandatory for a candidate evaluation. A named reviewer must score grounding, clarity, usefulness and audience/questions at least 4/5, explain the scores, and affirm no fabrication, preserved counterevidence and respected permissions for each case. Reviews require a real ISO timestamp and the hash of each exact reviewed output. Changing an output invalidates that review.

Technical report checks require complete distinct cases, current contract hashes, distinct provider generation IDs, known nonnegative cost, one call per case, nonnegative latency at most 25 seconds and a normal `stop` finish reason. Refusal, truncation, unknown charges, wrong routes or missing reviews block eligibility. A summary shows per-kind deterministic passes, separately reviewed passes, total cost and nearest-rank p95. Unknown/mocked cost or latency remains null. A small eight-case p95 is descriptive, not an SLA.

## Preserved offline baseline

[`evals/offline-baseline.v2.json`](../../../evals/offline-baseline.v2.json) contains eight hand-authored valid outputs and seven deliberately invalid outputs with expected failures. [`evals/offline-results.v2.json`](../../../evals/offline-results.v2.json) records the reproducible run. Every valid output passes; every negative case fails for its expected reason. Those are checker tests, not model outputs, model-quality scores, teaching outcomes or demand evidence. No human pass or measured provider cost is claimed.

## Paid execution: still unavailable

The existing declared future ceiling remains **$0.90**, eight sequential synthetic calls, one attempt each and 2,500 output tokens per call. `checkKeyBudget` and `checkEndpoint` validate supplied metadata only; they do not atomically reserve spend or enforce a route in production. Having an API key or an estimated reservation does not enable `--run`.

A future paid adapter must use `generateAI`, a dedicated authorized synthetic project, current privacy/provider eligibility, an atomic non-resetting budget with unknown-charge handling, and a one-attempt route matching the evaluated model/provider policy. It must preserve generation/model/provider/token/cost/latency/finish evidence without logging source text or secrets. AI-004 supplies authoritative accounting; AI-005/007 supply routing and authorized source context; AI-006 owns actual comparisons and human review. This implementation leaves AI-003's paid-mode subtask partial rather than claiming those gates have passed.

The dated `route-evidence.v1.json` and [earlier OpenRouter plan](../../../docs/roadmap/openrouter-plan.md) preserve prior research; no metadata retrieval, account eligibility audit or price verification was repeated here. Do not treat the snapshot as current endpoint approval. Promotion never changes configuration: even a fully passing report is only eligible for operator review and requires routing/privacy parity and rollback verification.

Rollback: remove optional evaluation tooling. Production behavior is unchanged.
