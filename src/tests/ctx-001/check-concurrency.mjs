#!/usr/bin/env node
/** Local-only schema clone; never copy source rows or connect to hosted Supabase. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { buildSuite } from "../../../scripts/test-policies.mjs";
import { listResultSchema } from "../../lib/context/contracts.ts";
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = `firstten_public_context_test_${randomBytes(4).toString("hex")}`;
assert.match(database, /^firstten_public_context_test_[a-f0-9]{8}$/);
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
  assert.equal(
    docker(
      sqlArgs("postgres"),
      `SELECT count(*) FROM pg_database WHERE datname='${database}'`,
    ).stdout.trim(),
    "0",
    "New random fixture name must be absent",
  );
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
        "../../../supabase/migrations/20261018019000_reviewed_public_context.sql",
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
  const actor = "fa19c000-0000-4000-8000-000000000001";
  const project = "fa19c000-0000-4000-8000-000000000010";
  const op = (n) => `fa19c000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  sql(
    `INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES('${actor}','authenticated','authenticated','ctx001-race@fixture.invalid','','{}','{}',now(),now()); INSERT INTO public.projects(id,user_id,name) VALUES('${project}','${actor}','CTX001 fictional race'); UPDATE firstten_private.public_context_policy SET enabled=true,runtime_review_sha256=repeat('a',64),operator_reference='ctx001-disposable-local-only';`,
  );
  const begin = (n) =>
    `SELECT public.begin_public_context_retrieval('${actor}','${project}','${op(n)}','website',repeat('a',64));`;
  const tx = (statement) =>
    `BEGIN;SET LOCAL statement_timeout='8s';SET LOCAL ROLE service_role;${statement} COMMIT`;
  const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const { createHash } = await import("node:crypto");
  const text = "Fictional public source. Not customer evidence.";
  const sources = [
    {
      url: "https://product.example.org/",
      title: "Fictional",
      format: "plain_text",
      contentHash: "a".repeat(64),
      previewHash: createHash("sha256").update(text).digest("hex"),
      text,
      bytes: Buffer.byteLength(text),
      commitSha: null,
      path: null,
      blobSha: null,
    },
  ];
  const duplicate = await Promise.all([parallelSql(tx(begin(101))), parallelSql(tx(begin(101)))]);
  assert.equal(duplicate.filter((r) => r.ok).length, 2);
  assert.equal(duplicate.filter((r) => /"ok": true/.test(r.stdout)).length, 1);
  assert.equal(
    sql(
      `SELECT count(*) FROM firstten_private.public_context_operations WHERE user_id='${actor}'`,
    ).stdout.trim(),
    "1",
  );
  console.log("Concurrent same-intent leases: one outbound authorization, one replay refusal");
  const nonce = (n) =>
    sql(
      `SELECT attempt_id FROM firstten_private.public_context_operations WHERE id='${op(n)}'`,
    ).stdout.trim();
  const complete = (n, attempt) =>
    `SELECT public.complete_public_context_retrieval('${op(n)}','${attempt}',${literal(sources)});`;
  sql(
    `UPDATE firstten_private.public_context_operations SET lease_until=clock_timestamp()-interval '1 second' WHERE id='${op(101)}'`,
  );
  assert.match(sql(`SET ROLE service_role;${begin(102)}`).stdout, /"ok": true/);
  assert.match(sql(`SET ROLE service_role;${complete(101, nonce(101))}`).stdout, /"EXPIRED"/);
  assert.equal(
    sql(
      `SELECT count(*) FROM firstten_private.public_context_previews WHERE operation_id='${op(101)}'`,
    ).stdout.trim(),
    "0",
  );
  console.log("Expired attempt after replacement: no preview persisted");
  assert.match(sql(`SET ROLE service_role;${complete(102, nonce(102))}`).stdout, /"ok": true/);
  const ownerList = () => {
    const output = sql(
      `BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${actor}',true);SELECT public.list_public_context('${project}');COMMIT`,
    ).stdout;
    const projected = JSON.parse(output.split("\n").find((line) => line.startsWith("{")));
    const parsed = listResultSchema.safeParse(projected);
    assert.equal(
      parsed.success,
      true,
      "Actual SQL owner-list DTO must match production runtime schema",
    );
    return parsed.data;
  };
  const previewList = ownerList();
  assert.equal(previewList.ok, true);
  assert.equal(previewList.previews.length, 1);
  assert.equal(previewList.previews[0].projectId, project);
  assert.equal(previewList.previews[0].previewPermission, true);
  const preview = sql(
    `SELECT id FROM firstten_private.public_context_previews WHERE operation_id='${op(102)}'`,
  ).stdout.trim();
  const review = `SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated; SELECT public.review_public_context('${project}','${preview}','${sources[0].previewHash}','Fictional source','${text}',true);`;
  const reviews = await Promise.all([
    parallelSql(`BEGIN;${review}COMMIT`),
    parallelSql(`BEGIN;${review}COMMIT`),
  ]);
  assert.equal(reviews.filter((r) => r.ok && /"ok": true/.test(r.stdout)).length, 2);
  assert.equal(
    sql(
      `SELECT count(*) FROM firstten_private.reviewed_public_sources WHERE preview_id='${preview}'`,
    ).stdout.trim(),
    "1",
  );
  console.log("Concurrent identical review: one immutable reviewed version");
  const reviewedList = ownerList();
  assert.equal(reviewedList.ok, true);
  assert.equal(reviewedList.reviewed[0].status, "active");
  const source = sql(
    `SELECT id FROM firstten_private.reviewed_public_sources WHERE preview_id='${preview}'`,
  ).stdout.trim();
  sql(`UPDATE public.projects SET archived_at=clock_timestamp() WHERE id='${project}'`);
  const withdrawals = await Promise.all([
    parallelSql(
      `BEGIN;SELECT set_config('request.jwt.claim.sub','${actor}',true);SET LOCAL ROLE authenticated;SELECT public.withdraw_public_context('${project}','${source}',1);COMMIT`,
    ),
    parallelSql(
      `BEGIN;SELECT set_config('request.jwt.claim.sub','${actor}',true);SET LOCAL ROLE authenticated;SELECT public.withdraw_public_context('${project}','${source}',1);COMMIT`,
    ),
  ]);
  assert.equal(withdrawals.filter((r) => r.ok && /"ok": true/.test(r.stdout)).length, 1);
  assert.equal(
    sql(
      `SELECT status||':'||revision FROM firstten_private.reviewed_public_sources WHERE id='${source}'`,
    ).stdout.trim(),
    "withdrawn:2",
  );
  console.log("Archived owner competing withdrawals: one revision advance; contents redacted");
  const withdrawnList = ownerList();
  assert.equal(withdrawnList.ok, true);
  assert.equal(withdrawnList.reviewed[0].status, "withdrawn");
  assert.equal(Object.hasOwn(withdrawnList.reviewed[0], "excerpt"), false);
  console.log(
    "Actual SQL DTO parity: unreviewed preview, active review and withdrawn owner recovery match runtime schemas",
  );
  sql(`UPDATE public.projects SET archived_at=NULL WHERE id='${project}'`);
  assert.match(sql(`SET ROLE service_role;${begin(103)}`).stdout, /"ok": true/);
  const attempt = nonce(103);
  async function marker() {
    for (let i = 0; i < 100; i++) {
      if (
        sql(
          "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=171019 AND objid=7 AND granted)",
        ).stdout.trim() === "t"
      )
        return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Missing deletion race marker");
  }
  const deletion = parallelSql(
    `BEGIN;DELETE FROM auth.users WHERE id='${actor}';SELECT pg_advisory_xact_lock(171019,7);SELECT pg_sleep(0.6);COMMIT`,
  );
  await marker();
  const late = await parallelSql(tx(complete(103, attempt)));
  assert.equal((await deletion).ok, true);
  assert.equal(late.ok, true);
  assert.match(late.stdout, /"NOT_FOUND"/);
  assert.equal(
    sql(
      `SELECT count(*) FROM firstten_private.public_context_previews WHERE operation_id='${op(103)}'`,
    ).stdout.trim(),
    "0",
  );
  console.log("Overlapping owner deletion before completion: fresh weak-lock check denies preview");
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
