import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
import { learningRaces } from "./races.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = "firstten_guest_learning_test_" + randomBytes(5).toString("hex");
assert.match(database, /^firstten_guest_learning_test_[a-f0-9]{10}$/);
const migration = readFileSync(
  root + "/supabase/migrations/20261018022000_guest_learning_activities.sql",
  "utf8",
);
const pin = createHash("sha256").update(migration).digest("hex");
assert.equal(
  process.env.FIRSTTEN_GUEST22_APPROVED_SHA,
  pin,
  "Explicit coordinator-approved exact migration pin required before any clone mutation",
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
let created = false,
  phase = "schema-only clone setup";
try {
  assert.equal(
    sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
    "0",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT to_regclass('firstten_private.class_submission_threads')IS NOT NULL AND to_regclass('firstten_private.guest_learning_activities')IS NULL",
    ).trim(),
    "t",
    "Dedicated source must include21 and exclude22",
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
  assert.equal(sql(database, "SELECT count(*)FROM auth.users").trim(), "0");
  phase = "reviewed migration22 apply only to new empty clone";
  sql(database, migration);
  sql(
    database,
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents)VALUES(true,100,0)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.public_context_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;",
  );
  const policyRoot = process.env.FIRSTTEN_POLICY_BASE_ROOT ?? root;
  const files = readdirSync(policyRoot + "/supabase/tests")
    .filter((n) => n.endsWith(".sql") && n !== "cls-008.sql")
    .sort()
    .map((n) => readFileSync(policyRoot + "/supabase/tests/" + n, "utf8"));
  if (!readdirSync(policyRoot + "/supabase/tests").includes("cls-002.sql"))
    files.push(
      readFileSync("/private/tmp/first-ten-project-lifecycle/supabase/tests/cls-002.sql", "utf8"),
    );
  files.push(readFileSync(root + "/supabase/tests/cls-008.sql", "utf8"));
  phase = "all actual rollback policy fixtures";
  const output = sql(database, buildSuite(files, true));
  writeFileSync("/private/tmp/firstten-guest-learning-policy-result.txt", output);
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
  phase = "actual guest activity separate-connection races";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  await learningRaces({ database, password });
} catch (error) {
  writeFileSync(
    "/private/tmp/firstten-guest-learning-policy-error.txt",
    String(error.stderr ?? error.stack ?? ""),
  );
  console.error(
    "Guest learning clone verification failed at " +
      phase +
      "; raw diagnostic retained locally, not printed.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    sql("postgres", `DROP DATABASE ${database} WITH(FORCE);`);
    assert.equal(
      sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
      "0",
    );
    console.log(
      "Exact newly created schema-only guest-learning clone dropped and absence verified. Original local and hosted databases unchanged.",
    );
  }
}
