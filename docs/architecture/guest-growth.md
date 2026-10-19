# Guest growth artifacts: phase1 contract and implementation handoff

**Status: contract/design only.** CLS-009 preserves CLS-008's original all-core-activity obligation. The shipped seven-step Discovery and Marketing Lab studios do not yet provide these dedicated workflows. This phase defines structured data, validators, negative tests and the implementation sequence. It adds no database table, RPC, server function, route, editor, PDF adapter, teacher access, AI request or live capability. Migration25 remains exclusively AN-002; the coordinator must reserve and review a later additive migration before implementation.

## The actual owner inventory and missing guest work

The owner inventory is visible in `src/lib/export/adapters.ts`, `src/lib/export/coverage.ts`, `/learnings` and `/outreach`. Existing guest22 covers the manual discovery cycle and private interview drafts. Guest23 covers a manual marketing plan with channel/content/outreach/test/measurement/reflection sections. Guest24 supplies a separate reviewed Marketing Lab handoff. Generic outreach and one marketing-plan test are not dedicated equivalents of every owner artifact.

| New kind | Structured manual equivalent | Meaning and exclusions |
| --- | --- | --- |
| `learning` | Standalone authored learning/synthesis form: deidentified observation summary, bounded patterns (observation/interpretation/limitations), objections, best-fit hypotheses, counterevidence, uncertainty, proposed changes with reasons/next steps, next test and reported review | No quoted-participant array, private interview notes or implicit synthesis/import. Reviewed means student-reported review; it is not AI acceptance or verified learning. |
| `experiment` | Multiple independently identified experiments: falsifiable hypothesis, change, audience, procedure, measurable criterion/baseline/target/unit, repeat/revise/stop rules, reported state and separate reported outcome/limitations/next action | Unknown quantities remain null, distinct from zero. Running/completed/stopped are self-reports, not automatic evidence of a real-world test. |
| `pipeline_contact` | A Stage2/3 alias contact: relationship, relevant experience, fit, source, manually reported pipeline status/date/basis, uncertainty and next action | No email/phone/profile/real-account relation. Alias checks reject common contact-address formats but do not guarantee anonymity or detect all personal information. Reported active/paying status is not verified use/payment. |
| `survey` | Purpose, audience, introduction, permission reminder and up to12 typed open-text/single-choice/scale question drafts | No response records, answer arrays, collection endpoint, sending or analytics. Drafts remain explicitly unsent and not collected. |
| `referral` | Recipient role/alias, relevant-person criteria, builder disclosure, context, specific ask, message body and respectful exit | A dedicated unsent referral request, not generic outreach renamed. No automatic sending, contact lookup or reported referral-success counter. |
| `onboarding` | Audience/user goal, first action, planned success observation, walkthrough prompt, anticipated hesitation and up to12 timed before/during/after questions | A dedicated unsent onboarding research draft. No captured answers, session tracking or claim that someone completed onboarding. |

Manual stages are pedagogical context. They do not mutate an account project's stage, count completed interviews or unlock anything. Learning and experiment support Stages1–3; pipeline and survey support2–3; referral/onboarding support3.

## Closed namespace and genuine audience

`src/lib/guest-growth/contracts.ts` defines a strict discriminated union and separate saved-record metadata. The request contains an artifact UUID, kind-specific document, expected revision, mutation UUID, audience and CSRF token. It does **not** contain a user/project/class/team/author authority field. The future executor must derive those from the same-origin HttpOnly guest cookie and session-bound CSRF transport, resolving the current principal after the class lock.

A future `guest_growth_artifacts` relation should hold immutable identity/class/team/author-principal/kind/audience and the current revision. A separate `guest_growth_versions` relation should retain every acknowledged revision with its bounded document and saved time. Both need actual composite foreign keys to the guest principal/class/team; no fake auth user, owner project or unrelated learning/marketing activity ID. Separate operation receipts bind the publishing principal, mutation ID, exact payload hash, artifact and original acknowledged revision. All raw tables remain closed/RLS-enabled; only narrowly granted fixed functions operate on them.

