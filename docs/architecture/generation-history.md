# Reversible saved learning and outreach versions

EV-001 phase 1, 2026-10-18. This is a reviewed contract proposal, not an implemented storage service, migration, mounted history UI, PDF adapter or AI capability. `src/lib/generation-history/contracts.ts` and its pure tests are the only executable additions. The coordinator owns later scope expansion and task state.

## Inspected behavior and problem

`Synthesis.run` in `src/routes/_authenticated/learnings.tsx` currently replaces the existing synthesis `data` and origin and resets `accepted` to false. Manual save updates that row in place. The previous accepted wording is not separately retained. `DraftItem` in `outreach.tsx` also updates each saved body in place.

`save_generated_outreach`, last replaced in migration 20, already validates the entire plan and survey before an atomic delete/insert replacement. A rejected transaction preserves the previous saved plan; successful regeneration replaces its rows and manual edits. Keep that atomic failure protection while replacing destructive success behavior. The stage-2 survey belongs in the same saved version as its channels and drafts; stage 3 has channels, referral asks and onboarding questions.

The private immutable provenance ledger (migrations 06/08) and v2 grounding/context linkage (17) record origin, operation, prompt/schema versions, model/provider/cost metadata and permitted source references. They deliberately do not retain prompts, provider envelopes or exact generated output. Origin IDs are distinct from budget operation IDs. Migration 14's operation ledger prevents redispatch of uncertain paid requests; it is not an output cache. Migration 20 freezes ordinary writes to archived ideas. None of these facts permits fabricating a recoverable historical draft.

## Scope and saved identity

Every private history row has verified `user_id`, `project_id` and `stream_id`. A synthesis stream is project/stage 1; an outreach stream is a complete project/stage 2 or 3 plan. Each ordinary learning record has its own stable stream, at its actual stage. A future migration must enforce the appropriate uniqueness and legacy-record mapping, not combine unrelated learning notes into one stream.

Public request contracts contain project and stream IDs, never an actor ID, presentation role or authorization token. Fresh server authentication, owner-scoped lookups and owner-only RLS are mandatory for every operation. A revision-zero append may create the verified empty stream; it must not replace an existing stream under a supplied ID. Class enrollment, teacher permission, presenter status, platform-admin permission and future project sharing confer no private-history access. The pure scope parsing helpers only catch mismatched responses; they grant no authority.

An immutable version contains its own ID, monotonic per-stream sequence, saved-parent ID, typed document, exact body digest, creation time, authorship and provenance. Human wording is preserved exactly; parsing does not trim it. A parent is an earlier version in the same verified stream. The first version has no parent. A generated result begun against an empty stream may later be retained as a separate root candidate after a concurrent manual save; that is a branch, never an implicit overwrite. Same-scope relational constraints and locking must establish this in persistence; a UUID's shape cannot.

Document shapes deliberately differ:

- Synthesis, stage 1: title, human summary, problems/objections/best-fit/quotes/change fields.
- Learning, stages 1–3: title and manually authored reflection body. No generated-learning producer is authorized by this contract.
- Outreach, stage 2: stable row IDs, channel/draft rows and the complete survey.
- Outreach, stage 3: stable row IDs and channel/referral/onboarding rows, with no stage-2 survey field.

Stable outreach row IDs support comparison and preserve the identity of edited rows; regenerated rows get new IDs. Later storage must not delete the old plan to achieve this. Duplicate row IDs, incompatible stage/kind combinations, unknown fields and oversized aggregate UTF-8 payloads are rejected. Legacy values that exceed limits or do not match a typed document must remain available through their existing owner read/export path; report an explicit migration exception, never truncate or reinterpret them silently.

## Current and accepted are separate pointers

A stream's CAS revision protects both its current saved version and accepted saved version. Pointers include exact version ID, sequence and body digest. Acceptance is not a mutable boolean on historical versions: a version can have been accepted earlier while another is accepted now. Historical selection/acceptance receipts preserve that distinction.

Appending a manual save explicitly chooses `retain` or `select_new` for current. It must always retain the accepted pointer. A new generated candidate likewise must not replace either pointer automatically. The UI may show that a candidate was saved, but must label it as a candidate and require a deliberate current selection. Existing accepted work continues to drive the accepted-work projection until the owner explicitly accepts a replacement.

