import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
import { handoffRaces } from "./races.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const database = "firstten_marketing_handoff_test_" + randomBytes(5).toString("hex");
assert.match(database, /^firstten_marketing_handoff_test_[a-f0-9]{10}$/);
const migration = readFileSync(
  root + "/supabase/migrations/20261018024000_guest_marketing_handoffs.sql",
  "utf8",
);
const pin = createHash("sha256").update(migration).digest("hex");
assert.equal(
  process.env.FIRSTTEN_GUEST24_APPROVED_SHA,
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
let creationAttempted = false,
  phase = "schema-only clone setup";
try {
  assert.equal(
    sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
    "0",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT to_regclass('firstten_private.guest_marketing_plans')IS NOT NULL AND to_regclass('firstten_private.marketing_submission_versions')IS NULL",
    ).trim(),
    "t",
    "Dedicated source must include23 and exclude24",
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
      "SELECT (SELECT count(*)FROM auth.users)+(SELECT count(*)FROM public.projects)",
    ).trim(),
    "0",
  );
  phase = "reviewed migration24 apply only to new empty clone";
  sql(database, migration);
  sql(
    database,
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents)VALUES(true,100,0)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.public_context_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;",
  );
  const policyRoot = process.env.FIRSTTEN_POLICY_BASE_ROOT ?? root;
  const files = readdirSync(policyRoot + "/supabase/tests")
    .filter((n) => n.endsWith(".sql") && n !== "guest-marketing-handoff.sql")
    .sort()
    .map((n) => readFileSync(policyRoot + "/supabase/tests/" + n, "utf8"));
  files.push(readFileSync(root + "/supabase/tests/guest-marketing-handoff.sql", "utf8"));
  phase = "all actual rollback policy fixtures";
  const output = sql(database, buildSuite(files, true));
  writeFileSync("/private/tmp/firstten-marketing-handoff-policy-result.txt", output);
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
  phase = "actual SQL-produced DTOs through production runtime schemas";
  const dtoLines = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("GUEST_MARKETING_HANDOFF_DTO:"));
  assert.equal(dtoLines.length, 1, "One fresh actual SQL DTO receipt must be captured");
  const dtoPath = "/private/tmp/firstten-marketing-handoff-actual-dtos.json";
  writeFileSync(dtoPath, dtoLines[0].slice("GUEST_MARKETING_HANDOFF_DTO:".length));
  const dtoResult = execFileSync(
    process.execPath,
    [
      root + "/node_modules/vitest/vitest.mjs",
      "run",
      "src/tests/guest-marketing-handoff/sql-produced-dtos.test.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: {
        ...process.env,
        FIRSTTEN_ACTUAL_MARKETING_HANDOFF_DTOS: dtoPath,
        OPENROUTER_API_KEY: "fictional-no-provider-calls",
      },
    },
  );
  writeFileSync("/private/tmp/firstten-marketing-handoff-actual-dtos-test.log", dtoResult);
  console.log("8 fresh actual SQL DTO/schema and privacy-boundary checks passed.");
  phase = "actual guest activity separate-connection races";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  await handoffRaces({ database, password });
} catch (error) {
  if (error.stdout)
    writeFileSync(
      "/private/tmp/firstten-marketing-handoff-policy-partial.txt",
      String(error.stdout),
    );
  writeFileSync(
    "/private/tmp/firstten-marketing-handoff-policy-error.txt",
    String(error.stderr ?? error.stack ?? ""),
  );
  console.error(
    "Guest marketing clone verification failed at " +
      phase +
      "; raw diagnostic retained locally, not printed.",
  );
  process.exitCode = 1;
} finally {
  if (creationAttempted) {
    const exists = sql(
      "postgres",
      `SELECT count(*)FROM pg_database WHERE datname='${database}'`,
    ).trim();
    assert(["0", "1"].includes(exists), "Exact clone existence could not be confirmed");
    if (exists === "1") sql("postgres", `DROP DATABASE ${database} WITH(FORCE);`);
    assert.equal(
      sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
      "0",
    );
    console.log(
      "Exact newly created schema-only guest-marketing clone dropped and absence verified. Original local and hosted databases unchanged.",
    );
  }
}
