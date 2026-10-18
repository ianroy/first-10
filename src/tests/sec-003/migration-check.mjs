#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalConfig, validateTarget } from "../../../scripts/test-policies.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tables = ["projects", "contacts", "interviews", "learnings", "experiments", "outreach"];
const rows = tables
  .map(
    (table) => `SELECT '${table}'::text AS relation, to_jsonb(t) AS record FROM public.${table} t`,
  )
  .join(" UNION ALL ");
const fingerprintSql = `SELECT md5(coalesce(string_agg(value, '|' ORDER BY value), '')) FROM (
  SELECT relation || record::text AS value FROM (${rows}) app_rows
  UNION ALL SELECT conname || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN (${tables.map((table) => `'public.${table}'::regclass`).join(",")})
  UNION ALL SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (${tables.map((table) => `'public.${table}'::regclass`).join(",")})
  UNION ALL SELECT 'private_function:' || pg_get_functiondef(p.oid) || coalesce(p.proacl::text,'') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='firstten_private'
  UNION ALL SELECT 'private_schema:' || nspname || coalesce(nspacl::text,'') FROM pg_namespace WHERE nspname='firstten_private'
  UNION ALL SELECT 'rls:' || relname || relrowsecurity::text FROM pg_class WHERE oid IN (${tables.map((table) => `'public.${table}'::regclass`).join(",")})
  UNION ALL SELECT 'fixture_users:' || count(*)::text FROM auth.users WHERE id::text LIKE 'f1000000-0000-4000-8000-%'
  UNION ALL SELECT 'helper_schema:' || count(*)::text FROM pg_namespace WHERE nspname = 'firstten_policy_test'
) fingerprint;`;

