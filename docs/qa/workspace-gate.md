# Personal workspace journey gate

This gate checks durable owner-private work across account and idea changes. It does not enable shared-project membership, collect a participant study, establish learning outcomes, or claim a physical second-device test. All records below are fictional.

Source baseline: `8c39dba`. The coordinator owns combined-route generation, publication, production rehearsal, migration sequencing and the roadmap status. The tests added here change no product permissions or provider policy.

## Fixture identities

Both accounts have **two projects named “The same idea name”**, with the same description, the same interview question and a contact called **Sam**. Identity and isolation must follow verified owner/project IDs, never display names. Notes contain distinct fictional markers so a name collision cannot conceal a boundary failure.

| Scope | Owner suffix | Project ID                             | Draft ID                               | Contact ID                             | Initial note marker |
| ----- | ------------ | -------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------- |
| A1    | `...0001`    | `c2070000-0000-4000-8000-000000000011` | `c2070000-0000-4000-8000-000000000021` | `c2070000-0000-4000-8000-000000000031` | `FICTIONAL_BASE_A1` |
| A2    | `...0001`    | `c2070000-0000-4000-8000-000000000012` | `c2070000-0000-4000-8000-000000000022` | `c2070000-0000-4000-8000-000000000032` | `FICTIONAL_BASE_A2` |
| B1    | `...0002`    | `c2070000-0000-4000-8000-000000000013` | `c2070000-0000-4000-8000-000000000023` | `c2070000-0000-4000-8000-000000000033` | `FICTIONAL_BASE_B1` |
| B2    | `...0002`    | `c2070000-0000-4000-8000-000000000014` | `c2070000-0000-4000-8000-000000000024` | `c2070000-0000-4000-8000-000000000034` | `FICTIONAL_BASE_B2` |

Owner A is `c2070000-0000-4000-8000-000000000001`; owner B is `c2070000-0000-4000-8000-000000000002`. These IDs are limited to the test doubles and an empty disposable database clone. They are not production users or login credentials.

## Component integration results

The nine added component tests passed locally on 2026-10-18. They mount the real `ProjectSelectionProvider`, owner/project query hooks, `RequireProject` and `InterviewDraftSession`, or the real Interview route for generation boundaries. A memory transport supplies deterministic database replies; server-function doubles supply draft/AI replies. Forced scope controls deliberately exercise boundaries even while work is in flight. These are automated component journeys, not claims about real network persistence, deployed AI, browser-navigation confirmation or real authentication across devices.

| Journey                                                                         | Required result                                                                                               | Observed in automated component test                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Save in A1, A2, B1, B2; revisit both accounts with a fresh query cache          | Four exact acknowledged notes remain distinct; per-account selected IDs survive remount                       | Passed; `FICTIONAL_ACK_A1/A2/B1/B2` restored in their original drafts                                                           |
| Original owner's save commits, response arrives after B1 opens                  | B1 never shows A1's text/revision; returning to A1 recovers its acknowledged save                             | Passed; B1 remains at its own revision and A1 returns with revision 3                                                           |
| Legacy single-project user adds another idea through the existing create helper | Original project fields and saved draft remain byte-for-byte unchanged                                        | Passed; original question, checklist and private draft are retained on return                                                   |
| Archive rejects a save while the active editor holds newer local notes          | Local notes remain; no automatic retry or false saved claim; explicit restore/retry can save                  | Passed; original saved note unchanged during rejection, newer note saved only on deliberate retry                               |
| Completion commits but its response arrives while A2 or B1 is open              | The other scope stays active and unchanged; original draft returns as a terminal receipt                      | Passed in both project and account transitions; one completion call, original receipt recovered on return                       |
| Completion commits but its acknowledgement is lost                              | Do not claim completion before confirmation; re-entry recovers the terminal receipt without a second finalize | Passed; unavailable status shown first, then the stored terminal receipt recovered after returning from A2                      |
| Generation for A1 finishes while A2 has its own pending generation              | A1 response cannot alter A2's editor or busy state; retry identity stays scoped                               | Passed; A2 shows only its own draft, saved preparation remains unchanged, A1's uncertain retry reuses its original operation ID |
| Generation finishes after switching from owner A to owner B                     | No old-owner draft is displayed; B1 has a distinct request identity                                           | Passed; A's uncertain identifier remains under A's own session-storage key                                                      |

Run these checks with:

```sh
node_modules/.bin/vitest run src/tests/workspace-journeys src/tests/ws-007
node --test src/tests/ws-007/clone-guards.test.mjs
```

The five pure clone-guard tests passed: exact container identity/running state, every port binding set to dedicated `55322`, strict disposable database naming, exact reviewed history binding, separate actual-schema sentinels and an empty-clone requirement. These unit tests perform no Docker or database operation.

## Real database rehearsal

The real clone rehearsal **passed on 2026-10-18**, after coordinator review and explicit approval of the exact harness/guard hashes. The successful harness hash is `793b3dfdff35ee7f4d7a942df3ab740872c8c50dc486daeda04b20b0bf7f88ea`; guards are `78e6c7d4b93a32f72e2d5e518127c2dc19e88baa8a0092b966948e4834d0b869`. The [committed receipt](../../src/tests/ws-007/rehearsal-20261018.json) preserves both attempts, fixture IDs, schema snapshot hashes and confirmed cleanup. No product code or database permission was changed by this test task.

