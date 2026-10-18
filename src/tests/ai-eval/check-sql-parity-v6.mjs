#!/usr/bin/env node
/** Explicit guarded schema-only clone rehearsal, never apply migrations or touch source data/policy. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadFixtures } from "../../../scripts/eval-ai.mjs";
import {
  fixtureStatements,
  EVALUATOR_USER_ID,
  EVALUATOR_PROJECT_ID,
} from "../../../evals/fixture-staging.v6.mjs";
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const db = `firstten_eval_v6_${randomBytes(4).toString("hex")}`;
function docker(args, input, allowFailure = false) {
  const r = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 && !allowFailure)
    throw new Error("Dedicated local SQL rehearsal failed; inspect private diagnostic output.");
  return r;
}
const identity = JSON.parse(docker(["inspect", container, "--format", "{{json .}}"]).stdout);
if (identity.Name !== "/" + container || identity.State?.Running !== true)
  throw new Error("Dedicated container guard failed");
const ports = JSON.parse(
  docker(["inspect", container, "--format", "{{json .NetworkSettings.Ports}}"]).stdout,
);
if (!ports["5432/tcp"]?.length || !ports["5432/tcp"].every((p) => p.HostPort === "55322"))
  throw new Error("Dedicated55322 guard failed");
const args = (database, user = "postgres") => [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-qAt",
  "-U",
  user,
  "-d",
  database,
  "-v",
  "ON_ERROR_STOP=1",
];
const fixtures = await loadFixtures();
let creationAttempted = false;
try {
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
  if (
    docker(
      args("postgres"),
      `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
    ).stdout.trim() !== "0"
  )
    throw new Error("Clone name already exists");
  // Record intent before dispatch: CREATE may commit even if its acknowledgement is lost.
  creationAttempted = true;
  docker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", db]);
  docker(args(db, "supabase_admin"), schema);
  if (
    docker(
      args(db),
      "SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.projects);",
    ).stdout.trim() !== "0"
  )
    throw new Error("Clone contains source data");
  const lines = [
    "BEGIN;",
    `INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES('${EVALUATOR_USER_ID}','authenticated','authenticated','bounded-v6@example.invalid','{\"synthetic\":true}','{}');`,
  ];
  for (const [i, c] of fixtures.cases.entries()) {
    lines.push("RESET ROLE;", ...fixtureStatements(c, i === 0).map((s) => s + ";"));
    const expected = "'" + JSON.stringify(c.permission_context).replaceAll("'", "''") + "'::jsonb";
    lines.push(
      `DO $$ DECLARE actual jsonb; BEGIN actual:=public.get_ai_processing_context_v2('${EVALUATOR_PROJECT_ID}','${c.kind}'); IF actual->>'ok'<>'true' OR actual->'data' IS DISTINCT FROM ${expected} THEN RAISE EXCEPTION 'v6 projection mismatch ${c.id}'; END IF; END $$;`,
    );
  }
  lines.push(
    "RESET ROLE;",
    "DO $$ BEGIN IF EXISTS(SELECT 1 FROM firstten_private.ai_usage_operations) OR EXISTS(SELECT 1 FROM firstten_private.ai_context_claims) THEN RAISE EXCEPTION 'Unexpected paid accounting'; END IF; IF (SELECT count(*) FROM firstten_private.processing_consent_history)<8 THEN RAISE EXCEPTION 'Consent history lost'; END IF; END $$;",
    "ROLLBACK;",
  );
  const result = docker(args(db), lines.join("\n"), true);
  if (result.status !== 0) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile("/private/tmp/firstten-eval-v6-sql-diagnostic.log", result.stderr, {
      mode: 0o600,
    });
    throw new Error("SQL parity failed; private diagnostics retained, no source database changes");
  }
  console.log(
    JSON.stringify({
      cases: 8,
      real_permission_rpc_parity: true,
      staging_role: "authenticated",
      provider_calls: 0,
      source_data_changed: false,
      transaction: "rolled_back",
    }),
  );
} finally {
  if (creationAttempted) {
    const exists = docker(
      args("postgres"),
      `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
    ).stdout.trim();
    if (!["0", "1"].includes(exists)) throw new Error("Exact clone existence unconfirmed");
    // Only this exact generated name was verified absent before our CREATE attempt.
    // A failed DROP acknowledgement must not bypass the final absence check below.
    if (exists === "1")
      docker(["exec", container, "dropdb", "-U", "postgres", db], undefined, true);
  }
  const found = docker(
    args("postgres"),
    `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
  ).stdout.trim();
  if (found !== "0") throw new Error("Disposable schema clone cleanup unconfirmed");
}
