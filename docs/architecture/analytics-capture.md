# Optional owner product measurement

AN-002, owner-events-v1. This is a prospective, deliberately incomplete instrumentation slice. Collection is **disabled by default**. No public visit, account signup, browsing session, acquisition attribution, guest activity, learning acceptance, accepted action, funnel conversion or model-quality result is implemented by this slice. Existing independent admin row counts remain operational state, not a funnel. [The event contract](../analytics/event-contract.md) remains authoritative.

## What is measured, if separately enabled

Two database AFTER triggers cover the actual account project insertion and interview absent/incomplete-to-completed boundaries, including permitted legacy direct writes and canonical draft completion. They never inspect project text, contacts, questions, answers, notes, quotes, tags, URLs, prompts or AI output. An event reports an app action, not verified conversation authenticity, learning or product demand. Database transaction rollback removes its event and new first-occurrence marker together. RPC receipt replay, completed toggles, source deletion/recreation, archive/restore and later measurement opt-in cannot backfill an already marked source.

The producer requires the database actor to equal the source owner, a current auth account, an enabled operator policy, a nonfuture instrumentation start, cleanup checked within25hours and a distinct granted measurement preference. Owner-only source permissions and archive freeze still apply independently. Server preference functions reverify the current account token rather than accepting a supplied actor. Analytics never authorizes source reads or changes AI accounting.

`environment` comes from the closed operator policy. Trusted synthetic/demo app metadata always produces `synthetic`; a current platform admin produces `operator`; only an operator-owned app-metadata classification can designate `ordinary`. Everyone else is `unknown`. Display names and email domains never classify real participants. All test fixtures are synthetic. There is no ordinary-adoption aggregate endpoint.

## Separate measurement choice

`MeasurementPreference({userId})` is a keyed account panel, to be mounted by the coordinator. It starts unknown, explains the field/retention limits, and sends only choice, expected revision and a stable request UUID. Neither enrollment nor participant note/AI/sharing permission is an analytics opt-in. Choosing not to measure preserves product functionality.

The database serializes initial preference creation and subsequent CAS changes. Unconfirmed requests retain their exact identifier/body; a conflict requires explicit reload. Identical retries return the current authorized choice without changing it. A later contrary choice is not undone by replaying an earlier command. The last finite revision is reserved for withdrawal. Ordinary active request receipts are bounded at2000; withdrawal remains possible. A successful restrictive choice removes attributable optional events, mappings and delivery receipts before acknowledgement. Retrying an already withdrawn choice is a no-op.

The preference itself persists as an account setting until account deletion or another deliberate choice. It is not a temporary analytics identity and does not contain private evidence. Its separate lifetime is disclosed.

## Temporary events and mappings

`firstten_private.product_event_log` contains only the fixed two-event enum, schema/producer/source enums, server clocks, trusted environment/population, opaque account/project/artifact references, measurement-choice revision and internal expiry. There is no arbitrary JSON metadata or client event-ingestion endpoint. All event/mapping/delivery/preference-receipt tables have RLS and no direct anonymous, authenticated or service-role read/write grants. Public functions are narrowly granted; only the bounded expiry-purge RPC is available to the existing server role.

Account, project and interview mappings use random opaque UUIDs. Mapping expiry is fixed when created, at most30days; activity never renews it. Project/artifact mappings and events end no later than their account-mapping boundary. Expired mappings are not reused. Rotation can shorten observation windows and lose longitudinal continuity; a future cohort service must mark those boundaries as missing/immature coverage, not infer a new signup or silently merge identities. No account/guest/browser identity merging occurs.

Events and delivery/preference receipts also have fixed at-most30day eligibility. Expiry is distinct from verified physical deletion: `purge_expired_product_measurement(limit)` deletes bounded batches from each relation and records the database check time. It retains an expired mapping while associated event bytes remain, so a later withdrawal can still identify and erase them. Purge retries are safe; it never touches product work, durable product markers, consent audit or AI charges. Large backlogs require repeated bounded runs. No scheduled purge is configured by this source; production must remain disabled until the coordinator wires, rehearses and records a real daily job. An operator policy cannot enable without a recorded start and purge-schedule verification receipt; that receipt alone is not evidence the schedule ran.

## Durable product idempotency metadata

`product_milestone_markers` is a separate product-operation relation: existing account ID, source kind/ID, owning project ID, baseline flag and database mark time. It has **no analytics pseudonym, event link, evidence text or arbitrary payload**. It deliberately survives source/project deletion to prevent a caller recreating the same UUID from fabricating a first completion after30day receipt expiry. This narrowly approved purpose lasts to account deletion, which cascades the marker. It is not an undeclared permanent analytics identity or a permanent event/delivery receipt.

