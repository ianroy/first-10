import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { submissionRaces } from "./races.mjs";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = "firstten_submission_test_" + randomBytes(5).toString("hex");
assert.match(database, /^firstten_submission_test_[a-f0-9]{10}$/);
const docker = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    maxBuffer: 24000000,
  });
const [info] = JSON.parse(docker(["inspect", container]));
assert.equal(info.Name, "/" + container);
assert.equal(info.State.Running, true);
const ports = info.NetworkSettings.Ports["5432/tcp"];
assert(ports?.length && ports.every((p) => p.HostPort === "55322"));
const sql = (db, text, user = "postgres") =>
  docker(
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1"],
    text,
  );
let created = false,
  phase = "clone setup";
try {
  assert.equal(
    sql("postgres", `SELECT count(*) FROM pg_database WHERE datname='${database}'`).trim(),
    "0",
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
  sql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  created = true;
  sql(database, schema, "supabase_admin");
  assert.equal(sql(database, "SELECT count(*) FROM auth.users").trim(), "0");
  const migration = readFileSync(
    root + "/supabase/migrations/20261018021000_reviewed_class_submissions.sql",
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "0179d38ce85d45eea80a391f9646a4777cbb313a398ab2bd0d93087b3be57314",
  );
  phase = "reviewed migration apply to empty clone";
  // Before integration, apply the reviewed21 file to the empty schema clone.
  // After root integrates21, the schema dump already contains these objects.
  const installed =
    sql(
      database,
      "SELECT to_regclass('firstten_private.class_submission_threads') IS NOT NULL",
    ).trim() === "t";
  if (!installed) sql(database, migration);
  // Bootstrap only migration-default policy singleton fixtures; source data never copied.
  sql(
    database,
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents) VALUES(true,100,0) ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false) ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;",
  );
  phase = "rolled-back policy suite";
  const files = readdirSync(root + "/supabase/tests")
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(root + "/supabase/tests/" + n, "utf8"));
  const output = sql(database, buildSuite(files, true));
  writeFileSync("/private/tmp/firstten-submission-policy-result.txt", output);
  const tap = parseTap(output);
  for (const f of tap.failures) console.log(f);
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
  phase = "real cross-session races";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  await submissionRaces({ database, password });
} catch (error) {
  writeFileSync("/private/tmp/firstten-submission-policy-error.txt", String(error.stderr ?? ""));
  console.error(
    "Clone verification failed at " + phase + "; raw diagnostic retained locally, not printed.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    sql("postgres", `DROP DATABASE ${database} WITH(FORCE);`);
    assert.equal(
      sql("postgres", `SELECT count(*) FROM pg_database WHERE datname='${database}'`).trim(),
      "0",
    );
    console.log(
      "Exact newly created schema-only clone dropped and absence verified. Main local/hosted databases unchanged.",
    );
  }
}
