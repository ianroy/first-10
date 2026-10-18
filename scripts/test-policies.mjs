#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "hdwnnuvqqkkpontcdbwa";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function parseDatabaseUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A valid disposable PostgreSQL URL is required.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("Policy tests require PostgreSQL, not an API URL.");
  }
  if (url.search || url.hash) throw new Error("Database URL query options/fragments are rejected.");
  const database = decodeURIComponent(url.pathname.slice(1));
  const username = decodeURIComponent(url.username);
  const port = Number(url.port || "5432");
  if (!/^[a-zA-Z0-9_-]+$/.test(database) || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error("Database/user names must be explicit simple identifiers.");
  }
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid database host or port.");
  }
  return {
    hostname: url.hostname,
    port,
    database,
    username,
    password: decodeURIComponent(url.password),
    local: LOCAL_HOSTS.has(url.hostname),
    target: `postgresql://${url.hostname}:${port}/${database}`,
  };
}

export function parseLocalConfig(text) {
  let projectId;
  let port;
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const header = line.trim().match(/^\[([^\]]+)\]/);
    if (header) section = header[1];
    if (!section) projectId ??= line.match(/^\s*project_id\s*=\s*"([a-zA-Z0-9_-]+)"/)?.[1];
    if (section === "db") {
      const found = line.match(/^\s*port\s*=\s*(\d+)\s*(?:#.*)?$/);
      if (found) port = Number(found[1]);
    }
  }
  return { projectId, port };
}

export function validateTarget(databaseUrl, { projectId, configuredPort, allowlist = [] } = {}) {
  // Explicit protection remains even if someone accidentally allowlists production.
  if (`${databaseUrl} ${projectId ?? ""}`.toLowerCase().includes(PRODUCTION_REF)) {
    throw new Error("Refusing the protected production project.");
  }
  const target = parseDatabaseUrl(databaseUrl);
  const namedLocalProject = /^firstten-policy-[a-z0-9-]+$/.test(projectId ?? "");
  const allowlisted = allowlist.includes(target.target);
  if (target.local && namedLocalProject && configuredPort === target.port) return target;
  if (!allowlisted) {
    throw new Error(
      "Target is not a named local policy-test stack or an explicitly allowlisted disposable database.",
    );
  }
  return target;
}