function run() {
  const workdir = process.env.POLICY_TEST_WORKDIR;
  const url = process.env.POLICY_TEST_DATABASE_URL;
  if (!workdir || !url)
    throw new Error(
      "Set POLICY_TEST_WORKDIR and POLICY_TEST_DATABASE_URL for the named disposable local stack.",
    );
  const config = parseLocalConfig(readFileSync(join(workdir, "supabase/config.toml"), "utf8"));
  const target = validateTarget(url, { projectId: config.projectId, configuredPort: config.port });
  if (!target.local)
    throw new Error(
      "Migration fixtures require a named local disposable stack; remote targets are never allowed.",
    );
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  Object.assign(env, {
    PGHOST: target.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: String(target.port),
    PGDATABASE: target.database,
    PGUSER: target.username,
    PGPASSWORD: target.password,
    PGSSLMODE: "disable",
    PGCONNECT_TIMEOUT: "5",
  });
  const execute = (sql) =>
    spawnSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
      input: sql,
      env,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 4_000_000,
    });
  const initial = readFileSync(join(root, "supabase/migrations/20261017000000_init.sql"), "utf8");
  const migration = readFileSync(
    join(root, "supabase/migrations/20261018000000_private_relationships.sql"),
    "utf8",
  );
  const fixtures = readFileSync(join(root, "supabase/tests/00_fixture.sql"), "utf8");
  if (/^\s*(?:COMMIT|ROLLBACK)\b/im.test(initial + migration + fixtures))
    throw new Error("Fixture inputs must not commit or end the outer rollback transaction.");
  const before = execute(fingerprintSql);
  if (before.status !== 0)
    throw new Error("Cannot fingerprint the isolated baseline; database output withheld.");
  const noFixtures = execute(
    "SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'f1000000-0000-4000-8000-%') AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='firstten_policy_test');",
  );
  if (noFixtures.status !== 0 || noFixtures.stdout.trim() !== "t")
    throw new Error("Reserved policy fixtures already exist; refusing to overwrite them.");

  const preserve = `DO $preserve$ BEGIN
    IF EXISTS (SELECT * FROM sec003_before EXCEPT SELECT * FROM (${rows}) after_rows) OR EXISTS (SELECT * FROM (${rows}) after_rows EXCEPT SELECT * FROM sec003_before) THEN
      RAISE EXCEPTION 'Migration changed an existing record';
    END IF;
  END $preserve$;`;
  const enforced = `DO $enforced$ BEGIN
    IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('contacts_project_id_fkey','interviews_project_id_fkey','learnings_project_id_fkey','experiments_project_id_fkey','outreach_project_id_fkey') AND convalidated AND cardinality(conkey)=2 AND connamespace='public'::regnamespace) <> 5
      OR (SELECT count(*) FROM pg_constraint WHERE conname='interviews_contact_id_fkey' AND convalidated AND cardinality(conkey)=3 AND connamespace='public'::regnamespace) <> 1
      OR (SELECT count(*) FROM pg_trigger WHERE tgname='enforce_private_identity' AND tgenabled='O') <> 6 THEN
      RAISE EXCEPTION 'Missing validated ownership constraints or identity triggers';
    END IF;
  END $enforced$;`;
  const cases = [
    { name: "empty legacy database", populated: false },
    { name: "valid populated legacy database", populated: true },
    ...["contacts", "interviews", "learnings", "experiments", "outreach"].map((table) => ({
      name: `${table} mismatched project is refused without changing records`,
      populated: true,
      expected: `${table}_project`,
      corrupt: `INSERT INTO public.${table}(user_id,project_id${table === "contacts" ? ",first_name" : ""}) VALUES (firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_b')${table === "contacts" ? ",'Fictional inconsistent fixture'" : ""});`,
    })),
    ...["contact_b", "contact_a2"].map((contact) => ({
      name: `${contact === "contact_b" ? "cross-owner" : "same-owner cross-project"} interview contact is refused without changing records`,
      populated: true,
      expected: "interviews_contact",
      corrupt: `INSERT INTO public.interviews(user_id,project_id,contact_id) VALUES (firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),firstten_policy_test.id('${contact}'));`,
    })),
  ];
  for (const scenario of cases) {
    const apply = scenario.expected
      ? `DO $refusal$ DECLARE problem text; counts text; BEGIN
      BEGIN
        EXECUTE $migration_sql$${migration}$migration_sql$;
        RAISE EXCEPTION 'Expected legacy audit refusal did not occur';
      EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS problem = MESSAGE_TEXT, counts = PG_EXCEPTION_DETAIL;
        IF problem <> 'SEC-003 migration blocked: legacy ownership relationships need review.'
          OR coalesce((counts::jsonb ->> '${scenario.expected}')::bigint, -1) <> 1
          OR (SELECT sum(value::bigint) FROM jsonb_each_text(counts::jsonb)) <> 1 THEN
          RAISE EXCEPTION 'Unexpected legacy audit refusal';
        END IF;
      END;
    END $refusal$;`
      : migration;
    const sql = [
      "BEGIN; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='3s'; SET LOCAL client_min_messages=warning; SELECT pg_advisory_xact_lock(171017, 2);",
      // Rebuild only these legacy tables INSIDE the transaction. This tests the exact
      // initial and new migrations even if the disposable stack is already hardened.
      "DROP TABLE public.interviews, public.learnings, public.experiments, public.outreach, public.contacts, public.projects CASCADE;",
      initial,
      scenario.populated ? fixtures : "",
      scenario.corrupt ?? "",
      `CREATE TEMP TABLE sec003_before ON COMMIT DROP AS ${rows};`,
      apply,
      preserve,
      scenario.expected ? "" : enforced,
      "SELECT 'MIGRATION_CASE_PASSED'; ROLLBACK;",
    ].join("\n");
    const result = execute(sql);
    const after = execute(fingerprintSql);
    if (after.status !== 0 || after.stdout !== before.stdout)
      throw new Error(
        `${scenario.name}: baseline restoration failed; stop using this disposable stack.`,
      );
    if (result.status !== 0 || !result.stdout.includes("MIGRATION_CASE_PASSED"))
      throw new Error(
        `${scenario.name}: fixture failed; transaction closed and baseline restoration verified. Database output withheld.`,
      );
    console.log(`PASS ${scenario.name}; records preserved and fixture transaction rolled back.`);
  }
  console.log(
    `Migration scenarios: ${cases.length}; all passed on ${target.target}. No production target was used.`,
  );
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration check failed safely.");
  process.exitCode = 1;
}
