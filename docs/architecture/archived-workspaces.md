# Archived owner workspaces (WS-009)

Archiving is a recoverable content freeze. The database, including old browser callers and definer RPCs, enforces it. Owner read, review, PDF export, restore, explicit deletion and narrowly defined privacy reductions remain available. This is not a retention purge, an account deletion implementation, a class archive, or a new collaborator permission.

## Mutation boundary

Migration `20261018020000` guards project content and the project-scoped contacts, interviews, learnings, experiments, outreach, marketing plans, teacher plans, discovery workspaces, interview drafts, consent choices, project memberships, class/project associations, project invitations, AI reservations/dispatch transitions and retrieved public-context stores. It follows migrations18 and19; absence of their required tables is an apply error, not a silently skipped guard.

The authenticated role loses its table-wide project UPDATE grant and receives only the existing content-column grants. It cannot directly restore a project, set lifecycle revisions, change owner IDs or edit timestamps. The existing lifecycle RPC retains compare-and-swap and stable request replay. A mixed privileged archive/restore plus content edit is rejected too. RLS and owner checks remain unchanged.

The child INSERT/UPDATE trigger acquires the matching parent `FOR SHARE NOWAIT`. A committed archive prevents the content write; a prior accepted content write holds that lock until its transaction ends, so archive waits. NOWAIT avoids a child-row→parent wait deadlocking with existing parent→child RPCs. A conflict returns the safe `WORKSPACE_BUSY` error, and callers keep local edits for retry/export. No custom session setting, trigger-depth rule, or general service-role bypass grants write access. PostgreSQL documents these [row lock conflicts](https://www.postgresql.org/docs/17/explicit-locking.html) and that a [table grant overrides a column revoke](https://www.postgresql.org/docs/15/sql-grant.html).

`save_generated_outreach` checks archive before even an empty generated replacement. Its DELETE-only case is a replacement operation, not an explicit user deletion. Marketing and teacher save RPCs return `ARCHIVED` or `BUSY`; other guarded direct writes use the shared safe error message. A stale page cannot display a false save success or reset the local form after a rejected save.

## Narrow exceptions

- Owner reads/exports and lifecycle restore preserve recovery. Restoration never regrants a withdrawn choice.
- Existing explicit child/project DELETE remains available. Contact `ON DELETE SET NULL` and project cascades continue working; no role or trigger-depth bypass is needed. The original project table does not establish a general auth-user cascade, so this change makes no account-erasure claim.
- Consent edits may keep an already granted choice while restricting another; they cannot introduce a new grant while archived. Existing evidence-invalidated markers cannot be cleared. The guard handles both phases of `INSERT ... ON CONFLICT`.
- An active private interview draft may clear all notes, quotes and tags and withdraw all three choices. Its exact question snapshot and other fields stay fixed; contact may remain or be unlinked. This remains possible at the terminal revision. Completion still requires an active project.
- Discovery context IDs may only be added to the excluded set while every other document/history field remains fixed. This privacy-only save creates no new sensitive history copy. Retained historical text is not purged.
- Membership/invitation revocation, removal of an existing class association and reviewed public-source withdrawal remain possible. New grants, reactivation, new associations, retrieval previews and content changes are blocked. Migration19 supplies archived owner read/withdraw;20 does not duplicate its DTO/functions.
- A losing contact reference resets the affected interview AI choice to unknown and invalidates derived-learning AI choices in the same transaction. Notes remain private and retained. An automatic `contact_unlinked` history event distinguishes this from an owner-reported choice. Active owners may deliberately review and grant the interview choice again; derived learning retains its existing invalidation gate. Terminal consent revisions cannot regain grants. During project deletion, the parent is already absent and its consent/interview children are deleted, so no replacement children are created.

## In-flight AI and retrieval

The established dispatch claim is the authorization boundary. An AI request claimed before archive may finish and return a temporary draft; archive does not recall remote traffic or promise to withhold a response. Settlement, unknown-outcome accounting and content-free provenance remain available, including reconciliation after project deletion. The returned draft cannot be persisted/adopted into the archived project. New reservations and reserved→in-flight transitions are blocked. No immutable AI prompt, context module or evaluation binding is changed.

Public retrieval failure/expiry accounting may finish after archive; newly retrieved content cannot persist. Archived reviewed sources remain owner-readable and withdrawable. External or previously downloaded copies cannot be recalled.

## Verification and rollback

`supabase/tests/ws-009.sql` is rollback-only and contains synthetic owner fixtures. It checks content and privileged writes, lifecycle column grants, mixed restore writes, exact empty replacement, restrictive consent upserts, draft clearing/context exclusion, contact unlink and deletion, source eligibility after restore, terminal consent revisions, context withdrawal, membership revocation, cascade cleanup and AI accounting continuation. Run it with `00_fixture.sql` through the guarded policy suite in a fresh schema-only clone of the dedicated local 55322 stack, with the reviewed migrations19/20 applied only inside that clone. Never infer permission to apply to the original database.

`src/tests/ws-009/concurrency.mjs` is an explicit opt-in real two-connection rehearsal. Set `WS009_TEST_DATABASE` to the exact newly created `firstten_ws009_<12 hex>` clone name. It refuses the original `postgres` database and checks the Docker host port before connecting, uses synthetic UUIDs, never prints connection secrets, confirms actual blocking through `pg_blocking_pids`, and deletes only its exact owner/project fixture after verifying their labels. It tests edit-before-archive serialization, late edit rejection and parent-first/child-first NOWAIT recovery. It needs no consent audit cleanup exception.

Focused UI tests verify rejected person, outreach and survey saves retain local edits; shared error tests avoid exposing raw database detail. Integration must also run the full application and SQL suites. The coordinator records actual executed checks and hosted publication separately; authored tests alone are not evidence of a passed migration.

Do not roll back by dropping guards on a live database. A deployment rollback can retain this additive migration and earlier compatible callers, which receive safe failed writes. Repair issues with a new forward migration. If a reviewed emergency rollback is required, disable affected write RPCs before changing guards; preserve consent/history/accounting rows and re-establish permissions explicitly. Never restore table-wide authenticated project UPDATE as a quick fix.

## Executed checks (2026-10-18)

Migration20 SHA256 `5b6c7797846795961e5ee272ea1465f4dc31ada28c6a602b135d590932597c6c` was applied after reviewed19 SHA256 `ca9da465943d3f0cabc6a8d2476e94c91a8c58e646812c3514e845b47d1d6a17` in a fresh schema-only local 55322 clone. The clone had zero account/project rows before fixtures. All 85 focused and 1487 combined SQL assertions passed and rolled back. The actual two-connection rehearsal passed all four checks; the exact clone was dropped and its absence verified. No original local or hosted schema was changed.

The six adjusted historical fixture files are `sec-003.sql`, `ws-001.sql`, `cls-001.sql`, `sec-004.sql`, `teacher-plans.sql` and `disc-001.sql`. Column/owner checks now assert the earlier 42501 denial; they do not relax unauthorized access. The Discovery archived-write assertion now makes a real problem-text change, rather than submitting a permitted identical privacy document and accidentally advancing downstream revisions.

All 791 application tests passed under Node 22, plus typecheck, scoped ESLint/Prettier and a production build. Verification used the current generated route tree and already-locked qrcode dependency locally; neither generated files nor dependency manifests are part of this change.