Principal-private artifacts are available only to that current principal. Team artifacts are available to the current and future explicitly authorized team members. New team creation must first save the kind-specific **blank** document with an explicit audience acknowledgement. The student can then author business material in it. The schema allows the chosen valid stage on that blank document. No create-time import, private-to-team relabel, hidden copy or automatic merging is part of this API. The database must repeat this check; a client validator never grants access.

Strict keys exclude account/project authority, raw answer/quote/note attachments, interview IDs, AI origin records, responses and invented operational fields. Free text can still contain sensitive information, so the UI must tell learners to use deidentified summaries and review every deliberate disclosure. The schema rejects likely credentials and standalone64-hex capability-looking tokens in artifact content; the separate legitimate CSRF envelope is not treated as content. These checks are limited validation, not proof that text is non-sensitive.

## Exact, acyclic references

References name only an exact retained **growth** artifact revision with a literal target kind. No private guest22 interview/activity ID, account record or opaque pasted prompt becomes an implicit source attachment. **Cross-studio22/23 provenance and context attachment are not implemented in this phase.** Joining either existing genuine source namespace later requires its own reviewed, authorized adapter; a matching UUID or editable pasted summary is never an access grant or verified lineage.

- Experiment → up to4 learning revisions.
- Survey or onboarding → optional experiment revision.
- Referral → optional pipeline-contact revision and optional experiment revision.
- Learning and pipeline-contact artifacts have no source-reference fields.

The permitted kind graph is acyclic. A server-authorized reference inventory must verify exact kind/revision existence, current class/team, and source audience. Principal-private references must belong to the same current principal; a team artifact cannot reference principal-private work, even when that learner owns it. References never copy linked bodies into a document, PDF or teacher payload automatically. The pure `guestGrowthReferenceError` helper tests these structural/scoping conditions over an already authorized inventory; it is not database/RLS evidence or a replacement for the future RPC checks.

The future database resolver must store/enforce references against the actual retained-version namespace, recheck access on save/load/export, and reject unavailable references explicitly. Kind, audience, author and class/team identities cannot be changed by CAS edits. This phase does not claim a foreign-key reference graph already exists.

## Proposed bounded services and retry semantics

The new function names below are proposals, not callable services. Guest inputs use the current cookie+CSRF executor; authenticated teacher inputs use fresh verified bearer identity and database role checks.

| Proposed action | Contract and required behavior |
| --- | --- |
| `list/load_guest_growth_artifacts` | List authorized headers by optional kind/cursor,50 per page. Load current or a specifically retained revision. An explicit unavailable ID is denied; never fall back to another artifact. |
| `save_guest_growth_artifact` | Exact parsed document, artifact/audience, expected revision and mutation ID. Derive current principal/class/team. Create or CAS-append one immutable revision, enforcing blank team creation, references, count/byte/history/receipt caps and current access. |
| `get_guest_growth_history` | Up to40 distinct headers of one immutable artifact scope. An artifact's history cannot mix kind, class/team, author or audience. |
| `get/save_guest_growth_sharing_choice` | A missing choice is unknown. Save a publisher/artifact-scoped reported choice with CAS and a stable request ID. It is distinct from participant note/AI choices and from any actual audience grant. |
| `preview_guest_growth_submission` | Exact artifact/revision, published assignment, stable thread/request IDs,1–12 distinct allowlisted sections or exact question IDs, optional exact source substring, literal redactions and bounded reflection. No teacher access yet. |
| `confirm_guest_growth_submission` | Exact preview ID/hash plus a separate explicit selected-copy confirmation and stable request ID. Rebuild authority, sources and payload before creating an immutable teacher-only version/grant. |
| `list/get/withdraw_guest_growth_submission` | Current publishing principal's private author copies and first monotone withdrawal. An unrelated teammate cannot read a teacher copy just because the raw artifact is shared. |
| `list/get_teacher_guest_growth_submission` | Fresh verified class owner/teacher role; currently eligible stored selected snapshot only. No raw growth/version table read. |

The preview validator enforces the declared65536-byte aggregate UTF-8 request limit, not merely per-field character bounds. Future transport must reject an oversized body before parsing; the schema check is an additional defense. Presentation excerpt keys must be unique so independent excerpts cannot collide in downstream selection/PDF keys.

