/** Strict policy/DTO/race compatibility on a random schema-only source25 clone. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
import { measurementRaces } from "../an-002/races.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const paths = [
  "supabase/migrations/20261018026000_product_event_retention.sql",
  "supabase/tests/an-002.sql",
  "supabase/tests/an-003.sql",
  "src/tests/an-002/races.mjs",
  "src/tests/an-003/compatibility-rehearsal.mjs",
];
const approved = JSON.parse(process.env.FIRSTTEN_AN003_COMPAT_APPROVED_PINS ?? "null");
assert(
  approved && Object.keys(approved).length === paths.length,
  "Exact coordinator pin approval required",
);
for (const path of paths)
  assert.equal(
    approved[path],
    createHash("sha256")
      .update(readFileSync(root + path))
      .digest("hex"),
    "Unreviewed executable: " + path,
  );
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = "firstten_measurement_test_" + randomBytes(5).toString("hex");
assert.match(database, /^firstten_measurement_test_[a-f0-9]{10}$/);
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
assert(
  Object.entries(info.NetworkSettings.Ports).every(
    ([port, bindings]) =>
      !bindings?.length || (port === "5432/tcp" && bindings.every((p) => p.HostPort === "55322")),
  ),
);
const sql = (db, input, user = "postgres") =>
  docker(
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1"],
    input,
  );
assert.equal(
  sql(
    "postgres",
    "SELECT to_regclass('firstten_private.product_event_log')IS NOT NULL AND to_regclass('firstten_private.product_retention_state')IS NULL AND to_regnamespace('cron')IS NULL",
  ).trim(),
  "t",
  "Source25/no26/noactualcron sentinel required",
);
assert.equal(
  sql(
    "postgres",
    "SELECT count(*)FROM supabase_migrations.schema_migrations WHERE version>='20261018026000'",
  ).trim(),
  "0",
  "History and actual sentinels are distinct; never rewrite history",
);
let creationAttempted = false,
  phase = "guarded empty schema-only clone";
try {
  assert.equal(
    sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
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
  creationAttempted = true;
  sql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  sql(database, schema, "supabase_admin");
  assert.equal(
    sql(
      database,
      "SELECT(SELECT count(*)FROM auth.users)+(SELECT count(*)FROM public.projects)",
    ).trim(),
    "0",
    "No original data copied",
  );
  sql(
    database,
    "INSERT INTO firstten_private.product_measurement_policy(singleton)VALUES(true);INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents)VALUES(true,100,0)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.public_context_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;",
  );
  phase = "candidate26 only on disposable clone";
  sql(database, readFileSync(root + paths[0], "utf8"));
  const files = readdirSync(root + "supabase/tests")
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(root + "supabase/tests/" + n, "utf8"));
  phase = "complete strict rollback policy suite";
  const output = sql(database, buildSuite(files, true));
  writeFileSync("/private/tmp/firstten-an003-compat-policy-result.txt", output);
  const tap = parseTap(output);
  console.log(
    JSON.stringify({
      assertions: tap.assertions,
      failures: tap.failures.length,
      knownGaps: tap.knownGaps.length,
      validPlan: tap.validPlan,
      rolledBack: tap.cleanupOk,
    }),
  );
  assert(tap.validPlan && tap.cleanupOk);
  assert.equal(tap.failures.length, 0);
  assert.equal(tap.knownGaps.length, 0);
  phase = "actual full-suite audited DTOs";
  const dtoPaths = {};
  for (const [prefix, path] of [
    ["AN002_DTO:", "/private/tmp/firstten-an003-compat-an002-dtos.json"],
    ["AN003_DTO:", "/private/tmp/firstten-an003-compat-health.json"],
  ]) {
    const lines = output.split(/\r?\n/).filter((s) => s.startsWith(prefix));
    assert.equal(lines.length, 1);
    writeFileSync(path, lines[0].slice(prefix.length));
    dtoPaths[prefix] = path;
  }
  const node = "/Users/ianroy/.local/bin/node";
  const result = execFileSync(
    node,
    [
      root + "node_modules/vitest/vitest.mjs",
      "run",
      "src/tests/an-002/sql-produced-dtos.test.ts",
      "src/tests/an-003/sql-produced-health.test.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: {
        ...process.env,
        FIRSTTEN_ACTUAL_AN002_DTOS: dtoPaths["AN002_DTO:"],
        FIRSTTEN_AN003_ACTUAL_HEALTH: dtoPaths["AN003_DTO:"],
        OPENROUTER_API_KEY: "fictional-no-provider-calls",
      },
    },
  );
  writeFileSync("/private/tmp/firstten-an003-compat-dto-tests.log", result);
  assert.equal(
    sql(
      database,
      "SELECT to_regnamespace('cron')IS NULL AND NOT firstten_private.product_retention_ready()",
    ).trim(),
    "t",
    "Fake metadata and readiness rolled back",
  );
  assert.equal(
    sql(database, "SELECT count(*)FROM auth.users").trim(),
    "0",
    "All full-suite fictional users rolled back",
  );
  phase = "existing three real overlapping connection races with synthetic policy readiness";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  await measurementRaces({ database, password });
  assert.equal(
    sql(
      database,
      "SELECT to_regnamespace('cron')IS NULL AND NOT firstten_private.product_retention_ready()AND NOT(SELECT enabled FROM firstten_private.product_measurement_policy)",
    ).trim(),
    "t",
    "Race synthetic metadata removed, collection off",
  );
  console.log(
    JSON.stringify({
      phase: "passed",
      strictPolicy: true,
      actualDtos: 3,
      realRaces: 3,
      noSchedulerInstalledOrActivated: true,
      noOriginalOrHostedWrites: true,
    }),
  );
} catch (error) {
  if (error.stdout)
    writeFileSync("/private/tmp/firstten-an003-compat-partial.txt", String(error.stdout));
  writeFileSync(
    "/private/tmp/firstten-an003-compat-error.txt",
    String(error.stderr ?? error.stack ?? ""),
  );
  console.error(JSON.stringify({ phase, failed: true, diagnostics: "local only" }));
  process.exitCode = 1;
} finally {
  if (creationAttempted) {
    const count = sql(
      "postgres",
      `SELECT count(*)FROM pg_database WHERE datname='${database}'`,
    ).trim();
    assert(["0", "1"].includes(count));
    if (count === "1") sql("postgres", `DROP DATABASE ${database} WITH(FORCE);`);
    assert.equal(
      sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
      "0",
    );
    console.log(
      JSON.stringify({
        cleanup: "exact random schema-only clone dropped and absent",
        sourceUnchanged: true,
      }),
    );
  }
}
