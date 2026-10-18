# Real database policy checks

SEC-002 exercises PostgreSQL RLS directly using `anon` / `authenticated` database roles, eight distinct seeded `auth.users` identities and each actor's JWT claim settings. Every assertion runs against the actual migrated tables. This verifies the database authorization boundary rather than a hidden route or a mocked Supabase client. It does **not** test token-signature verification, email delivery, magic-link return or the future class/project-role implementation.

The `editor`, `viewer`, `student`, `teacher` and `admin` fixtures are ordinary authenticated accounts with deliberately untrusted role-shaped claims. No application-role grants exist in the initial schema. They must not read another owner's private records simply because of those labels.

## Safe local execution

Use the separate test stack supplied for this work:

```sh
node --test src/tests/sec-002/*.test.mjs
node scripts/test-policies.mjs --workdir /private/tmp/firstten-policy-db
```

That stack is named `firstten-policy-tests`, with database port **55322** and API port **55321**. The unrelated local project on **54322** is not this test target: do not reset or stop it. The runner does not create, reset or stop a database. It gets credentials from captured `supabase status --workdir ... --output json`; credentials and raw status output are never printed.

Prerequisites: Node 22, `psql`, Supabase CLI and an already-running disposable migrated Supabase database. No JavaScript package install or paid service is required. For a fresh stack, initialize a **separate** workdir with project id `firstten-policy-*`, use unused explicit DB/API ports, copy the migrations and start/apply them locally **with that workdir as the current directory**. Never run these instructions against the repository's production-linked Supabase workdir. If status cannot find the named test container or reports production linkage, the runner stops; recreate the disposable stack from its own directory rather than weakening the target guard.

The runner requires an explicit workdir or `POLICY_TEST_DATABASE_URL`; it does not load `.env`, infer the repository's linked project or default to port 54322. A workdir must have a `firstten-policy-*` project id and its configured DB port must match the target. The known production project is always rejected. Other local/remote targets require an exact credential-free JSON allowlist, for example `POLICY_TEST_DISPOSABLE_TARGETS='["postgresql://disposable.example.test:5432/policy_test"]'`, plus `POLICY_TEST_DATABASE_URL` supplied securely. Allowlisting is an explicit assertion that the database is disposable, never a workaround for production access. Remote connections require certificate verification; `POLICY_TEST_SSL_ROOT_CERT` can supply a CA file. Do not print connection strings in logs.

## Coverage and the known-gap distinction

- RLS enabled and non-superuser/non-bypass test roles.
- Positive owner read/create/update/delete controls for all six app tables.
- Cross-owner reads, updates, deletes and forged/reassigned `user_id` denials.
- Anonymous reads/writes denied, and unrelated role-shaped identities cannot gain private access.
- Actual inserts/updates that probe cross-owner project references, cross-owner or cross-project contact references, and existing child-scope retargeting.
- One transaction for schema helpers, auth fixtures and all mutations. It rolls back on completion; a failed SQL statement/connection closes without commit. The runner verifies fixture/helper absence after normal rollback. An advisory transaction lock prevents concurrent fixtures colliding in the same test database.

The initial migration has **documented integrity gaps**, which the harness records as pgTAP `not ok ... # TODO SEC-003` assertions. Baseline CI permits only those exact tests to fail and prints a warning. A passing baseline means expected owner boundaries work **and the known gaps were honestly reported**; it is not a security-clearance result.

```sh
# This is expected to fail until SEC-003 closes the observed integrity holes.
node scripts/test-policies.mjs --workdir /private/tmp/firstten-policy-db --strict
```

`--strict` removes expected-gap tolerance. Unexpected failures, SQL errors, missing assertions, truncated plans or missing rollback confirmation always fail. A repaired gap passes normally in either mode; no fabricated pass is inserted. SEC-003 should enable strict mode in CI when all gap assertions pass, and add owner/constraint/privileged-function cases without weakening the existing positive controls.

## Extending the suite

The runner executes all `.sql` files here in filename order inside its transaction, with pgTAP installed transactionally if needed. `00_fixture.sql` supplies fictional identities and **security-invoker** helpers; `10_owner_boundaries.sql` tests permissions; `20_legacy_integrity.sql` documents current gaps. Add a later SQL file for new policies/RPCs. Do not put `BEGIN`, `COMMIT`, `ROLLBACK`, database resets or production connections inside case files. Do not leave the actor as a privileged role while testing a denial. Use `RESET ROLE`, set a known fixture actor, then `SET LOCAL ROLE authenticated` (or clear the subject and set `anon`). Assert the effective role and `auth.uid()`.

Helpers catch SQLSTATE rather than logging database error contents. A known-gap assertion tolerates only an actual successful single-row write in baseline mode; syntax errors, unrelated constraint failures or missing features do not become expected failures. New privileged functions must be called directly by both allowed and denied identities; UI-only tests are insufficient.

[The CI workflow](../../.github/workflows/policies.yml) initializes its own `firstten-policy-ci` workdir, starts only disposable Postgres, applies repository migrations, runs safeguard tests and the real suite, and stops only that stack. It uses no production secrets and never reads the repository's linked target. CI evidence is separate from the local run; do not claim GitHub passed before observing its result.