Permission/grant counters and request CAS bounds are separate: a request expected revision is at most `Number.MAX_SAFE_INTEGER - 1`, leaving room for one increment, while a returned counter may equal `Number.MAX_SAFE_INTEGER`. Only a terminal withdrawn choice/grant may use that last response value. Non-withdrawal preference changes must leave the terminal increment available. A withdrawal from MAX−1 to MAX must validate successfully in the response, including the private author DTO. At terminal withdrawal, no further increment is allowed; an exact retry retains its original request ID and expected MAX−1 value, and an already-withdrawn read/no-op cannot reopen the grant. Future SQL must enforce these finite bigint/CAS rules and test the actual terminal reduction and cap-safe retry, not rely on JavaScript validation alone.

All mutation transactions use class → fresh guest → relevant team/principal/source/version/receipt locks consistently. Recheck actual guest/class expiry after writes; a late-expiry exception rolls back the version, current pointer, receipt, preview consumption and grant together. Expected revision conflicts preserve local text and offer an explicit current saved comparison. An uncertain retry retains the exact mutation ID and body. The response separates the original `savedRevision` from the currently authorized saved record; an older replay cannot silently overwrite newer local or server work. Cache keys and child subtrees must include class/team/principal and artifact/audience, with stale responses ignored across scope changes.

Proposed hard bounds are32768 UTF-8 bytes per document;40 acknowledged retained revisions/artifact;64 private artifacts/principal;96 shared artifacts/team;2MiB private history/principal;8MiB shared history/team;32MiB total class growth history;2000 ordinary mutation receipts/principal; and the shared120/minute guest bucket. Stored history bytes include all versions, not just the latest record. Identity/receipt rows also need finite row caps. The class lock must serialize byte allocation. At revision40 or another cap, refuse ordinary growth writes generically and preserve every existing revision/export. A later explicit new blank artifact may continue work within the remaining caps; do not silently clone, evict history or delete old work. Privacy choices and first snapshot withdrawals remain available at ordinary capacity. Fresh repeats of an already reduced choice/grant must not grow receipts/audits without bound.

Expiry is access expiry, not a deletion guarantee. The class's disclosed retention policy still requires separate operational implementation and institution review. An expired/revoked guest cannot reacquire private PDFs here. No account transfer or cross-class recovery is introduced.

## Immutable teacher projection and source permission

Use separate closed growth-disclosure relations/resolvers, not widened published22–24 enums or unrelated source resolvers. `guest-growth-v1` is the fixed initial resolver version; the presentation payload carries `sourceKind:guest_growth`, snapshot-local excerpt keys and the fixed authored/self-reported evidence label. Private artifact/question/reference IDs remain in the closed manifest, not presentation text. Unknown fields and another source namespace are rejected.

Each selected section must come from the exact saved artifact revision. Individual survey/onboarding question selections require a question UUID in that actual saved revision. Preview never trusts caller-supplied text as a source; an optional excerpt must be a literal substring of the resolved source. Redaction and email/identifier scrubbing must be repeated server-side and followed by final code-point/byte validation. The proposed payload cap is40KiB, with individual6000-code-point excerpt and bounded reflection limits; the preview specification is at most64KiB.

Before preview/confirm, conservatively resolve every declared transitive growth reference from the selected saved revision, without implicitly publishing its body. The graph is currently shallow, but enforce at most32 sources and depth3. A missing/foreign/ineligible source must fail closed. Require the publisher's current separate reported-sharing eligibility for every dependent source used in the manifest, binding each permission revision. Future implementation must prove this against real source relations; this contract does not invent consent lineage for deidentified free text or raw interviews.

A preview binds the selected artifact/revision/hash, all dependent source scopes/choice revisions, resolver version, actual class/assignment revisions, principal/team access generations, exact class access deadline, expected thread version and redacted payload. It lasts at most10minutes and never past class access expiry. Confirm creates the distinct teacher-only grant only after explicit exact-copy review. Ordinary later source edits do not rewrite/revoke an already published immutable copy. Teacher eligibility reads stored snapshot plus source/permission/scope metadata, never the current raw artifact body or latest replacement references. A source or dependency choice revision/withdrawal, withdrawn grant, changed class/assignment/principal/team generation, missing retained source or expiry denies the old recipient copy without revival on reopening/recovery/regrant.

