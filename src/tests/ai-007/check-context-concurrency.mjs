#!/usr/bin/env node
/** Local-only schema clone; never copy source rows or connect to hosted Supabase. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { buildSuite } from "../../../scripts/test-policies.mjs";
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = `firstten_ai_context_test_${randomBytes(4).toString("hex")}`;
assert.match(database, /^firstten_ai_context_test_[a-f0-9]{8}$/);
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
        new URL("../../../supabase/migrations/20261018014000_ai_usage_budget.sql", import.meta.url),
        "utf8",
      ),
    );
  } else {
    // Once root has integrated14000, exercise that installed schema with migration-default data.
    sql("INSERT INTO firstten_private.ai_usage_global_policy(singleton) VALUES(true)");
  }
  sql(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261018017000_ai_context_sources.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const files = readdirSync(new URL("../../../supabase/tests/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const suite = buildSuite(
    files.map((f) =>
      readFileSync(new URL(`../../../supabase/tests/${f}`, import.meta.url), "utf8"),
    ),
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
  const actor = "fa17c000-0000-4000-8000-000000000001";
  const project = "fa17c000-0000-4000-8000-000000000010";
  const contact = "fa17c000-0000-4000-8000-000000000020";
  const interview = "fa17c000-0000-4000-8000-000000000030";
  const op = (n) => `fa17c000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  sql(`INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES('${actor}','authenticated','authenticated','ai007-race@fixture.invalid','','{}','{}',now(),now());
INSERT INTO public.projects(id,user_id,name) VALUES('${project}','${actor}','AI007 fictional race');
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES('${contact}','${actor}','${project}','Fictional');
INSERT INTO public.interviews(id,user_id,project_id,contact_id,answers,tags,completed) VALUES('${interview}','${actor}','${project}','${contact}','[{"q":"q","note":"before edit","quote":"fictional exact quote"}]','{}',true);
INSERT INTO public.processing_consents(user_id,project_id,target_kind,target_id,note_status,ai_status,sharing_status,policy_version,revision) SELECT '${actor}','${project}',kind,id,'granted','granted','declined',1,1 FROM (VALUES('project','${project}'::uuid),('contact','${contact}'::uuid),('interview','${interview}'::uuid)) r(kind,id);
UPDATE firstten_private.ai_usage_global_policy SET global_stop=false,general_enabled=true,opening_hold_micro=0,opening_reviewed_at=clock_timestamp(),max_inflight=20,starts_per_minute=100,operator_reference='ai007-local-race';
INSERT INTO firstten_private.ai_usage_route_policies VALUES('synthesis',1,true,'google/gemini-2.5-flash-lite','google-vertex',ARRAY['Google Vertex'],10000,1000,200000,100000,400000,repeat('b',64),repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour','ai007-local-race','product',NULL,NULL,NULL);
INSERT INTO firstten_private.ai_usage_user_limits VALUES('${actor}',24000000,24000000,20,100,'ai007-local-race');
INSERT INTO firstten_private.ai_usage_project_limits VALUES('${project}','${actor}',24000000,24000000,20,100,'ai007-local-race');`);
  const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const manifest = () =>
    JSON.parse(
      sql(
        `SELECT jsonb_build_object('version',2,'contextHash',repeat('a',64),'sources',jsonb_build_array(firstten_private.ai_source_identity(firstten_private.ai_source_record('${actor}','${project}','project','${project}')),firstten_private.ai_source_identity(firstten_private.ai_source_record('${actor}','${project}','interview','${interview}'))),'omissions','{"permission":0,"oversized":0,"invalid":0,"candidateLimit":0,"budget":0}'::jsonb)`,
      ).stdout.trim(),
    );
  const reserve = (n) =>
    sql(
      `SET ROLE service_role; SELECT public.reserve_ai_usage('${actor}','${project}','synthesis','${op(n)}',repeat('a',64),100)`,
    );
  const claim = (n, m) =>
    `SET LOCAL ROLE service_role; SELECT public.claim_ai_usage_with_context('${op(n)}','${op(n + 1000)}',${literal(m)});`;
  const reset = () =>
    sql(
      `UPDATE public.processing_consents SET ai_status='granted',note_status='granted',revision=1 WHERE project_id='${project}'; UPDATE public.interviews SET answers='[{"q":"q","note":"before edit","quote":"fictional exact quote"}]' WHERE id='${interview}'`,
    );
  async function marker() {
    for (let i = 0; i < 100; i++) {
      if (
        sql(
          "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=171017 AND objid=7 AND granted)",
        ).stdout.trim() === "t"
      )
        return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Concurrent fixture did not acquire its synchronization marker");
  }
  for (const [index, name, edit] of [
    [
      101,
      "direct legacy source edit",
      `UPDATE public.interviews SET answers='[{"q":"q","note":"after edit","quote":"fictional exact quote"}]' WHERE id='${interview}'`,
    ],
    [
      102,
      "owner-reported interview withdrawal",
      `SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated; SELECT public.set_processing_consent('${project}','interview','${interview}','granted','withdrawn','declined',1,1); RESET ROLE`,
    ],
    [
      103,
      "linked-contact permission revision",
      `SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated; SELECT public.set_processing_consent('${project}','contact','${contact}','granted','granted','declined',1,1); RESET ROLE`,
    ],
  ]) {
    reset();
    const m = manifest();
    reserve(index);
    const editor = parallelSql(
      `BEGIN; SET LOCAL statement_timeout='8s'; ${edit}; SELECT pg_advisory_xact_lock(171017,7); SELECT pg_sleep(0.6); COMMIT`,
    );
    await marker();
    const dispatch = await parallelSql(
      `BEGIN; SET LOCAL statement_timeout='8s'; ${claim(index, m)} COMMIT`,
    );
    assert.equal((await editor).ok, true, `${name}: editor committed`);
    assert.equal(dispatch.ok, false, `${name}: post-lock fresh snapshot must reject stale context`);
    assert.equal(
      sql(
        `SELECT state FROM firstten_private.ai_usage_operations WHERE operation_id='${op(index)}'`,
      ).stdout.trim(),
      "reserved",
    );
    assert.equal(
      sql(
        `SELECT count(*) FROM firstten_private.ai_context_claims WHERE operation_id='${op(index)}'`,
      ).stdout.trim(),
      "0",
    );
    console.log(`Overlapping ${name}: stale claim rejected, zero dispatch receipts`);
  }
  reset();
  const m = manifest();
  reserve(104);
  const winner = parallelSql(
    `BEGIN; SET LOCAL statement_timeout='8s'; ${claim(104, m)} RESET ROLE; SELECT pg_advisory_xact_lock(171017,7); SELECT pg_sleep(0.6); COMMIT`,
  );
  await marker();
  const editAfter = parallelSql(
    `BEGIN; SET LOCAL statement_timeout='8s'; UPDATE public.interviews SET answers='[{"q":"q","note":"changed after dispatch authorization","quote":"fictional exact quote"}]' WHERE id='${interview}'; COMMIT`,
  );
  const [win, changed] = await Promise.all([winner, editAfter]);
  assert.equal(win.ok, true);
  assert.match(win.stdout, /"dispatch": true/);
  assert.equal(changed.ok, true);
  console.log(
    "Claim-first source edit: edit serialized after dispatch authorization; no promise to recall in-flight data",
  );
  reset();
  const duplicateManifest = manifest();
  reserve(105);
  const duplicates = await Promise.all([
    parallelSql(`BEGIN;${claim(105, duplicateManifest)} COMMIT`),
    parallelSql(`BEGIN;${claim(105, duplicateManifest)} COMMIT`),
  ]);
  assert.equal(duplicates.filter((r) => r.ok).length, 2);
  assert.equal(duplicates.filter((r) => /"dispatch": true/.test(r.stdout)).length, 1);
  assert.equal(
    sql(
      `SELECT count(*) FROM firstten_private.ai_context_claims WHERE operation_id='${op(105)}'`,
    ).stdout.trim(),
    "1",
  );
  console.log("Concurrent duplicate fenced claims: one dispatch receipt, one non-dispatch replay");
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
