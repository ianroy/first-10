// SOURCE CANDIDATE ONLY. Requires coordinator approval of all four exact files before any DB action.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildSuite, parseTap } from "../../../scripts/test-policies.mjs";
import { growthRaces } from "./races.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const files = {
  MIGRATION: "supabase/migrations/20261018027000_guest_growth.sql",
  HARNESS: "src/tests/guest-growth/database-rehearsal.mjs",
  RACES: "src/tests/guest-growth/races.mjs",
  SQL: "supabase/tests/cls-009.sql",
};
const publishedSourcePins = {
  "supabase/migrations/20261018022000_guest_learning_activities.sql":
    "1d1c252345b571c010264a21fcfc27a436e79ff30bf41831c65e894641f59b79",
  "supabase/migrations/20261018023000_guest_marketing_plans.sql":
    "dfa6deade799c5711183b701432e582fcd045dec2a9643528bd1e3f12693ecb4",
  "supabase/migrations/20261018024000_guest_marketing_handoffs.sql":
    "9bd05330ef36dc72109419b2b9dcc297242cace0468d7a816b16d8e0a48e3634",
  "supabase/migrations/20261018025000_product_event_capture.sql":
    "fc798efda3a426411c279a7cfef19c2a22dcc3b99b0b91010f354792428848cf",
  "supabase/migrations/20261018026000_product_event_retention.sql":
    "ee76f1851cfe00d21d350f64200ad5c26848c9436e5298dc5619079565e8a4c1",
};
for (const [path, hash] of Object.entries(publishedSourcePins))
  assert.equal(
    createHash("sha256")
      .update(readFileSync(root + path))
      .digest("hex"),
    hash,
    "Published22–26 source must be unchanged",
  );
const pins = Object.fromEntries(
  Object.entries(files).map(([k, p]) => [
    k,
    createHash("sha256")
      .update(readFileSync(root + p))
      .digest("hex"),
  ]),
);
for (const [k, hash] of Object.entries(pins))
  assert.equal(
    process.env[`FIRSTTEN_GROWTH27_APPROVED_${k}_SHA`],
    hash,
    `Exact reviewed ${k} pin required before any DB/container action`,
  );
const container = "supabase_db_hdwnnuvqqkkpontcdbwa",
  database = "firstten_growth_test_" + randomBytes(6).toString("hex");
assert.match(database, /^firstten_growth_test_[a-f0-9]{12}$/);
const artifact = "/private/tmp/firstten-growth27-";
const receipt = {
  pins,
  database,
  phase: "guards",
  creationAttempted: false,
  cleanupVerified: false,
  passed: false,
};
const docker = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    maxBuffer: 40000000,
  });
const [info] = JSON.parse(docker(["inspect", container]));
assert.equal(info.Name, "/" + container);
assert.equal(info.State.Running, true);
for (const bindings of [info.NetworkSettings.Ports, info.HostConfig.PortBindings]) {
  const published = Object.entries(bindings).filter(([, ports]) => ports?.length);
  assert.equal(published.length, 1, "Only the single dedicated database port may be published");
  for (const [port, ports] of published)
    assert(
      port === "5432/tcp" && ports.every((p) => p.HostPort === "55322"),
      "Every published DB binding must be dedicated55322",
    );
}
const sql = (db, input, user = "postgres") =>
  docker(
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1"],
    input,
  );
const retention26 = readFileSync(
  root + "supabase/migrations/20261018026000_product_event_retention.sql",
  "utf8",
);
const prepareBody = retention26
  .split("CREATE FUNCTION firstten_private.prepare_product_retention_job(")[1]
  .split("AS $$")[1]
  .split("$$;")[0];
