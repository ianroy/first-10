# Release and recovery runbook

Verified 2026-10-18. The coordinator owns migration numbering, generated types, the route tree and release integration. Workers hand off ordinary scoped commits; no force push, rebase, amend or squash of published history, preserving Lovable synchronization.

## Before a change

1. Read `ProductSpec.md` and roadmap §0–1. Check `git status --short` and the active task claims. Preserve unrelated files, including the owner's class PDF. Use isolated worktrees for independent edits.
2. Reserve each migration's unique 14-digit version in the task handoff **before writing**. The foundation reservations `20261018005000` (SEC-004), `20261018006000` (AI-002 metadata) and `20261018007000` (partner counts) are already applied. `20261018008000` (saved AI origins), `20261018009000` (project lifecycle) and `20261018010000` (platform-admin foundation) are also applied after local policy checks. The next reserved version is `20261018011000` for persisted processing/consent choices (PRV-001). Only the coordinator applies migrations or generates shared files. A lease expiring does not terminate a worker; inspect its actual status first.
3. Inspect the exact target/environment without printing credentials. Hosted First Ten is `hdwnnuvqqkkpontcdbwa`. The existing local First Ten database binds **55322**, API **55321**. The unrelated photo-to-3D stack uses 54322/54321; do not reset, stop or query it. The repository policy runner refuses the protected hosted project and requires an explicitly named/allowlisted disposable target.
4. Check native backup/PITR availability before any change requiring recovery. Availability has **not** been established for the hosted project. Earlier private-data export attempts were rejected by automatic approval review and were not executed. A fixture rehearsal below is not a production backup or a hosted restore guarantee.

## Integrate and migrate

Use additive schema changes compatible with the old app first. Preserve existing rows, ownership, stage/checklist and prior revisions. Introduce new nullable/defaulted fields before backfilling; validate relations and counts before tightening constraints. A real backfill needs its own reviewed, bounded and repeatable plan. Never run a production reset or use a test seed against an implicit target.

```sh
node scripts/check-migrations.mjs --base origin/main
npm run migrations:test
npm run roadmap:check
npm run roadmap:test
```

The migration guard rejects duplicate versions, malformed/empty files, backdated additions and modifications/removal/renaming of any migration in the specified Git baseline. CI fetches the comparison commit and checks the PR base or previous pushed commit. This prevents integration of reused numbers; isolated workers still need explicit reservations. The guard checks history, not SQL semantics, locking or data safety.

Apply proposed migrations to the named local disposable environment first. Run the real rollback-only policy suite and required concurrent-connection tests for atomic state or budget changes. The runner creates its fixtures in one transaction and checks cleanup; do not infer race safety from sequential assertions.

Regenerate official Supabase public types from the verified local database after all serial migration integrations. Keep credentials in tool memory or environment, never output, command literals or Git. The local CLI connection requires `sslmode=disable`; do not copy that setting to a remote connection. Use the Vite route generator for the route tree. Do not hand-edit either generated file.

```sh
npm run typecheck
npm run lint
npm test
NITRO_PRESET=vercel npm run build
```

Review the linked hosted migration dry run. Confirm it lists only the intended unapplied files, then apply normally through the existing authorized operator connection. Keep risky entry points disabled until policy checks, generated types and compatible application code pass. Do not change owner-only policies to make a demo work. Retain an exact migration/version and verification record.

## Release and verify

Commit only intended files, push ordinarily to the connected branch and inspect the deployment until its actual state is Ready. The connected main branch deploys to `https://first-10-three.vercel.app`; deployment success alone does not prove authenticated or provider behavior.

```sh
npm run smoke -- https://first-10-three.vercel.app
```

Run a real desktop browser walkthrough of changed journeys: anonymous access, existing-session/sign-in behavior, owner workspace selection, save confirmation and reload, errors/conflicts, and relevant role denial. Use clearly fictional fixtures and exclude automated, peer and classroom examples from adoption counts. `/api/health` only verifies configuration shape/presence; it does not test Supabase availability, auth delivery or OpenRouter quality. Record model/provider/actual cost for any authorized paid trial; unknown cost remains reserved. The workshop practice cap is separate from general AI policy.

For pitch changes, render the native slide, verify readable placement and decode a QR from the **rendered slide**. Refresh all thirteen PNG exports and the self-contained offline deck. Check browser navigation and Present mode. A printed URL is not automatically a native clickable hyperlink.

## Recovery and rollback

- Prefer an ordinary forward fix or revert commit. Retain published Git history and data. Old client compatibility is why schema changes land before feature enablement.
- Disable only the affected feature/AI kind or revoke the narrow mutation RPC execution grant. Retain intake, generation, reservation and draft records. Revocation is safer than deleting an audit trail or trying to refund an unknown provider outcome.
- For schema errors, add a forward migration preserving rows. Do not undo already-written user data by blindly restoring a database over production.
- A hosted restore requires an actual recoverable backup, a separately verified target, a read-only/maintenance plan, an impact review and explicit operator coordination. Test the restore on a separate destination and compare relationships/counts/content before any cutover. This runbook does not claim that path was rehearsed on hosted data.

## Executed disposable restore rehearsal

`python3 scripts/rehearse-restore.py` is a deliberately bounded local fixture exercise. It verifies the named container's 55322 binding, refuses pre-existing rehearsal database names and creates two new `firstten_restore_20261018_*` databases. It uses a minimal auth-schema fixture, applies the first five actual app migrations, and inserts one fictional owner/project/contact. It dumps only that newly created database, restores into the second new database, applies actual pending migration `20261018004000`, verifies exact fixture JSON equality, stage 2, all six recorded migration versions, no pending replay and anonymous intake denial, then drops only the two databases created by that invocation. It never reads or writes hosted data or dumps an existing database. The archive/report remain in `/private/tmp` for inspection.

Executed successfully on 2026-10-18; see [the machine-readable report](restore-rehearsal-2026-10-18.json). One project and one contact survived exactly, including an unknown count and checklist. New intake was empty and denied anonymous reads. A second migration plan found zero pending versions. This verifies the restore-and-forward-migrate sequence for that six-migration fixture only: it does **not** restore Supabase Auth users/passwords, external services or production content, and it does not validate future migrations.

If the exercise stops early, preserve its databases for inspection. Verify their names and that they were created by this script before removing them; never broaden cleanup to a container or another database.