`select_current` also implements restore: point current at an exact older saved version without editing that version, replacing acceptance, calling AI or restoring withdrawn source permissions. Subsequent manual editing appends a child of that saved baseline. `accept_current` must name the exact current saved version and recheck it under the stream lock. Clearing acceptance is a separate explicit action. Unsaved editor text cannot be accepted or represented as the current saved version.

Current may differ from accepted. Export, compare and later-stage context must say which exact version they use. “Accepted” means the owner chose that saved wording, not that interviews, quotations, usefulness or product-market fit have been verified.

## Authorship, provenance and unknown history

Authorship distinguishes new manual work, a manual edit, trusted newly generated wording and legacy wording whose editing history is unknown. A recorded origin says the work descends from that generation; it does not certify unchanged current wording. Manual edits may retain their original AI ancestry while being labeled as human edits. Historical records with origin links remain `legacy_unknown` unless exact unchanged output can actually be established.

Provenance has three explicit states:

- `unknown`: no adequate record; do not infer AI, manual authorship, sources, model or price.
- `none`: a known new manual creation with no recorded AI ancestry, established by the trusted save service.
- `recorded`: a server-verified origin and matching generation kind. Requested model is recorded; actual model, provider and cost may remain null. Null is unreported, never a default model or zero cost.

For older v1 origins, operation and source context remain unknown. V2 origins can carry the actual linked operation, context digest and bounded source IDs. IDs are reference metadata, not source text or permission grants. A future service derives them from the existing ledger/claim linkage; the browser cannot submit provenance, source manifests or a claimed provider response. No prompts, provider generation IDs, credentials, raw envelopes or additional source notes enter these DTOs.

The exact body digest must be computed on the server using a documented canonical representation of kind, stage and document content. Client digests are never trusted. Canonicalization must agree across application and SQL and preserve exact text. The contract only validates digest shape; persistence tests must validate its meaning. Version changes require a new digest and immutable version, not a repaired historical digest.

## CAS, replay and uncertain saves

Manual append carries a stable request ID, proposed version ID, saved baseline/parent, expected stream revision and explicit pointer choices. The future service must lock the verified owner project before the stream in the same order as archive protection. It checks active lifecycle, actual project stage/unlock policy, parent/stream identity, current baseline and revision before appending and moving current, in one transaction. Any conflict leaves accepted/current and all existing versions intact. Local edits remain available for explicit comparison/rebase; never silently reload over them.

An immutable per-stream request receipt binds the verified actor, project, stream, operation, expected revision, parent, document digest, proposed version ID and pointer intent. Identical replay returns the same operation receipt, even if newer work now exists. Different payload under the same request ID returns `IDEMPOTENCY_CONFLICT`. A lost acknowledgment retries this exact save intent; it does not mint a new version ID or call the provider.

The result separates the immutable `revisionAtCommit` receipt from freshly read current stream state. Fresh state may be newer. Replaying an old receipt never reapplies its pointers or claims that the old result is still current. A mutation's terminal revision can be read at `Number.MAX_SAFE_INTEGER`; new incrementing expectations stop one below it and fail closed with `REVISION_EXHAUSTED` at exhaustion.

The future generated-result handoff needs a separate trusted server path integrated with the existing `generateAI` success path. It must capture the validated exact draft, matching immutable origin/operation, actual context metadata and saved baseline before returning a durable save success. One operation can produce at most one corresponding candidate in its scoped stream. It must not accept browser-submitted `{body, originId}` as proof of exact AI wording.

If another manual save wins while the provider runs, a still-authorized result may append only as an unselected candidate with its original baseline and a new history revision; current and accepted stay on the newer work. This requires an atomic append-only path with a unique scoped operation/origin binding, distinct from public manual CAS writes. If permission/lifecycle fences have changed, the result cannot persist. The future UI distinguishes a retained candidate from a selected current save.

There is currently no durable result cache to repair a response lost before that handoff. `GENERATION_UNAVAILABLE` must mean that this exact result cannot be recovered. The user can continue manually or deliberately begin a new separately budgeted operation after the existing accounting rules permit it; the history service must never redispatch the old operation, release an uncertain hold, disguise new output as an old result or promise recovery from metadata alone.

## Source fences and existing consumers

Do not build AI context by scanning historical versions or raw private child tables. `generateAI` continues to use the current owner-scoped processing-permission RPC, its permission/source revision manifest and pre-dispatch/final persistence checks. Recording a version, choosing it as current, accepting it or restoring it grants no note-taking, processing or sharing permission. Source IDs and historical choices never become current authorization.

