# SEC-003 ownership migration checks

The migration `supabase/migrations/20261018000000_private_relationships.sql` preserves all six existing tables, fields, RLS policies and foreign-key names. It adds composite uniqueness, strengthens the existing foreign keys to match owner/project, and installs a security-invoker identity trigger in a non-exposed schema. There is no data backfill, reassignment, deletion, new role grant or public RPC.

## Operator review and deployment

1. Run `supabase/tests/ownership.sql` read-only against the explicitly selected environment as an authorized operator. It returns only six aggregate counts. Keep any subsequent row-level diagnosis private.
2. A nonzero count blocks deployment. Determine the intended owner/project from authoritative records, obtain any required owner approval, and prepare a separate reviewed corrective migration. Do not infer ownership from one foreign key, discard records or reset the database. Keep dependent features disabled until all counts are zero.
3. Review the migration and take the environment's normal recoverable backup. Apply through the normal migration mechanism. Its single `DO` statement is atomic even without a client transaction. It obtains locks on the six tables, reruns the audit, then validates the new constraints. Lock acquisition times out after five seconds; use a deployment window because the locks briefly block readers/writers. A lock/audit/constraint failure leaves the prior schema and all rows intact; retry only after resolving the cause.
4. Confirm the six foreign keys are validated, the six identity triggers are enabled, existing owner reads/writes succeed, and the strict suite passes on a disposable environment. Regenerate public schema types from the migrated database; relationship metadata changes, although row fields do not. No manual generated-type edits are needed.

Contact deletion still sets only `interviews.contact_id` to null, preserving its non-null owner/project and interview content. Project deletion retains the existing cascading behavior. The composite foreign-key column-list action requires PostgreSQL 15 or later; [PostgreSQL's constraint documentation](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK) describes the behavior. The migration explicitly rejects an older server. Local verification uses PostgreSQL 17.

The identity trigger rejects changes to `id`, `user_id`, `project_id` (on child tables) and `created_at`, including privileged service-role writes. Updating content or selecting another contact within the same owner/project remains allowed. A future ownership-transfer feature needs a separately reviewed operation; disabling the trigger is not an application workaround.

## Reproducing the real migration fixtures

Prerequisites: Node, `psql`, the repository migrations, and the explicitly isolated local Supabase stack. Supply `POLICY_TEST_DATABASE_URL` securely from the verified local stack; never echo it or use a hosted URL. Set `POLICY_TEST_WORKDIR` to that stack's directory. The checker reuses SEC-002's target guard, requires matching `firstten-policy-*` configuration and loopback, and does not accept a remote allowlist.

```sh
node src/tests/sec-003/migration-check.mjs
node scripts/test-policies.mjs --strict
```

The migration checker rebuilds **only the six legacy tables inside rollback transactions**, applies the actual initial migration, seeds fictional records, and executes the actual SEC-003 migration. It never commits this rebuild. It works before or after SEC-003 is installed on the disposable stack. Do not use this checker as a production audit; use the read-only SQL above.

Nine scenarios cover an empty legacy schema, valid populated rows, each of five child/project mismatches, a cross-owner interview/contact link and a same-owner cross-project interview/contact link. The invalid cases require the exact audit refusal and expected count, verify every fixture record is unchanged, and roll back. After every scenario, a separate query compares fingerprints of original app rows, constraints, triggers, private helper definitions/permissions, RLS flags and reserved fixture absence. Fingerprints and private rows are not printed.

`supabase/tests/sec-003.sql` adds mandatory pgTAP checks for validated constraints, immutability, helper permissions, permitted same-project changes, null contact support, contact deletion, project cascades and service-role defenses. Unlike the legacy gap fixtures, these checks have no TODO tolerance. Keep `--strict` enabled after integration.

## Drift and rollback

Expected schema drift: two composite unique constraints; five strengthened project foreign keys and one strengthened contact foreign key under their old names; one private schema/function and six identity triggers. No public row columns or policies change. The public types were generated with Supabase CLI 2.121.0 against the verified local database, then formatted with the repository formatter. Alongside composite relationships, this generator emits `ComputedFields: never`, uses `NonNullable<Json>` for NOT NULL JSON columns, and omits the hosted `__InternalSupabase.PostgrestVersion` hint when using `--db-url`. These are generator-output differences, not additional SQL column changes. One existing checklist object cast in `learnings.tsx` is narrowed to `NonNullable<Json>` to match the generated type; its runtime behavior is unchanged.

A failed migration is atomic and preserves records. After a successful deployment, prefer a reviewed forward correction. Reverting UI code does not remove these compatible database protections. Do not restore permissive foreign keys, disable RLS/triggers, drop records or change owners as a rollback shortcut. If a future feature conflicts, disable that dependent feature while preserving data and the current protections.

Local evidence must be reported separately from hosted deployment and GitHub CI. The coordinator performs hosted review/deployment and updates task status; these tests do not authorize an autonomous production migration.