const prepareHash = createHash("sha256").update(prepareBody).digest("hex");
const sourceGuard = () => {
  assert.equal(
    sql(
      "postgres",
      "SELECT max(version)='20261018003000' AND count(*)FILTER(WHERE version>'20261018003000')=0 FROM supabase_migrations.schema_migrations",
    ).trim(),
    "t",
    "Preserve intentional local03 CLI history",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT to_regclass('firstten_private.product_retention_state')IS NOT NULL AND to_regprocedure('public.get_product_measurement_retention_health_v2(uuid)')IS NOT NULL AND to_regclass('firstten_private.guest_growth_artifacts')IS NULL AND to_regprocedure('public.get_guest_growth_authority(text)')IS NULL AND to_regclass('cron.job')IS NULL AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')",
    ).trim(),
    "t",
    "Exact26/no27/no-cron source boundary required",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')FROM pg_proc WHERE oid=to_regprocedure('firstten_private.prepare_product_retention_job(text)')",
    ).trim(),
    prepareHash,
    "Published26 retention helper must be exact",
  );
  assert.equal(
    sql(
      "postgres",
      "SELECT(SELECT NOT enabled FROM firstten_private.product_measurement_policy WHERE singleton)AND(SELECT global_stop FROM firstten_private.ai_usage_global_policy WHERE singleton)AND(SELECT job_id IS NULL FROM firstten_private.product_retention_state WHERE singleton)",
    ).trim(),
    "t",
    "Collection and AI must remain off, with no configured local retention job",
  );
  return sql(
    "postgres",
    "SELECT jsonb_build_object('measurement',(SELECT to_jsonb(p)FROM firstten_private.product_measurement_policy p),'retention',(SELECT to_jsonb(r)FROM firstten_private.product_retention_state r),'ai',(SELECT to_jsonb(a)FROM firstten_private.ai_usage_global_policy a))::text",
  ).trim();
};
let originalState;
try {
  assert.equal(
    sql("postgres", `SELECT count(*)FROM pg_database WHERE datname='${database}'`).trim(),
    "0",
  );
  originalState = sourceGuard();
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
  receipt.phase = "create isolated schema-only clone";
  receipt.creationAttempted = true; // Set BEFORE CREATE: cleanup also runs after a lost acknowledgment.
  sql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  sql(database, schema, "supabase_admin");
  assert.equal(
    sql(
      database,
      "SELECT(SELECT count(*)FROM auth.users)+(SELECT count(*)FROM public.projects)",
    ).trim(),
    "0",
    "Clone must have zero accounts/projects",
  );
  assert.equal(
    sql(
      database,
      "SELECT to_regclass('cron.job')IS NULL AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')",
    ).trim(),
    "t",
    "No scheduler installation/job namespace may be copied or created",
  );
  receipt.phase = "apply exact27 to empty clone only";
  sql(database, readFileSync(root + files.MIGRATION, "utf8"));
  sql(
    database,
    "INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents)VALUES(true,100,0)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.ai_usage_global_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.public_context_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.product_measurement_policy(singleton)VALUES(true)ON CONFLICT DO NOTHING;INSERT INTO firstten_private.product_retention_state(singleton)VALUES(true)ON CONFLICT DO NOTHING;",
  );
  receipt.phase = "complete rollback SQL fixtures";
  const suite = readdirSync(root + "supabase/tests")
    .filter((n) => n.endsWith(".sql") && n !== "cls-009.sql")
    .sort()
    .map((n) => readFileSync(root + "supabase/tests/" + n, "utf8"));
  suite.push(readFileSync(root + files.SQL, "utf8"));
  const output = sql(database, buildSuite(suite, true));
  writeFileSync(artifact + "policy.txt", output);
  const tap = parseTap(output);
  receipt.assertions = tap.assertions;
  receipt.failures = tap.failures;
  assert(tap.validPlan && tap.cleanupOk);
  assert.equal(tap.failures.length, 0);
  assert.equal(tap.knownGaps.length, 0);
  const lines = output.split(/\r?\n/).filter((s) => s.startsWith("GUEST_GROWTH_DTO:"));
  assert.equal(lines.length, 1);
  const dto = artifact + "actual-dtos.json";
  writeFileSync(dto, lines[0].slice("GUEST_GROWTH_DTO:".length));
  receipt.phase = "actual SQL DTO/schema/hash parity";
  const result = execFileSync(
    process.execPath,
    [
      root + "node_modules/vitest/vitest.mjs",
      "run",
      "src/tests/guest-growth/sql-produced-dtos.test.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: {
        ...process.env,
        FIRSTTEN_ACTUAL_GUEST_GROWTH_DTOS: dto,
        OPENROUTER_API_KEY: "fictional-no-provider-calls",
      },
    },
  );
  writeFileSync(artifact + "dto-tests.txt", result);
  receipt.phase = "true overlapping separate-connection races";
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  receipt.races = await growthRaces({ database, password });
  receipt.passed = true;
} catch (error) {
  if (error.stdout) writeFileSync(artifact + "partial.txt", String(error.stdout));
  writeFileSync(
    artifact + "error.txt",
    String(error.stderr ?? error.stack ?? "Local rehearsal failed"),
  );
  process.exitCode = 1;
  console.error(
    "Guest growth rehearsal failed at " +
      receipt.phase +
      "; diagnostic saved locally, no raw data printed.",
  );
} finally {
  try {
    if (receipt.creationAttempted) {
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
      receipt.cleanupVerified = true;
      assert.equal(
        sourceGuard(),
        originalState,
        "Original26 source flags/helper/history must remain unchanged",
      );
      receipt.sourceUnchanged = true;
    }
  } catch (error) {
    receipt.passed = false;
    receipt.cleanupError = true;
    process.exitCode = 1;
    writeFileSync(
      artifact + "cleanup-error.txt",
      String(error.stack ?? "Cleanup/source verification failed"),
    );
  } finally {
    writeFileSync(artifact + "receipt.json", JSON.stringify(receipt, null, 2));
    console.log(
      JSON.stringify({
        passed: receipt.passed,
        cleanupVerified: receipt.cleanupVerified,
        sourceUnchanged: receipt.sourceUnchanged ?? false,
        assertions: receipt.assertions ?? 0,
      }),
    );
  }
}
