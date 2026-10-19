import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
import { measurementRaces } from "./races.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = "firstten_measurement_test_" + randomBytes(5).toString("hex");
assert.match(database, /^firstten_measurement_test_[a-f0-9]{10}$/);
const migration = readFileSync(
  root + "/supabase/migrations/20261018025000_product_event_capture.sql",
  "utf8",
);
assert.equal(
  process.env.FIRSTTEN_AN002_APPROVED_SHA,
  createHash("sha256").update(migration).digest("hex"),
  "Coordinator exact migration approval required before clone actions",
);
const docker = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    maxBuffer: 28000000,
  });
const [info] = JSON.parse(docker(["inspect", container]));
assert.equal(info.Name, "/" + container);
assert.equal(info.State.Running, true);
assert(
  info.NetworkSettings.Ports["5432/tcp"]?.length &&
    info.NetworkSettings.Ports["5432/tcp"].every((p) => p.HostPort === "55322"),
);
const sql = (db, input, user = "postgres") =>
  docker(
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1"],
    input,
  );
let creationAttempted = false,
  phase = "guarded empty schema-only clone";
try {
  assert.equal(
    sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
    "0",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT to_regclass('firstten_private.marketing_submission_versions')IS NOT NULL AND to_regclass('firstten_private.product_event_log')IS NULL",
    ).trim(),
    "t",
    "Source24 sentinel required; no25 source application allowed",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT count(*)FROM supabase_migrations.schema_migrations WHERE version>='20261018025000'",
    ).trim(),
    "0",
    "Historical direct applies04-24 need not have migration-history rows; never rewrite history",
  );
  const schema = docker([
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema-only",
  ]);
  creationAttempted = true;
  sql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  sql(database, schema, "supabase_admin");
  assert.equal(
    sql(
      database,
      "SELECT(SELECT count(*)FROM auth.users)+(SELECT count(*)FROM public.projects)",
    ).trim(),
    "0",
  );
  // Fictional pre25 rows prove metadata-only baseline without copying any original content.
  sql(
    database,
    "INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES('c250b000-0000-4000-8000-000000000001','authenticated','authenticated','legacy-measurement@example.invalid','{\"synthetic\":true}','{}');INSERT INTO public.projects(id,user_id,name)VALUES('c250b000-0000-4000-8000-000000000002','c250b000-0000-4000-8000-000000000001','Fictional legacy baseline');INSERT INTO public.interviews(id,user_id,project_id,completed)VALUES('c250b000-0000-4000-8000-000000000003','c250b000-0000-4000-8000-000000000001','c250b000-0000-4000-8000-000000000002',true),('c250b000-0000-4000-8000-000000000004','c250b000-0000-4000-8000-000000000001','c250b000-0000-4000-8000-000000000002',false);",
  );
  phase = "reviewed25 only on disposable clone";
  sql(database, migration);
  assert.equal(
    sql(
      database,
      "SELECT(SELECT count(*)FROM firstten_private.product_milestone_markers WHERE baseline)::text||':'||(SELECT count(*)FROM firstten_private.product_event_log)::text||':'||(SELECT enabled FROM firstten_private.product_measurement_policy)::text",
    ).trim(),
    "3:0:false",
  );
  assert.equal(
    sql(
      database,
      "SELECT count(*)FROM firstten_private.product_milestone_markers WHERE source_id='c250b000-0000-4000-8000-000000000004'AND baseline",
    ).trim(),
    "1",
    "Pre25 incomplete interview history remains conservatively unknown",
  );
  sql(
    database,
    "BEGIN;UPDATE firstten_private.product_measurement_policy SET enabled=true,environment='test',instrumentation_start=clock_timestamp(),last_purge_at=clock_timestamp(),purge_schedule_verified_at=clock_timestamp(),purge_schedule_receipt=repeat('a',64);SELECT set_config('request.jwt.claim.sub','c250b000-0000-4000-8000-000000000001',true);SET LOCAL ROLE authenticated;SELECT public.save_product_measurement_preference('granted',0,'c250b000-0000-4000-8000-000000000005');UPDATE public.interviews SET completed=true WHERE id='c250b000-0000-4000-8000-000000000004';RESET ROLE;UPDATE firstten_private.product_measurement_policy SET enabled=false,environment='development',instrumentation_start=NULL,purge_schedule_verified_at=NULL,purge_schedule_receipt=NULL;COMMIT;",
  );
  assert.equal(
    sql(database, "SELECT count(*)FROM firstten_private.product_event_log").trim(),
    "0",
    "Later eligible choice/completion never invents a first occurrence for legacy incomplete records",
  );
  sql(
    database,
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents)VALUES(true,100,0)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.public_context_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;",
  );
  const files = readdirSync(root + "/supabase/tests")
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(root + "/supabase/tests/" + n, "utf8"));
  phase = "actual complete rollback SQL suite";
  const output = sql(database, buildSuite(files, true));
  writeFileSync("/private/tmp/firstten-an002-policy-result.txt", output);
  const tap = parseTap(output);
  console.log(
    JSON.stringify({
      assertions: tap.assertions,
      failures: tap.failures.length,
      knownGaps: tap.knownGaps.length,
      rolledBack: tap.cleanupOk,
    }),
  );
  assert(tap.validPlan && tap.cleanupOk);
  assert.equal(tap.failures.length, 0);
  assert.equal(tap.knownGaps.length, 0);
  const lines = output.split(/\r?\n/).filter((s) => s.startsWith("AN002_DTO:"));
  assert.equal(lines.length, 1);
  const dtoPath = "/private/tmp/firstten-an002-actual-dtos.json";
  writeFileSync(dtoPath, lines[0].slice("AN002_DTO:".length));
  phase = "actual SQL DTOs through production runtime schemas";
  const dtoResult = execFileSync(
    process.execPath,
    [root + "/node_modules/vitest/vitest.mjs", "run", "src/tests/an-002/sql-produced-dtos.test.ts"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: {
        ...process.env,
        FIRSTTEN_ACTUAL_AN002_DTOS: dtoPath,
        OPENROUTER_API_KEY: "fictional-no-provider-calls",
      },
    },
  );
  writeFileSync("/private/tmp/firstten-an002-dto-test.log", dtoResult);
  phase = "observed independent connection races";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  await measurementRaces({ database, password });
} catch (error) {
  if (error.stdout)
    writeFileSync("/private/tmp/firstten-an002-policy-partial.txt", String(error.stdout));
  writeFileSync(
    "/private/tmp/firstten-an002-policy-error.txt",
    String(error.stderr ?? error.stack ?? ""),
  );
  console.error(
    "Measurement clone verification failed at " +
      phase +
      "; diagnostics retained locally without printing payloads.",
  );
  process.exitCode = 1;
} finally {
  if (creationAttempted) {
    const exists = sql(
      "postgres",
      `SELECT count(*)FROM pg_database WHERE datname='${database}'`,
    ).trim();
    assert(["0", "1"].includes(exists));
    if (exists === "1") sql("postgres", `DROP DATABASE ${database} WITH(FORCE);`);
    assert.equal(
      sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
      "0",
    );
    console.log(
      "Exact newly created schema-only measurement clone dropped; absence verified. No original or hosted database writes.",
    );
  }
}