Migration25 marks existing project/interview identifiers as a metadata-only legacy baseline and emits zero historical events. Existing incomplete interview rows are conservatively excluded from prospective first-occurrence metrics too: their earlier completion history is unknown. Fresh owner choices never backfill those milestones. No historical completion clock is invented.

Deleting an interview removes its attributable event/mapping/delivery rows while retaining its product marker. Project deletion removes attributable event/project mapping rows and its interview cascades remove their analytics. Account deletion first removes all attributable optional measurement, then cascades preferences, remaining mappings/receipts and durable product markers. Previously published properly de-identified aggregates cannot promise recall; this slice produces none.

## Retention health and release boundaries

The health RPC accepts only a request UUID, checks the current database platform-admin grant under lock and records `funnel_snapshot` in the existing append-only admin audit before responding. Its fixed output is collection/start/purge state, expired-row count and oldest expiry; no subject list, raw events, project/student text or funnel counts. The server helper additionally refreshes account identity and admin authorization. Presenter metadata is not a platform grant. Failed audits withhold the result.

Health distinguishes disabled, recently checked with no expired backlog, and overdue. It does not claim that a scheduler exists. A stale cleanup check stops new collection even if an operator previously enabled it. Disabling collection preserves saved work and retention controls. It neither stops the app nor resets product idempotency markers.

The isolated clone harness requires an exact reviewed25 hash, exact running dedicated container, every5432 binding on55322, source24 sentinel with no25 sentinel/history, an absent random database, schema-only restore and zero source auth/project rows. Only then does it seed fictional pre25 rows and apply25 to the clone. It verifies baseline-only behavior, real rollback SQL, fresh production-schema DTOs and separate-session race barriers. It marks creation attempted before CREATE and finally drops that exact clone and verifies absence even after a lost creation acknowledgement. The exact candidate was independently reviewed before every disposable rehearsal; actual results follow.


## Verification receipt, 2026-10-18

Final migration SHA256 `fc798efda3a426411c279a7cfef19c2a22dcc3b99b0b91010f354792428848cf` remained unchanged throughout all rehearsals. Final harness `0d770557e3e0cae86fde3366155a7a3f5aab695a16cfb64fc00b3778b8ba19ba`, race harness `25f7e264da7e82798095e4bb3ddbe525a88a4d1741c9cce1dcf0d299c58b82b2` and SQL fixture `51e7f46ed48032fe6b35a16399cbbc755386757e934a5f6d715ee83e4e6be2b1` were reviewed by the coordinator before execution.

The final schema-only disposable clone passed **1863 actual rollback SQL assertions**, zero failures/known gaps, valid TAP plan and verified rollback. Two fresh actual SQL DTO/privacy checks passed through the production schemas. Three independently connected races observed genuine lock waits: duplicate canonical completion yielded one completed source/event; a withdrawal racing legacy completion preserved the business write with no measurement; simultaneous project creations produced two project events under one account subject. The clone was dropped and its absence verified. Original dedicated local and hosted databases were never modified by these rehearsals; production collection remains disabled.

The pre25 synthetic baseline includes a project, an already completed interview and an incomplete interview. Applying25 produced three product markers, zero events and a disabled policy. Later test-only opt-in/completion of the old incomplete interview still emitted zero events. This verifies conservative unknown-history exclusion rather than silently backfilling a legitimate future cohort.

Three earlier attempts were retained and classified accurately: an artificial fixture aging statement evaluated multiple clocks and exceeded the30day constraint by a microsecond; the health-test admin fixture needed normal exact-account cleanup to avoid polluting an existing later SEC006 baseline assertion; and three race diagnostic SQL templates needed whitespace after bound parameters. No product constraint or prior test assertion was weakened. Every failed-attempt clone was dropped and absence verified.

Receipts: `/private/tmp/firstten-an002-rehearsal-first.log`, `-second.log`, `-third.log`, and the passing `/private/tmp/firstten-an002-rehearsal-passing.log`; actual SQL output `/private/tmp/firstten-an002-policy-result.txt`; actual DTOs `/private/tmp/firstten-an002-actual-dtos.json`. These temporary fictional verification artifacts are not production observations and are not committed.

Final isolated software verification: **1107 passing app tests across119 passing files**,25 intentional actual-fixture skips in three other gated suites; the two AN002 actual-SQL checks were enabled. Typecheck, scoped lint, formatting/diff checks and the final Vercel production build passed. Root owns the Account parent mount, official public types, combined review and any normal deployment/schema application. Production activation, a real daily retention schedule and the remaining AN002 event stages are not completed by this implementation.
