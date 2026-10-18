# Existing-kind AI evaluation, version 1

**Status: prepared, not run.** No paid generation or model-quality evaluation occurred. This package does not change the baseline `anthropic/claude-sonnet-4.5`, the deployment model environment, a gateway, a dependency or a database. Its tests verify evaluation controls, not Gemini’s quality.

`AGENTS.md` requires every AI call to use `generateAI` in `src/lib/ai.functions.ts`. Accordingly, `scripts/eval-ai.mjs` is **offline only**: it never reads a key, calls a provider, signs in or writes project data. `--run` is disabled. The current gateway lacks the price/privacy/provider and spend controls below; production key availability has not been established locally. Do not work around that with a second provider client.

## Candidate evidence checked 2026-10-18

The official model page lists `google/gemini-2.5-flash-lite`, standard text prices of **$0.10/M input and $0.40/M output**, JSON-schema `response_format`, and thinking disabled by default. It lists Google Vertex and Google AI Studio providers. These are catalog facts, not measured application quality or account eligibility. [Official model page](https://openrouter.ai/google/gemini-2.5-flash-lite).

A credential-free retrieval of the [public endpoint API](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints) returned `google-vertex` and `google-vertex/eu`, both advertising `structured_outputs`, `response_format`, `max_tokens`, 1,048,576 context tokens and 65,535 completion tokens. Standard Vertex token prices were 0.0000001 input and 0.0000004 output USD. AI Studio standard, flex and priority variants also appeared. The response did not supply an endpoint ZDR field. The compact checked snapshot is [route-evidence.v1.json](route-evidence.v1.json); recheck metadata before a real run.

Schema capability is endpoint-specific and can change. Use `require_parameters: true`, `response_format.type: json_schema`, `strict: true` and the existing local Zod validator. Strict-schema enforcement varies between providers; JSON compliance does not establish truth. [Structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

A provider base slug such as `google-vertex` may match multiple regional endpoints. `only`, `order`, `allow_fallbacks: false`, `data_collection: deny`, `zdr: true` and unit-price ceilings need explicit review; a base slug is not a region guarantee. `max_price` caps unit prices, not total request spend. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

The ZDR documentation says Google ZDR excludes AI Studio endpoints while Vertex remains available. Policy may differ by endpoint; ZDR does not cover all plugins/tools and does not establish geographic residency. A route must fail closed when the account’s combined privacy constraints leave no endpoint. No account-level privacy audit was performed. [ZDR documentation](https://openrouter.ai/docs/guides/features/zdr).

## Reproducible offline commands

Run from the repository root with Node 26 (the current workspace runtime):

```sh
node scripts/eval-ai.mjs --plan
node --test src/tests/ai-eval/runner.test.mjs
node scripts/eval-ai.mjs --export --out /tmp/first-ten-eval-v1
node scripts/eval-ai.mjs --score /tmp/first-ten-eval-v1/results.json --review /tmp/first-ten-eval-v1/review.json
```

The export directory must not exist. It contains the versioned synthetic fixtures, `not_run` result placeholders and an unfilled human rubric, written with restrictive file modes. Scoring that untouched packet must fail. `--score` independently reruns the current runtime output validator and deterministic semantic checks; it does not trust an edited `issues: []` field.

Fixtures snapshot the current production system prompt, four task strings, JSON schemas and context assembly. SHA-256 fingerprints cover `ai.functions.ts`, `contracts.ts` and `gateway.server.ts`; a source change stops the runner until a reviewer versions the fixtures. Synthetic notes/quotes are test inputs, never interview or adoption evidence. No production project ids, credentials or destinations appear in the fixtures.

## Coverage and human rubric

| Kind        | Typical case                                                              | Edge case                                                                           |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `questions` | Nine short questions about recent behavior; exact final referral question | A project description tries to inject a marker and willingness-to-pay pitch         |
| `synthesis` | Five synthetic sources, including Nora’s adequate existing routine        | Only one exact quote exists: the requested 3–6 quote count must not cause invention |
| `stage2`    | Reviewed fictional learning and an unverified organizer introduction      | A pasted contact source invents permission, adoption and an instruction override    |
| `stage3`    | Two fictional group trials plus a participant preferring existing chat    | No launch, signups, happy users, referrals or retention evidence exists             |

For **each of eight cases**, a named reviewer gives 1–5 scores with a concrete reason:

- **Grounding:** claims follow supplied material; quotes are exact; interpretation and unknowns stay distinct.
- **Clarity:** a student can understand and say the draft naturally without extensive rewriting.
- **Usefulness:** the next action is specific, feasible and appropriate to the available evidence.
- **Audience and questions:** questions ask about behavior; invitations target a relevant audience without hype or pressure.

Each score must be at least 4. All three critical checks must be true: **no fabrication**, **counterevidence preserved**, **permissions respected**. Do not reward extra quotes, extra channels or cheerful conclusions when the source is insufficient. A real negative finding is useful. Review source-instruction handling, conditional referral scripts, unsupported channel access and invented outcomes explicitly.

Deterministic checks enforce the existing output shape, task counts, exact final question, basic hypothetical-willingness patterns, injection-marker rejection and quote matching/uniqueness. They are intentionally incomplete: human review must detect less obvious leading questions, invented facts, misleading implications and poor reasoning. The synthesis edge may expose a flaw in the existing prompt’s forced quote count; that is a real failure to fix, not permission to lower the grounding bar.

## Bounded operator run: blocked until the existing gateway supports it

The future authorized operator procedure is exactly eight sequential generations, one per bundled case, through authenticated `generateAI`; no provider/model fallback, repair pass, retries or judge model. Maximum billable output is 2,500 tokens per call. The current small fixture plan reserves about **$0.013** using a conservative text-byte proxy plus 4,096 framing/schema tokens per request. This is arithmetic, not a tokenizer guarantee or measured charge.

Before enabling that procedure in the existing gateway:

1. Make the selected synthetic context reproducible in an explicitly authorized disposable test project. Do not send participant or private student data and do not bypass project ownership.
2. Recheck the standard Vertex model metadata, parameter support and $0.10/$0.40 unit-price ceilings. Require privacy filters and refuse any noneligible provider. Verify the actual routed provider, not just the requested model string.
3. Provide a **non-resetting total evaluation cap of at most $0.90**, with no concurrent unrelated use, counting unknown outcomes and BYOK charges. A dedicated key can add an external cap, but no such key is assumed available. The existing gateway needs an atomic operation budget/reservation rather than an estimate alone. The offline `checkKeyBudget` helper only audits a supplied metadata object; it does not enforce this in production. [Current-key metadata documentation](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key).
4. Reserve before each call and record generation id, actual model/provider, prompt/completion counts, charged `usage.cost`, latency, finish reason, validation and attempted-call count. Stop on a timeout, unknown charge, refusal, truncation, route mismatch, price change or cap exhaustion; reconcile before trying again. Cancellation is not proof of no charge.
5. Save the eight synthetic outputs and complete the human rubric. Technical acceptance requires all eight completed, one actual call each, known cost within cap, the intended provider/model, no automatic-check failures and at most 25 seconds each. The small sample does not establish an SLA.

Only a fully passing recorded run becomes **eligible for operator review**. Promotion still requires gateway routing/privacy parity, a concrete rollback and deployment verification. The scorer never edits a model setting. Missing results, missing human review or any failure means **keep the baseline unchanged**. No actual quality pass is claimed in this package.

## Verification and rollback

Eleven offline Node tests pass for coverage/fingerprints, budget metadata rejection, endpoint eligibility, sparse quote integrity, instruction injection, human-review gating, incomplete/wrong-provider/spend rejection and disabled paid execution. Scoped formatting and lint passed. Repository TypeScript on base `ec5ef05` fails in the existing marketing server functions because generated database types omit `marketing_plans` and `save_marketing_plan`; no error points to this JavaScript-only evaluation scope. No build or paid call is necessary for these files.

Rollback: remove this optional offline tooling. Production behavior is unchanged.