export function parseTap(output) {
  const lines = output.split(/\r?\n/);
  const assertions = lines.filter((line) => /^(?:not )?ok \d+(?:\s|$)/.test(line));
  const failures = assertions.filter((line) => /^not ok /.test(line) && !/# TODO\b/.test(line));
  const knownGaps = assertions.filter((line) => /^not ok /.test(line) && /# TODO\b/.test(line));
  const plans = lines.filter((line) => /^1\.\.\d+$/.test(line));
  const planned = plans.length === 1 ? Number(plans[0].slice(3)) : -1;
  return {
    assertions: assertions.length,
    failures,
    knownGaps,
    validPlan:
      planned > 0 &&
      planned === assertions.length &&
      assertions.every(
        (line, index) => Number(line.match(/^(?:not )?ok (\d+)/)?.[1]) === index + 1,
      ) &&
      !lines.some((line) => /^Bail out!/i.test(line)),
    cleanupOk: lines.includes("POLICY_FIXTURES_ROLLED_BACK"),
    printable: lines.filter((line) => /^(?:(?:not )?ok \d+|1\.\.\d+|#)/.test(line)),
  };
}

export function buildSuite(files, strict = false) {
  return [
    "BEGIN;",
    "SET LOCAL statement_timeout = '15s';",
    "SET LOCAL lock_timeout = '3s';",
    "SET LOCAL client_min_messages = warning;",
    "SELECT pg_advisory_xact_lock(171017, 2);",
    `SET LOCAL firstten.policy_strict = '${strict ? "on" : "off"}';`,
    "CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;",
    "SET LOCAL search_path = public, extensions;",
    "SELECT no_plan();",
    ...files,
    "RESET ROLE;",
    "SELECT * FROM finish();",
    "ROLLBACK;",
    "SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'firstten_policy_test')",
    "AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'f1000000-0000-4000-8000-%')",
    "THEN 'POLICY_FIXTURES_ROLLED_BACK' ELSE 'POLICY_FIXTURE_CLEANUP_FAILED' END;",
  ].join("\n");
}

function resolveDatabase(env, workdir) {
  let config = {};
  if (workdir) {
    config = parseLocalConfig(readFileSync(join(workdir, "supabase/config.toml"), "utf8"));
    if (!/^firstten-policy-[a-z0-9-]+$/.test(config.projectId ?? "")) {
      throw new Error("Workdir must be an explicitly named firstten-policy-* disposable stack.");
    }
  }
  let databaseUrl = env.POLICY_TEST_DATABASE_URL;
  if (!databaseUrl) {
    if (!workdir)
      throw new Error(
        "Pass --workdir or POLICY_TEST_DATABASE_URL; no repository/default DB is assumed.",
      );
    const result = spawnSync("supabase", ["status", "--workdir", workdir, "--output", "json"], {
      cwd: workdir,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 1_000_000,
    });
    if (result.status !== 0)
      throw new Error("Cannot inspect disposable Supabase status; credential output withheld.");
    let status;
    try {
      status = JSON.parse(result.stdout);
    } catch {
      throw new Error("Invalid Supabase status response; credential output withheld.");
    }
    if (String(status.linked_project_ref ?? "").includes(PRODUCTION_REF)) {
      throw new Error("Refusing a workdir linked to the protected production project.");
    }
    databaseUrl = status.DB_URL;
  }
  let allowlist;
  try {
    allowlist = JSON.parse(env.POLICY_TEST_DISPOSABLE_TARGETS ?? "[]");
  } catch {
    throw new Error(
      "POLICY_TEST_DISPOSABLE_TARGETS must be a JSON array of exact credential-free target URLs.",
    );
  }
  if (!Array.isArray(allowlist) || !allowlist.every((item) => typeof item === "string")) {
    throw new Error("Disposable target allowlist must contain only exact URL strings.");
  }
  return validateTarget(databaseUrl, {
    projectId: config.projectId,
    configuredPort: config.port,
    allowlist,
  });
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help")) {
    console.log(
      "Usage: node scripts/test-policies.mjs --workdir /path/to/firstten-policy-stack [--strict]",
    );
    console.log(
      "Or explicitly set POLICY_TEST_DATABASE_URL + POLICY_TEST_DISPOSABLE_TARGETS. Never uses repo .env/linked DB.",
    );
    return 0;
  }
  let workdir = env.POLICY_TEST_WORKDIR;
  let strict = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--strict") strict = true;
    else if (argv[i] === "--workdir" && argv[i + 1]) workdir = resolve(argv[++i]);
    else throw new Error("Unknown or incomplete policy-test argument; use --help.");
  }
  const target = resolveDatabase(env, workdir && resolve(workdir));
  const directory = join(ROOT, "supabase/tests");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(directory, name), "utf8"));
  if (!files.length) throw new Error("No policy SQL cases found.");
  const childEnv = { ...env };
  for (const name of Object.keys(childEnv)) if (name.startsWith("PG")) delete childEnv[name];
  Object.assign(childEnv, {
    PGHOST: target.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: String(target.port),
    PGDATABASE: target.database,
    PGUSER: target.username,
    PGPASSWORD: target.password,
    PGSSLMODE: target.local ? "disable" : "verify-full",
    PGCONNECT_TIMEOUT: "5",
  });
  if (!target.local && env.POLICY_TEST_SSL_ROOT_CERT)
    childEnv.PGSSLROOTCERT = env.POLICY_TEST_SSL_ROOT_CERT;
  console.log(
    `Disposable target accepted: ${target.target}; mode=${strict ? "strict" : "baseline-with-known-gaps"}`,
  );
  const result = spawnSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: buildSuite(files, strict),
    env: childEnv,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8_000_000,
  });
  const tap = parseTap(result.stdout ?? "");
  for (const line of tap.printable) console.log(line);
  if (result.status !== 0 || result.error) {
    console.error(
      "Policy SQL execution failed; connection closed, transaction rolled back. Raw database output withheld.",
    );
    return 1;
  }
  if (!tap.validPlan || !tap.cleanupOk) {
    console.error(
      "Policy output/rollback verification failed; this run is not a passing policy check.",
    );
    return 1;
  }
  console.log(
    `Policy assertions: ${tap.assertions}; unexpected failures: ${tap.failures.length}; known gaps reproduced: ${tap.knownGaps.length}; fixtures rolled back.`,
  );
  if (tap.knownGaps.length) {
    console.warn(
      "KNOWN SECURITY GAPS REMAIN: SEC-003 must close them. A baseline pass is not release/security clearance.",
    );
  }
  return tap.failures.length || (strict && tap.knownGaps.length) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Policy runner failed safely.");
    process.exitCode = 1;
  }
}