The existing context RPC reads accepted `learnings` rows after current permission checks. A later migration must define one canonical accepted projection and migrate all readers/writers together. If current is a new unaccepted draft while an older version is accepted, the accepted legacy projection must keep the older accepted wording and origin. Updating the same legacy row with current draft text while leaving its accepted bit true would leak the wrong version into context. Review all owner source selectors, class submission adapters, PDFs and stage progression before enabling this bridge. Historical current/accepted state must never be inferred from array order or `.find()` alone.

Version-history retention does not broaden teacher/submission visibility. A deliberate teacher copy remains its exact separately authorized immutable payload. Changing private current or accepted pointers does not update an existing submitted copy. A future classroom adapter needs its own reviewed version and permission semantics before it can select history.

## Capacity, archive and export

Proposed bounded policy: 50 versions per stream, 200 mutation receipts per stream, metadata pages of 20 versions, a 65,536-byte typed document budget and a 98,304-byte public save envelope budget. These constants do not authorize unbounded additional streams; service/DB design must include owner/project stream-count and total-storage caps before implementation. Page ordering is newest sequence first with an exact last-returned cursor; metadata pages omit bodies and source text. Full wording requires an exact scoped version read. There is no silent history pruning.

Version capacity blocks new appends while existing history remains readable/exportable and pointer restore can continue within the separate receipt allowance. Receipt exhaustion blocks further receipt-producing mutations, including restore; show the exact limit and preserve read/export rather than expiring old idempotency protection. Operator-reviewed capacity changes are a future option, not an automatic purge. Generated saves must reserve/check history capacity before paid dispatch and recheck it at commit without weakening the existing provider budget or archive lock order.

Archived projects preserve owner history read/export and normal project restoration, but deny every new history version, pointer mutation, generated capture and acceptance change. Restoring the project does not restore any withdrawn permission. Project deletion/retention must follow a separate reviewed policy; version history is not a promise of permanent storage or physical deletion.

Every future version-backed activity needs an individual PDF adapter and verified mount registered in `src/lib/export/coverage.ts`. Exports must name exact saved version/sequence and status at snapshot time: current, accepted, historical, unselected generated candidate or unsaved local draft. An unsaved edited PDF must not carry a saved-version digest as if it covered those edits. Exact saved/current/accepted choices must remain distinct in portfolios. New adapters preserve human/AI/unknown authorship, recorded versus unknown provenance, selected fields, redactions, uncertainty and source limitations; no provider call or paid renderer is needed. Teacher exports continue through the authorized submitted-copy adapters.

## Gates before persistence and release

1. Review this contract and settle canonical body hashing, stream identity/legacy mapping, aggregate storage caps, receipt exhaustion behavior and generated-capacity reservation. No migration number is reserved here; AN-003 retains its separate schema-26 ownership.
2. Inspect exact migration and rollback pins. Preserve all legacy data, accepted wording, survey and edited outreach rows. Keep malformed/oversized legacy rows recoverable without fabricated metadata. New append, pointer and receipt rows need composite scope constraints, immutable identity/body enforcement, owner-only RLS and controlled cleanup privileges.
3. Rehearse actual two-owner/two-project isolation, duplicate names, foreign parents/pointers/origins, kind/stage mismatch, malformed DTOs, stale CAS, stable replay, payload conflicts, terminal revisions, version/receipt/storage caps and original legacy consumer compatibility in an approved disposable clone. Test manual-save/generated-candidate races and both archive lock orders with actual SQL. No DB action occurred in phase 1.
4. Integrate trusted generated capture without a second gateway, changed provider schemas or duplicated paid operation. Test lost acknowledgments before/after commit, no-cache recovery, source/permission withdrawal, budget/global-stop changes and archive after dispatch. Synthetic pure tests do not authorize a paid call or lift privacy/model gates.
5. Build owner UI for candidate/current/accepted history, exact comparison, deliberate restore and dirty-form safeguards. Test project/account switching, delayed replies, concurrent manual edits, failed generation/save and recovery after reload. Preserve older accepted content until explicit replacement. Implement every activity/version PDF and portfolio distinction with coverage tests.
6. Run combined lint/typecheck/build, actual isolated RLS/race/DTO checks and live ordinary-owner browser journeys. Existing production behavior stays in place until those gates pass. Roll back by hiding new controls and pinning the last known accepted/current projection; do not delete history or rewrite operation receipts.

These contracts provide no new legal-compliance, learning-effect, interview-authenticity, production-persistence or successful-recovery claim.
