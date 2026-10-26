# Live generation: runtime evaluation and activation

## Current boundary

The serving OpenRouter key is accepted. Production generation remains stopped. The
runtime evaluation implementation is closed by `expectedWorkspaceId: null`; it
cannot dispatch until the actual account, privacy and billing review is complete.
No paid call was made while building this successor workflow.

The deployed metadata probe was rechecked on 2026-10-26 and reported workspace
`047cf11a-2bfd-5ce5-888a-2a4ddcd4bc14`, a $50 resetting key limit,
$49.9955416 remaining and $0.0044584 reported usage, excluding BYOK spend.
Chrome's signed-in Default Workspace is a different workspace. Its privacy settings
cannot attest the serving account. The user has been asked to switch accounts;
never request or copy their key. Reported key usage alone is not a reconciliation
of the app's complete historical spending.

The user's ceiling remains **$25 total**, with the existing permanent $1 practice
carveout and $24 general application ledger. A $50 provider key does not increase
that authorization. No other paid service is authorized.

## What the software does

All inference still enters `generateAI`. `runtime_evaluation` accepts only one of
eight server-authored fictional cases and its single stable operation UUID. Cases
cover typical and edge inputs for questions, synthesis, Stage 2 and Stage 3. The
handler branches before editable project content is read. The trusted presenter
must still own the active reserved fictional project, with fresh trusted fixture
markers, before reservation, before claim and before receiving a draft.

Presenter status alone never grants paid access. Existing service-only ledger
controls must separately authorize the exact evaluation actor/project, kind,
context hashes, reviewed route and scoped allowances. The fixed case has no
private-record manifest: its input is authored software test material, not a
projection of editable student records. Ordinary product calls retain their
permission RPC, context fence and provenance writer.

The gateway validates strict grounded output. Known billed invalid responses are
settled as invalid and withheld. Ambiguous outcomes retain their reservation.
Lost claim or settlement acknowledgements never trigger cancellation or a fresh
generation. Receipt downloads expose fictional drafts, source labels, model,
provider, operation/context identities and reported charges, never credentials.

The old `marketing_demo` entry point now refuses new dispatch. Its saved drafts,
historical evidence, charges and permanent carveout remain intact. Opening the
general stop must not reopen that retiring model.

## Candidate and limits

Candidate: `google/gemini-3.1-flash-lite`, exact standard
`google-vertex/global`, response provider `Google`. No fallback, alternate region,
flex/priority tier, tool, media or search is requested. Provider data collection
is denied and ZDR is required per request; these are not institutional agreements
or proof of the correct account's logging settings.

The [catalog](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints)
lists 1,048,576 input/context tokens and 65,536 completion tokens, with the reviewed
standard prices of $0.25/$1.50 per million input/output tokens. The 2026-10-26 public catalog inspection returned status `0` for this exact
endpoint, and the unchanged `inspectLiveCandidateEndpoint` passed against that
response. This supersedes the historical status `-2` observation. Eligibility can
change: recheck before activation, without silently substituting an endpoint.

The application conservatively reserves **$0.360448 per call** using the entire
catalog input and output ceilings. Eight simultaneous maximum charges would be
$2.883584, below the proposed **$4 evaluation allowance within the existing $25**.
Requests ask for 4,000 tokens with minimal reasoning; the reservation does not
assume that visible text or excluded reasoning is the whole bill. OpenRouter's
[reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
says reasoning is billed and Gemini effort does not supply an exact thinking-token
budget. Confirm the complete endpoint billing bound before approving the route.

## Operator sequence

1. Match the serving workspace to the signed-in account. Review paid training,
   input/output logs, observability export destinations and relevant BYOK entries.
   Do not create credentials, upgrade plans, copy keys or inspect unrelated prompts.
   Confirm the selected route will not incur upstream-provider bills outside the
   authorized OpenRouter budget.
2. Reconcile prior spending and uncertainty, preserving every old charge/hold and
   the permanent $1 carveout. Record a conservative reviewed opening hold for the
   general ledger. Do not invent a zero hold from an empty new operation table.
3. Recheck the exact standard endpoint with `inspectLiveCandidateEndpoint`; its
   status, prices, schema/reasoning support and caching behavior must pass. Record
   account/privacy, total billing-bound and fixed-evaluation reviews separately.
4. Prepare a new private, unapproved packet:
   `node --experimental-strip-types scripts/prepare-runtime-ai-evaluation.mjs /private/tmp/NEW-plan.json`.
   This reads source and authored fixtures only; it never reads keys, calls a
   provider, edits a database or approves itself. It includes exact source hashes
   and eight canonical context bindings. Fill review evidence only after it exists.
5. Pin the reviewed serving workspace in source, version the changed source-bound
   fixture manifest rather than overwriting immutable v7 artifacts, and rerun the
   source/handler/budget/UI gates. A new source pin is not paid authorization.
6. Rehearse exact operator SQL on the dedicated local schema 27 database. Reuse
   existing reserved fictional identities. No new grants, fake authenticated users,
   migrations, consent changes or teacher-copy candidate schema 28 are needed.
   Configure four **eval_only** routes with exact kind/case hashes, the fixed
   presenter actor/project, reviewed ceilings and an expiry of at most 24 hours.
   Set user/project lifetime and daily allowances to at most $4, one in flight,
   and a deliberately small rate. Keep `global_stop=true` during preparation.
7. Only after code deployment, review, rehearsal and rollback verification, use
   the existing operator path to enable the general ledger and release its stop
   for these exact evaluation scopes. Do not grant ordinary users an allowance.
8. Run each prepared case once through the actual deployed `generateAI` control.
   Save receipts and reconcile actual operation/attempt/generation identities,
   provider/model, charges and unknown holds. Stop on an ambiguous outcome;
   investigate without retrying, refunding or resetting its stable operation ID.
9. Review actual output quality per kind: past behavior, audience fit, actionable
   next steps, exact quotes, counterevidence, missing/withdrawn sources and no
   invented outcomes. Label an agent review as agent-assisted. Do not claim a
   participant study or human review that did not happen.
10. Stop dispatch again before separately reviewing and promoting product routes.
    Verify ordinary processing choices, source permissions, fresh owner/project
    authorization, provenance persistence, saved drafts and actual UI behavior.
    General user allocation is a separate bounded policy. Account-free class and
    discovery/marketing AI need their own scopes, choices and adapters; this
    evaluation does not implement or authorize those flows.

Rollback is the existing global generation stop. Preserve all ledger records and
settlement permissions; do not zero charges, delete operations or reuse an ID for
a new paid request. Keep manual work and saved PDFs available throughout.

## Reproducibility

Historical v1–v6 fixtures/reports remain unchanged. The v6 local paid runner keeps
its local-origin, dedicated-key and $0.90 guards; it is not the runtime successor.
The shared offline loader now accepts an explicit versioned manifest for reuse,
while its v6 default and financial guards are unchanged.

`fixtures.v7.json` and `offline-baseline.v7.json` describe software tests, not paid
model results. The builder independently checks that each current assembled
system/user/schema and canonical budget binding matches its authored predecessor
and runtime fixed case. It refuses an unreviewed prompt semantic change and uses
exclusive creation. The current manifest also pins the runtime policy, key viewer,
model selector and canonical binding. Tampering with scope, consent revision,
omissions, schema or prompt content cannot pass by refreshing only a file hash.
