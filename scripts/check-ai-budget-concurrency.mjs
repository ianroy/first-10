#!/usr/bin/env node
/** Local-only schema clone; never copy source rows or connect to hosted Supabase. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { buildSuite } from "./test-policies.mjs";
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = `firstten_ai_budget_test_${randomBytes(4).toString("hex")}`;
assert.match(database, /^firstten_ai_budget_test_[a-f0-9]{8}$/);
function docker(args, input, allowFailure = false) {
  const r = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 24 * 1024 * 1024 });
  if (!allowFailure && r.status !== 0)
    throw new Error(
      `Local fixture command failed (${r.status}): ${
        r.stderr
          .split("\n")
          .find((s) => /ERROR:/.test(s))
          ?.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]") ?? "unavailable"
      }`,
    );
  return r;
}
const ports = JSON.parse(
  docker(["inspect", container, "--format", "{{json .NetworkSettings.Ports}}"]).stdout,
);
assert.ok(
  ports["5432/tcp"]?.some((p) => p.HostPort === "55322"),
  "Exact dedicated local55322 guard failed",
);
const sqlArgs = (db) => [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (text, allowFailure = false) => docker(sqlArgs(database), text, allowFailure);
const run = promisify(execFile);
async function parallelSql(text) {
  try {
    const r = await run("docker", sqlArgs(database).concat(["-c", text]), {
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: r.stdout };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? "" };
  }
}
const actor = "fa14c000-0000-4000-8000-000000000001";
const project = "fa14c000-0000-4000-8000-000000000010";
const op = (n) => `fa14c000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reserve = (n) =>
  `SELECT public.reserve_ai_usage('${actor}','${project}','questions','${op(n)}',repeat('a',64),100);`;
const transaction = (statement) =>
  `BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL ROLE service_role; ${statement} SELECT pg_sleep(0.1); COMMIT;`;
let created = false;
try {
  // The source database contributes schema ONLY. No auth, teacher, student or other source rows are copied.
  const schema = docker([
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema-only",
  ]).stdout;
  docker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", database]);
  created = true;
  console.log(`Created disposable local schema-only database ${database}`);
  // Restore original owners/grants with the existing LOCAL superuser; fixture/API calls still use postgres/service_role.
  const restoreArgs = sqlArgs(database);
  restoreArgs[restoreArgs.indexOf("postgres")] = "supabase_admin";
  docker(restoreArgs, schema);
  // Schema dumps omit table data, including migration bootstrap singleton rows.
  sql(
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents) VALUES(true,100,0) ON CONFLICT DO NOTHING; INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false) ON CONFLICT DO NOTHING;",
  );
  const installed =
    sql(
      "SELECT to_regclass('firstten_private.ai_usage_global_policy') IS NOT NULL",
    ).stdout.trim() === "t";
  if (!installed) {
    sql(
      readFileSync(
        new URL("../supabase/migrations/20261018014000_ai_usage_budget.sql", import.meta.url),
        "utf8",
      ),
    );
  } else {
    // Once root has integrated14000, exercise that installed schema with migration-default data.
    sql("INSERT INTO firstten_private.ai_usage_global_policy(singleton) VALUES(true)");
  }
  const files = readdirSync(new URL("../supabase/tests/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const suite = buildSuite(
    files.map((f) => readFileSync(new URL(`../supabase/tests/${f}`, import.meta.url), "utf8")),
    true,
  );
  const tested = sql(suite, true);
  const failures = tested.stdout.split("\n").filter((line) => /^not ok/.test(line));
  assert.equal(
    tested.status,
    0,
    `Full policy fixture SQL failed; first diagnostic: ${tested.stderr.split("\n").filter((s) => /ERROR:/.test(s))[0] ?? "unavailable"}`,
  );
  assert.equal(failures.length, 0, `Policy assertions failed: ${failures.join("; ")}`);
  assert.match(tested.stdout, /POLICY_FIXTURES_ROLLED_BACK/);
  console.log(
    `Rollback policy suite: ${tested.stdout.split("\n").filter((line) => /^ok \d/.test(line)).length} assertions passed`,
  );
  sql(`INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES('${actor}','authenticated','authenticated','ai004-race@fixture.invalid','','{}','{}',now(),now());
INSERT INTO public.projects(id,user_id,name) VALUES('${project}','${actor}','AI004 fictional race');
UPDATE firstten_private.ai_usage_global_policy SET global_stop=false,general_enabled=true,opening_hold_micro=0,opening_reviewed_at=clock_timestamp(),max_inflight=20,starts_per_minute=100,operator_reference='ai004-local-race';
INSERT INTO firstten_private.ai_usage_route_policies VALUES('questions',1,true,'google/gemini-2.5-flash-lite','google-vertex',ARRAY['Google Vertex'],10000,1000,200000,100000,400000,repeat('b',64),repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour','ai004-local-race','product',NULL,NULL,NULL);
INSERT INTO firstten_private.ai_usage_user_limits VALUES('${actor}',24000000,24000000,20,100,'ai004-local-race');
INSERT INTO firstten_private.ai_usage_project_limits VALUES('${project}','${actor}',24000000,24000000,20,100,'ai004-local-race');`);
  async function reset() {
    sql(`DELETE FROM firstten_private.ai_usage_operations WHERE user_id='${actor}';
UPDATE firstten_private.ai_usage_global_policy SET general_cap_micro=24000000,max_inflight=20,starts_per_minute=100;
UPDATE firstten_private.ai_usage_user_limits SET lifetime_micro=24000000,daily_micro=24000000,max_inflight=20,starts_per_minute=100 WHERE user_id='${actor}';
UPDATE firstten_private.ai_usage_project_limits SET lifetime_micro=24000000,daily_micro=24000000,max_inflight=20,starts_per_minute=100 WHERE project_id='${project}';`);
  }
  for (const [name, policy] of [
    ["global cap", "UPDATE firstten_private.ai_usage_global_policy SET general_cap_micro=1400"],
    [
      "user daily cap",
      `UPDATE firstten_private.ai_usage_user_limits SET daily_micro=1400 WHERE user_id='${actor}'`,
    ],
    [
      "project daily cap",
      `UPDATE firstten_private.ai_usage_project_limits SET daily_micro=1400 WHERE project_id='${project}'`,
    ],
    ["concurrency", "UPDATE firstten_private.ai_usage_global_policy SET max_inflight=1"],
    ["start rate", "UPDATE firstten_private.ai_usage_global_policy SET starts_per_minute=1"],
    [
      "user concurrency",
      `UPDATE firstten_private.ai_usage_user_limits SET max_inflight=1 WHERE user_id='${actor}'`,
    ],
    [
      "project concurrency",
      `UPDATE firstten_private.ai_usage_project_limits SET max_inflight=1 WHERE project_id='${project}'`,
    ],
    [
      "user start rate",
      `UPDATE firstten_private.ai_usage_user_limits SET starts_per_minute=1 WHERE user_id='${actor}'`,
    ],
    [
      "project start rate",
      `UPDATE firstten_private.ai_usage_project_limits SET starts_per_minute=1 WHERE project_id='${project}'`,
    ],
  ]) {
    await reset();
    sql(policy);
    const results = await Promise.all([
      parallelSql(transaction(reserve(101))),
      parallelSql(transaction(reserve(102))),
    ]);
    assert.equal(
      results.filter((r) => r.ok).length,
      1,
      `${name}: exactly one concurrent reservation must win`,
    );
    assert.equal(
      sql(
        `SELECT count(*)||':'||sum(charge_micro) FROM firstten_private.ai_usage_operations WHERE user_id='${actor}'`,
      ).stdout.trim(),
      "1:1400",
      `${name}: cap must not race`,
    );
    console.log(`Parallel ${name}: one winner, one hold`);
  }
  await reset();
  const duplicate = await Promise.all([
    parallelSql(transaction(reserve(101))),
    parallelSql(transaction(reserve(101))),
  ]);
  assert.equal(duplicate.filter((r) => r.ok).length, 2);
  assert.equal(
    sql(
      `SELECT count(*)||':'||sum(charge_micro) FROM firstten_private.ai_usage_operations WHERE user_id='${actor}'`,
    ).stdout.trim(),
    "1:1400",
  );
  const claims = await Promise.all(
    [201, 202].map((n) =>
      parallelSql(transaction(`SELECT public.claim_ai_usage('${op(101)}','${op(n)}');`)),
    ),
  );
  assert.equal(claims.filter((r) => r.ok).length, 2);
  assert.equal(
    claims.filter((r) => /"dispatch": true/.test(r.stdout)).length,
    1,
    "Exactly one provider dispatch across concurrent claims",
  );
  console.log("Parallel same-intent reservation/claims: one charge and one dispatch");
} finally {
  if (created) {
    // Only the exact randomly-created fixture DB can be dropped. Never terminate source DB sessions.
    docker(["exec", container, "dropdb", "-U", "postgres", "--force", database]);
    const absent = docker(
      sqlArgs("postgres"),
      `SELECT count(*) FROM pg_database WHERE datname='${database}'`,
    ).stdout.trim();
    assert.equal(absent, "0", "Disposable fixture database cleanup failed");
    console.log(`Dropped ${database}; absence verified`);
  }
}