Disclosure bounds mirror the reviewed24 pattern:20 versions/thread,50 previews/thread,50 threads/publisher,2MiB stored previews/versions per publisher and16MiB per class. Include specifications/manifests/payloads/authority in the byte arithmetic. Exact replay reuses the existing payload. First monotone privacy reductions remain possible at every ordinary cap. The private author copy survives recipient withdrawal while current guest access is valid. Previously downloaded copies cannot be recalled.

## PDF contract and future mounts

Every kind has an explicit `GUEST_GROWTH_PDF_CONTENT` catalog. This is **not** a registered adapter. The future adapter must export every currently implemented field, unknown values and limits in each selected retained revision. Each survey/onboarding question gets its own selectable section; each experiment, contact, learning, referral and onboarding artifact is independently selectable. Current unsaved edits need a separate labeled preview; a saved revision export must not substitute unsaved text or silently pull latest linked bodies.

Individual and selected-portfolio PDFs use genuine `guest_principal_private` or `guest_team_shared` source scopes. A mixed portfolio may be downloaded only for an audience authorized for every selected source. Before generation and before delivery, reacquire the current cookie scope and each selected exact retained revision, then compare the frozen content/revision. Teacher copies use `submitted_snapshot` and the separate fresh teacher get endpoint. Their private preview/author copies remain principal-private. Class/team/assignment/choice/withdrawal changes withhold fresh delivery; earlier downloads cannot be recalled.

The coordinator must register every implemented kind adapter and verified guest/teacher mount in `src/lib/export/coverage.ts`, update coverage evidence, and inspect actual generated pages. No PDF rendering or browser delivery was exercised in phase1, because no adapter or UI was built.

## Order of operations and remaining gates

1. Review this contract and exact structured inventory; integrate only the three phase1 files. CLS-009 remains in progress; no parity completion claim.
2. After AN-002 releases schema25, the coordinator reserves the next additive migration and expands one writer's scope for closed tables/RPCs and services. Preserve published21–25 byte-for-byte. Build an exact-pinned, independently reviewed disposable schema-only clone harness before any DB action.
3. Prove genuine private/team/outsider/teacher boundaries, exact DTO/schema parity, reference scoping, saved history/replay/CAS, count/byte/revision caps, privacy reductions at cap, real overlapping lock races and late-expiry rollback. No mocked RLS claim.
4. Build desktop editors with draft/unknown/self-reported labels and exact retry/conflict/scope/unsaved-work handling. Root owns shared join/teacher parents and official generated types.
5. Add every individual/portfolio/selected teacher PDF adapter and registry entry, fresh two-stage download authorization, actual page rendering and deliberate selected-copy UI. No raw interview attachment by an implicit adapter.
6. Run combined checks, normal reviewed schema integration and live fictional save/reload/PDF/withdrawal/scope rehearsal. Preserve existing demo data, guest studios and choices. Only then update implemented capability documentation.

Rollback hides new growth entry points while retaining existing22/23 studios,24 handoffs and all saved records. Disable the new kind resolvers without silently reusing an older resolver/version. No destructive downgrade, automatic source migration, automatic public sharing, AI enablement, outbound message or hosted survey collection is part of this slice.

Phase1 tests check strict keys, wrong namespaces/UUIDs/revisions, typed questions, null/zero/Unicode/byte semantics, explicit blank team creation, reported outcome/review requirements, exact authorized-inventory references, selection-kind/question matching, immutable history scope and separate teacher confirmation. They validate software contracts only; actual save, authorization, exports and teaching outcomes remain unverified until the later gates above.

Phase1 verification:29 focused contract tests pass, project typecheck passes, scoped ESLint and Prettier pass. Only this document, the new contract module and its focused tests changed. No database/network/provider action or UI/PDF capability test was performed or claimed. The coordinator owns task status and roadmap-state updates.
