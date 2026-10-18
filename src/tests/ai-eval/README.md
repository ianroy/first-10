# Existing-kind AI evaluation

**Offline harness verified; model quality not evaluated.** The v5 package uses fictional inputs and hand-authored outputs. Provider calls, secret reads, human quality reviews and production routing changes are absent. General paid AI remains disabled pending reviewed routing, bounded synthetic comparisons and human review. The fixed fictional workshop practice is separate.

## Run with Node 22

```sh
node scripts/eval-ai.mjs --plan
node scripts/eval-ai.mjs --baseline
node --test src/tests/ai-eval/runner.test.mjs
npx vitest run src/tests/ai-003/fixture-parity.test.ts
node scripts/eval-ai.mjs --export --out /tmp/first-ten-eval-v5
node scripts/eval-ai.mjs --score /tmp/first-ten-eval-v5/results.json --review /tmp/first-ten-eval-v5/review.json
```

The untouched exported packet must fail scoring: results are `not_run`, costs unknown and reviews unfilled. The new export directory uses 0700 and files 0600. Normal `npm test` runs actual-handler parity plus all 19 Node harness checks. `--plan` and `--baseline` forbid network and key access in tests. `--run` stays disabled regardless of credentials. Every future provider call must use authenticated `generateAI` and its database accounting/source fence.

## Immutable snapshots and actual code parity

Published fixture versions v1–v4 and baseline/results v2–v4 remain byte-for-byte historical evidence. Active `fixtures.v5.json` binds sixteen exact production files, including the actual context assembler, private-v2 prompt/schema, grounding validator, gateway, budget adapter, provenance adapter and migrations 11000/14000/17000. Each case binds exact prompt/schema IDs and versions, contract content hash, literal system/user/schema, canonical budget input hash and UTF-8 byte length, selected source identities/permission revisions and packing omission counts. Refreshing hashes alone cannot approve changed wording: loader tests mutate the actual frozen prompt module and refresh its hash, then require parity failure.

Eight actual-handler cases supply a synthetic version-2 RPC envelope, pass through the real assembler/validator, and compare the provider arguments and fenced budget manifest against the fixture. Source permission logic itself is separately tested with real rollback SQL and overlapping source/withdrawal races; a mocked RPC acknowledgment does not certify ownership. Mocked billing fields are instrumentation, not measured provider usage. All tests substitute a synthetic key before invocation and assert its identity as a boolean before any full argument diff.

The versioned fixture RPC projection retains literal content, excludes explicitly withheld records, applies conservative learning withholding and whole-record caps, and gives each fictional record a stable UUID, content hash and opaque source ID. The helper reproduces PostgreSQL jsonb text serialization for these literal fixture values; SQL tests independently verify live source/version enforcement. Contact names and arbitrary extra fields are absent. `source_catalog` contains only selected interview quote fields, not omitted or withdrawn quotes. Multiple quotes may share a record source ID.

| Kind      | Typical                                                                                                             | Edge                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Questions | Nine recent-behavior questions                                                                                      | Hostile idea text requesting hypothetical willingness and an override marker                                                       |
| Synthesis | Disagreement, an original oversized record omitted intact, and a complete long fictional log inside the packing cap | One actual quote; do not invent more to meet a requested count                                                                     |
| Stage2    | Reviewed interpretation and an unverified introduction                                                              | Pasted claims of 200 users and permission to mass-message                                                                          |
| Stage3    | Small fictional trial with a participant preferring existing chat                                                   | No observed launch/trial/retention/referral permission; withdrawn private note, quote, contact and derived summary remain excluded |

The original long input remains intact. The additional repeated log is one unverified fictional source, not independent corroboration. A provider request longer than 14,000 characters exercises whole-record packing. Oversized records are counted and withheld, never sliced. Tests separately verify Unicode, deterministic packing, malformed scopes and preserved originals.

`build-fixtures-v5.mjs` records how v5 was authored from immutable v4 inputs/baseline and the actual current assembler. It uses exclusive creation and refuses to overwrite an existing v5 artifact. Do not run it as a hash refresh. If any bound source changes, review the semantics and create a new immutable version with actual-handler parity; preserve all prior files. The source commit is provenance context; exact file and per-case content hashes are the runtime gate.

## Structured grounding and scoring

Private-v2 provider output is `{draft,grounding}`. Existing UI cards receive the unwrapped legacy draft; output classifications are validated and stored as content-free metadata, with a future full source-inspection UI still separate. Synthesis quotations must reference a selected interview and match an entire recorded `answers[].quote`, allowing whitespace normalization only. Notes, learning summaries, paraphrases, invented IDs and repeated quotations fail. Every other string leaf needs an inference/proposal classification and valid references; an inference needs selected interview/learning evidence. Questions are proposals. Authenticity and omission limits must be disclosed.

The scorer reruns the actual grounding/runtime validator plus task checks; edited `issues: []` cannot fake a pass. These software checks do not prove truth, inference quality, respondent authenticity, participant consent or teaching outcomes. Per-kind reference integrity means mechanical v2 validation, never a human quality pass. A named reviewer must independently score grounding, clarity, usefulness and audience/questions at least 4/5, explain the judgments and affirm no fabrication, respected permissions and preserved counterevidence. Review timestamps must be real ISO dates and each review binds the exact output hash.

A technical report must contain eight distinct cases and generation IDs, current contracts, known nonnegative provider cost, exactly one call per case, latency 0–25 seconds and `stop` finish reason on the declared exact route. Unknown spend, wrong providers, truncation, refusal, stale bindings and absent reviews block operator-review eligibility. Summaries separate deterministic results, human judgments, known costs and nearest-rank p95. Mocked/unknown cost and latency remain null; an eight-case p95 is descriptive, not an SLA.

## Preserved offline baseline

`evals/offline-baseline.v5.json` has eight hand-authored valid wrappers and nine deliberately invalid cases, including forged source IDs and hidden omitted evidence. `evals/offline-results.v5.json` records their reproducible checks. Every expected pass and rejection succeeds. These are checker tests, not model outputs or measured model-quality results. No human pass, endpoint approval or real provider cost is claimed.

## Paid mode remains unavailable

The future comparison ceiling is still $0.90, eight sequential synthetic calls, one attempt and 2,500 output tokens each. This is inside the approved global $25 run allocation, never additional money. The historical byte-proxy estimate is an offline planning preview, not a tokenizer proof or authorization. Actual accounting reserves the operator-reviewed full endpoint input ceiling plus bounded billable output and retains unknown charges. No default routes/user/project allowances are seeded.

AI-004 supplies atomic accounting and a one-attempt gateway; AI-007 now supplies bounded source context and a serialized permission/version dispatch fence. Those software controls do not approve a model. AI-005 routing/privacy review and AI-006 actual comparisons/human review remain required. An `eval_only` route must bind a dedicated authorized synthetic user/project, trusted synthetic account marker and exact approved canonical context hashes. A plan hash is not product quality evidence. This leaves AI-003's paid-mode subtask partial honestly.

The dated `route-evidence.v1.json` remains historical research. No price/eligibility metadata retrieval was repeated here. A passing report only permits operator review; it never changes configuration or deploys. Rollback of this optional harness does not remove the app's budget, permission or source gates.