The first attempt stopped on a test-driver assertion: PostgreSQL returned a bigint revision as string `"2"`, which the harness compared to number `2`. It recorded `complete: false` and confirmed that disposable clone `firstten_ws007_2736b95591c9` was absent. After the narrow numeric normalization and renewed exact-source approval, the second clone `firstten_ws007_619b3b604ba4` passed all assertions and was removed. This was a harness compatibility correction, not a product defect or a waived assertion.

`src/tests/ws-007/clone-rehearsal.mjs` checks the exact running `supabase_db_hdwnnuvqqkkpontcdbwa` container and all its PostgreSQL port bindings. It takes a schema-only snapshot from the dedicated local database, creates one fresh `firstten_ws007_<12 lowercase hex>` clone and requires zero copied accounts/projects before inserting fixtures. No hosted URL or arbitrary connection target is accepted. Ordinary authenticated-role RPCs act under the two fictional subject IDs. These calls test database/RLS behavior; they do not verify actual Supabase Auth login sessions.

Local migration history remains at `20261018003000` because later local migrations were applied as reviewed SQL. The rehearsal does not rewrite that history or mislabel it as schema 24. Before and after the snapshot it independently requires history marker `20261018003000`, actual schema-24 table `firstten_private.marketing_submission_versions` present, and reserved schema-25 table `firstten_private.product_event_log` absent. The applied schema-24 source pin is `9bd05330ef36dc72109419b2b9dcc297242cace0468d7a816b16d8e0a48e3634`; successful snapshot SHA-256 is `46d5e70720137b1c456f4ccc7a087ea29bf48c851a3dc58f51d963bc7a09f6f8`. Future schema changes require a separately reviewed rehearsal configuration rather than weakening these checks.

All of these real assertions passed:

1. Each owner sees precisely their two project, contact and draft IDs despite identical names. Foreign-owner and same-owner wrong-project draft operations fail closed.
2. Creating a second idea with `create_owned_project` retains the first idea's complete row and previously acknowledged private draft unchanged.
3. A draft save holds the project lock; an archive genuinely waits, verified with separate backend PIDs and `pg_blocking_pids`. The committed saved document survives archive/restore, and its identical retry returns the same acknowledgement without another revision.
4. An archive holds the project lock; a draft save genuinely waits, then receives `ARCHIVED` without changing the saved document/revision. Explicit restore and retry can save once.
5. Finalization holds the project lock; an archive genuinely waits. The completed interview, consent, capture receipt and terminal draft survive archive/restore. Completion retry returns the same interview ID.
6. Archive holds the project lock; finalization genuinely waits, then receives `ARCHIVED` without creating an interview or capture receipt. After explicit restore, finalization and retry create exactly one interview/consent/capture.
7. AI usage operations and AI context claims remain empty. No provider request is dispatched.

The clone commits fictional transactions because independent sessions must observe actual row locks and persisted receipts. It preserves the installed append-only triggers and never deletes audit rows or disables protections. Cleanup closes all clone connections and drops only the exact generated database whose absence was checked before CREATE. Creation intent is recorded before dispatch so a lost CREATE acknowledgement still enters cleanup. DROP acknowledgement is followed by a separate exact absence query. The successful private receipt at `/private/tmp/firstten-ws007-clone-receipt.json` records `complete: true`, `clone_absent: true`, zero provider calls and zero source-data write operations. The successful command output and committed receipt also record four observed lock races. The committed receipt retains these results after temporary files expire.

Final local checks on source baseline `8c39dba` plus this scoped test change: nine new component tests and five pure Node guard tests passed; full Vitest suite passed 1,086 tests with 17 existing skips across 113 passing and two skipped files. Typecheck, scoped ESLint, formatting and a Vercel build passed. The coordinator must rerun combined integration checks because newer main includes additional work absent from this isolated baseline.

## Existing evidence and limits

- WS-001 SQL already checks archive/restore retains original project/child bytes and rejects foreign lifecycle operations.
- WS-002 and WS-008 already cover owner-only queries, persisted selection, unavailable explicit selection, stale reads, account changes, separate-idea creation and recovery.
- WS-004/005 already cover exact question snapshots, autosave acknowledgements, immutable uncertain retry payloads, scope changes, local conflict preservation and terminal/uncertain completion receipts.
- Existing real database races cover save versus save, completion versus completion, and an ordinary child update versus archive. The new clone harness adds draft-specific save/completion versus archive in both orders.
- WS-003 has coordinator-reported live desktop idea switching, saved-work reload and archive/restore rehearsal. Those observations belong to the coordinator's dated release evidence; the worker did not perform an independent production browser run here.

Physical cross-device testing, fresh production login of both fictional owners, offline browser reconnect and browser-specific storage restrictions remain distinct release checks. Deferred AI replies here are synthetic transport fixtures; all live AI dispatch remains paused. Shared-project membership and collaborative editing remain separate unfinished features.
