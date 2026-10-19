/** Exact-pin rehearsal. No action runs without coordinator-supplied matching hashes. */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const paths = [
  "supabase/migrations/20261018026000_product_event_retention.sql",
  "supabase/tests/an-003.sql",
  "src/tests/an-003/database-rehearsal.mjs",
];
const approved = JSON.parse(process.env.FIRSTTEN_AN003_APPROVED_PINS ?? "null");
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
    "Unreviewed source: " + path,
  );
const source = "supabase_db_hdwnnuvqqkkpontcdbwa";
const image = "sha256:65a95a9ed7eb5022f5093e525693d7e0bb4fef3bc017889a6c1b2e13849ef015";
const nonce = randomBytes(8).toString("hex");
const name = "firstten-cron-test-" + nonce;
const docker = (args, input, timeout = 60000) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout,
    maxBuffer: 28000000,
  });
const [original] = JSON.parse(docker(["inspect", source]));
assert.equal(original.Name, "/" + source);
assert.equal(original.State.Running, true);
assert.equal(original.Image, image);
const bindings = original.NetworkSettings.Ports["5432/tcp"];
assert(
  bindings?.length && bindings.every((p) => p.HostPort === "55322"),
  "Dedicated55322 required",
);
assert(
  Object.entries(original.NetworkSettings.Ports).every(
    ([port, value]) =>
      !value?.length || (port === "5432/tcp" && value.every((p) => p.HostPort === "55322")),
  ),
);
const [imageInfo] = JSON.parse(docker(["image", "inspect", image]));
assert.equal(imageInfo.Id, image);
assert.equal(imageInfo.Config.Volumes, null, "No implicit source image volumes");
const readSource = (input) =>
  docker(
    [
      "exec",
      "-i",
      source,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    input,
  );
assert.equal(
  readSource(
    "SELECT to_regclass('firstten_private.product_event_log')IS NOT NULL AND to_regclass('firstten_private.product_retention_state')IS NULL",
  ).trim(),
  "t",
  "Actual source25/no26 sentinel required",
);
assert.equal(
  readSource(
    "SELECT count(*)FROM supabase_migrations.schema_migrations WHERE version>='20261018026000'",
  ).trim(),
  "0",
  "Do not rewrite or infer historical direct-apply rows",
);
// Metadata/schema only: no auth rows, app rows, role passwords, source configuration or credentials.
const roles = JSON.parse(
  readSource(
    "SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'bypass',rolbypassrls))FROM pg_roles WHERE rolname!~'^pg_'",
  ).trim(),
);
for (const role of roles) assert.match(role.name, /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
const schema = docker([
  "exec",
  source,
  "pg_dump",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "--schema-only",
  "--clean",
  "--if-exists",
]);
let createAttempted = false;
const inspectOwned = () => {
  const [c] = JSON.parse(docker(["inspect", name]));
  assert.equal(c.Name, "/" + name);
  assert.equal(c.Image, image);
  assert.equal(c.Config.Labels["firstten.rehearsal"], "an003");
  assert.equal(c.Config.Labels["firstten.nonce"], nonce);
  assert.equal(c.HostConfig.NetworkMode, "none");
  assert.equal(c.HostConfig.Privileged, false);
  assert.deepEqual(c.Mounts, []);
  assert(Object.values(c.NetworkSettings.Ports ?? {}).every((p) => !p?.length));
  assert(!Object.values(c.HostConfig.PortBindings ?? {}).some((p) => p?.length));
  return c;
};
const sql = (input) => {
  inspectOwned();
  return docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-h",
      "/tmp",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    input,
  );
};
const scalar = (input) => sql(input).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let phase = "owned empty isolated cluster";
try {
  assert.equal(
    docker(["ps", "-a", "--filter", "name=^/" + name + "$", "--format", "{{.Names}}"]).trim(),
    "",
  );
  createAttempted = true; // Before CREATE: lost acknowledgements still enter exact-owned cleanup.
  docker([
    "create",
    "--name",
    name,
    "--network",
    "none",
    "--user",
    "postgres",
    "--label",
    "firstten.rehearsal=an003",
    "--label",
    "firstten.nonce=" + nonce,
    "--entrypoint",
    "/bin/sh",
    image,
    "-c",
    "initdb -D /tmp/firstten-cron-pg --auth=trust --no-locale >/tmp/firstten-init.log 2>&1 && exec postgres -D /tmp/firstten-cron-pg -c listen_addresses='' -c unix_socket_directories=/tmp -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c cron.use_background_workers=on -c cron.log_run=on -c cron.log_statement=off -c cron.max_running_jobs=1 -c max_worker_processes=8 -c cron.timezone=GMT -c timezone=UTC",
  ]);
  inspectOwned();
  docker(["start", name]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "/tmp", "-U", "postgres"], undefined, 3000);
      ready = true;
      break;
    } catch {
      await pause(500);
    }
  }
  assert(ready, "Isolated PostgreSQL startup failed");
  for (const role of roles)
    if (role.name !== "postgres")
      sql(
        `CREATE ROLE "${role.name}" NOLOGIN ${role.super ? "SUPERUSER" : "NOSUPERUSER"} ${role.inherit ? "INHERIT" : "NOINHERIT"} ${role.bypass ? "BYPASSRLS" : "NOBYPASSRLS"};`,
      );
  sql(schema);
  assert.equal(
    scalar("SELECT(SELECT count(*)FROM auth.users)+(SELECT count(*)FROM public.projects)"),
    "0",
    "No original account/project data",
  );
  sql("INSERT INTO firstten_private.product_measurement_policy(singleton)VALUES(true);");
  phase = "candidate26 on isolated cluster only";
  sql(readFileSync(root + paths[0], "utf8"));
  const fixtureResult = sql(readFileSync(root + paths[1], "utf8"));
  writeFileSync("/private/tmp/firstten-an003-sql-result.txt", fixtureResult);
  const dto = fixtureResult.split(/\r?\n/).filter((s) => s.startsWith("AN003_DTO:"));
  assert.equal(dto.length, 1);
  const dtoPath = "/private/tmp/firstten-an003-actual-health.json";
  writeFileSync(dtoPath, dto[0].slice(10));
  const dtoResult = execFileSync(
    process.execPath,
    [
      root + "node_modules/vitest/vitest.mjs",
      "run",
      "src/tests/an-003/sql-produced-health.test.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: {
        ...process.env,
        FIRSTTEN_AN003_ACTUAL_HEALTH: dtoPath,
        OPENROUTER_API_KEY: "fictional-no-provider-calls",
      },
    },
  );
  writeFileSync("/private/tmp/firstten-an003-dto-test.log", dtoResult);
  phase = "actual isolated pg_cron installation and inactive preparation";
  sql("CREATE EXTENSION pg_cron;");
  const job = Number(scalar("SELECT firstten_private.prepare_product_retention_job('5 seconds')"));
  assert(Number.isSafeInteger(job) && job > 0);
  assert.equal(scalar(`SELECT active FROM cron.job WHERE jobid=${job}`), "f");
  assert.equal(scalar("SELECT firstten_private.product_retention_ready()"), "f");
  assert.equal(
    Number(scalar("SELECT firstten_private.prepare_product_retention_job('5 seconds')")),
    job,
    "Preparation idempotent",
  );
  // Fictional expiry rows need no student/account content. Both earliest and retained rows are tested.
  sql(
    "INSERT INTO firstten_private.product_event_log(event_name,environment,population,subject_ref,project_ref,measurement_choice_version,occurred_at,received_at,expires_at)SELECT'project_created','test','synthetic',gen_random_uuid(),gen_random_uuid(),1,statement_timestamp()-interval'31 days',statement_timestamp()-interval'31 days',statement_timestamp()-interval'1 day'FROM generate_series(1,4501);INSERT INTO firstten_private.product_event_log(event_name,environment,population,subject_ref,project_ref,measurement_choice_version,occurred_at,received_at,expires_at)VALUES('project_created','test','synthetic',gen_random_uuid(),gen_random_uuid(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval'1 day');",
  );
  // Keep an unrelated inactive job/history row: this task must never delete another job's history.
  const other = Number(
    scalar(
      "SELECT cron.schedule_in_database('an003-unrelated-fixture','0 0 * * *','SELECT 1',current_database(),current_user,false)",
    ),
  );
  sql(
    `INSERT INTO cron.job_run_details(jobid,runid,database,username,command,status,start_time,end_time)VALUES(${other},900000001,'postgres','postgres','SELECT 1','succeeded',clock_timestamp()-interval'9 days',clock_timestamp()-interval'9 days');INSERT INTO cron.job_run_details(jobid,runid,database,username,command,status,start_time,end_time)SELECT ${job},900001000+g,'postgres','postgres',firstten_private.retention_job_command(),'succeeded',statement_timestamp()-interval'9 days',statement_timestamp()-interval'9 days'FROM generate_series(1,501)g;`,
  );
  phase = "observed scheduled bounded batches and actual physical cleanup";
  sql(`SELECT cron.alter_job(${job},active:=true);`);
  const outcomes = [];
  let drained = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = JSON.parse(
      scalar(
        "SELECT jsonb_build_object('outcome',last_outcome,'removed',removed_rows,'drained',last_drained_at,'run',last_run_id,'ready',firstten_private.product_retention_ready(),'remaining',(SELECT count(*)FROM firstten_private.product_event_log WHERE expires_at<=clock_timestamp()))FROM firstten_private.product_retention_state",
      ),
    );
    if (!outcomes.some((x) => x.run === state.run)) outcomes.push(state);
    if (state.ready) {
      drained = true;
      break;
    }
    await pause(500);
  }
  writeFileSync("/private/tmp/firstten-an003-scheduled-outcomes.json", JSON.stringify(outcomes));
  assert(drained, "Actual scheduled runs did not reach verified drain");
  assert(
    outcomes.some(
      (s) => s.outcome === "backlog" && s.remaining > 0 && s.drained === null && !s.ready,
    ),
    "First bounded scheduled batch must report undrained backlog",
  );
  assert.equal(
    scalar("SELECT count(*)FROM firstten_private.product_event_log"),
    "1",
    "Unexpired event retained",
  );
  assert.equal(
    scalar(
      `SELECT count(*)FROM cron.job_run_details WHERE jobid=${job} AND end_time<clock_timestamp()-interval'7 days'`,
    ),
    "0",
  );
  assert.equal(
    scalar(`SELECT count(*)FROM cron.job_run_details WHERE jobid=${other} AND runid=900000001`),
    "1",
    "Other job history untouched",
  );
  assert(
    Number(
      scalar(
        `SELECT count(*)FROM cron.job_run_details WHERE jobid=${job} AND status='succeeded'AND runid<900000000`,
      ),
    ) >= 3,
    "Actual scheduler success records required",
  );
  assert.equal(scalar("SELECT enabled FROM firstten_private.product_measurement_policy"), "f");
  phase = "inactive, tampered, stale and failed proof rejection";
  sql(`SELECT cron.alter_job(${job},active:=false);`);
  assert.equal(scalar("SELECT firstten_private.product_retention_ready()"), "f");
  sql(`SELECT cron.alter_job(${job},active:=true,command:='SELECT 1');`);
  assert.equal(scalar("SELECT firstten_private.product_retention_ready()"), "f");
  sql(
    `SELECT cron.alter_job(${job},active:=false,command:=firstten_private.retention_job_command());`,
  );
  // Clone-only operational state aging/failure to exercise fail-closed health; never scheduler proof.
  sql(
    "UPDATE firstten_private.product_retention_state SET last_drained_at=clock_timestamp()-interval'11 minutes';",
  );
  assert.equal(scalar("SELECT firstten_private.product_retention_ready()"), "f");
  assert.equal(scalar("SELECT enabled FROM firstten_private.product_measurement_policy"), "f");
  console.log(
    JSON.stringify({
      phase: "passed",
      isolatedActualScheduledRuns: true,
      boundedBacklogObserved: true,
      retainedUnexpiredRows: 1,
      otherJobUntouched: true,
      collectionEnabled: false,
      noSourceWrites: true,
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ phase, failed: true }));
  // Detailed fixture/server diagnostics remain in local receipt; never environment/source credentials.
  if (error?.stderr) writeFileSync("/private/tmp/firstten-an003-failure.txt", String(error.stderr));
  throw error;
} finally {
  if (createAttempted) {
    const found = docker([
      "ps",
      "-a",
      "--filter",
      "name=^/" + name + "$",
      "--format",
      "{{.Names}}",
    ]).trim();
    if (found) {
      assert.equal(found, name);
      inspectOwned();
      docker(["rm", "--force", name]);
    }
    assert.equal(
      docker(["ps", "-a", "--filter", "name=^/" + name + "$", "--format", "{{.Names}}"]).trim(),
      "",
      "Owned disposable container absence required",
    );
    console.log(
      JSON.stringify({ cleanup: "owned isolated container absent", noVolumesCreated: true }),
    );
  }
}
