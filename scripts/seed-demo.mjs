#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HOSTED_PROJECT = "hdwnnuvqqkkpontcdbwa";
const FIXTURE_PREFIX = "f1d00000-0000-4000-8000-";
const TABLES = ["contacts", "interviews", "learnings", "experiments", "outreach"];

export function targetFor(input, projectRef) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("An explicit Supabase API URL is required.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Use an API origin without credentials, paths or query parameters.");
  const local =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.port === "55321";
  const hosted =
    url.protocol === "https:" &&
    url.hostname === `${HOSTED_PROJECT}.supabase.co` &&
    !url.port &&
    projectRef === HOSTED_PROJECT;
  if (!local && !hosted)
    throw new Error(
      "Target is not the isolated local demo API or the explicitly selected authorized project.",
    );
  return { url: url.origin, kind: local ? "isolated-local" : "authorized-hosted" };
}

export function validateFixture(fixture) {
  if (fixture.fictional !== true || fixture.fixtureVersion !== "first-ten-babson-2026-10-18-v1")
    throw new Error("Unknown or unlabeled fictional fixture.");
  if (fixture.account.email !== "workshop-presenter@firstten-demo.invalid")
    throw new Error("Only the non-deliverable fictional presenter account is allowed.");
  const ids = [
    fixture.account.id,
    fixture.project.id,
    ...TABLES.flatMap((table) => fixture[table].map((row) => row.id)),
  ];
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !new RegExp(`^${FIXTURE_PREFIX}[0-9]{12}$`).test(id))
  )
    throw new Error("Fixture ids must be unique and inside the reserved demo namespace.");
  if (
    fixture.project.checklist?.demo?.fictional !== true ||
    fixture.project.checklist.demo.excludeFromResearch !== true ||
    fixture.project.checklist.demo.excludeFromProductMetrics !== true
  )
    throw new Error("Fixture project must carry explicit research/metrics exclusions.");
  const contacts = new Set(fixture.contacts.map((row) => row.id));
  if (fixture.interviews.some((row) => !contacts.has(row.contact_id)))
    throw new Error("Interview references must stay within fixture contacts.");
  for (const table of TABLES) {
    for (const row of fixture[table]) {
      if ("user_id" in row || "project_id" in row || "created_at" in row)
        throw new Error("Owner, project and creation time must be derived by the seeder/database.");
    }
  }
  return fixture;
}

function fail(operation, error) {
  const code =
    typeof error?.code === "string" && /^[A-Za-z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : "REQUEST_FAILED";
  throw new Error(`${operation} failed (${code}); response content withheld.`);
}

/** Insert missing fixture rows only. Never update, upsert or delete any record. */
export async function seedFixture(client, fixture) {
  validateFixture(fixture);
  const owner = fixture.account.id;
  const projectId = fixture.project.id;
  const counts = { created: {}, retained: {} };
  const found = await client.auth.admin.getUserById(owner);
  let user = found.data?.user;
  if (found.error && found.error.status !== 404 && found.error.code !== "user_not_found")
    fail("Inspect demo identity", found.error);
  if (!user) {
    const created = await client.auth.admin.createUser({
      id: owner,
      email: fixture.account.email,
      email_confirm: true,
      app_metadata: { firstten_demo_fixture: fixture.fixtureVersion, synthetic: true },
      user_metadata: { display_name: "Fictional workshop presenter", fictional: true },
    });
    if (created.error || !created.data?.user) fail("Create fictional demo identity", created.error);
    user = created.data.user;
    counts.created.auth_users = 1;
  } else counts.retained.auth_users = 1;
  if (
    user.id !== owner ||
    user.email !== fixture.account.email ||
    user.app_metadata?.firstten_demo_fixture !== fixture.fixtureVersion ||
    user.app_metadata?.synthetic !== true
  )
    throw new Error(
      "Reserved demo identity is not the expected synthetic account; no app data was written.",
    );

  const existingProject = await client
    .from("projects")
    .select("id,user_id,demo:checklist->demo")
    .eq("id", projectId)
    .maybeSingle();
  if (existingProject.error) fail("Inspect fixture project", existingProject.error);
  if (existingProject.data) {
    if (
      existingProject.data.user_id !== owner ||
      existingProject.data.demo?.fixtureVersion !== fixture.fixtureVersion ||
      existingProject.data.demo?.fictional !== true
    )
      throw new Error(
        "Reserved project is not the expected demo fixture; no project/child records were written.",
      );
    counts.retained.projects = 1;
  } else {
    const inserted = await client.from("projects").insert({ ...fixture.project, user_id: owner });
    if (inserted.error) fail("Create fixture project", inserted.error);
    counts.created.projects = 1;
  }
  for (const table of TABLES) {
    counts.created[table] = 0;
    counts.retained[table] = 0;
    for (const row of fixture[table]) {
      const existing = await client
        .from(table)
        .select("id,user_id,project_id")
        .eq("id", row.id)
        .maybeSingle();
      if (existing.error) fail(`Inspect fixture ${table}`, existing.error);
      if (existing.data) {
        if (existing.data.user_id !== owner || existing.data.project_id !== projectId)
          throw new Error(
            `Reserved ${table} id has a different owner/project; refusing any overwrite.`,
          );
        counts.retained[table]++;
      } else {
        const inserted = await client
          .from(table)
          .insert({ ...row, user_id: owner, project_id: projectId });
        if (inserted.error) fail(`Create fixture ${table}`, inserted.error);
        counts.created[table]++;
      }
    }
  }
  return {
    fixtureVersion: fixture.fixtureVersion,
    fictional: true,
    ...counts,
    emailsSent: 0,
    aiCalls: 0,
    updates: 0,
    deletions: 0,
  };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = { apply: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") options.apply = true;
    else if (args[i] === "--url" && args[i + 1]) options.url = args[++i];
    else if (args[i] === "--project-ref" && args[i + 1]) options.projectRef = args[++i];
    else
      throw new Error(
        "Usage: node --env-file=.env scripts/seed-demo.mjs --url SUPABASE_ORIGIN [--project-ref AUTHORIZED_REF] [--apply]. Default is dry-run.",
      );
  }
  const target = targetFor(options.url || env.SUPABASE_URL, options.projectRef);
  const fixture = validateFixture(
    JSON.parse(
      await readFile(new URL("../docs/demo/supabase-fixture.json", import.meta.url), "utf8"),
    ),
  );
  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          target: target.kind,
          host: new URL(target.url).host,
          fixtureVersion: fixture.fixtureVersion,
          fictional: true,
          insertsIfMissing: {
            auth_users: 1,
            projects: 1,
            ...Object.fromEntries(TABLES.map((table) => [table, fixture[table].length])),
          },
          updates: 0,
          deletions: 0,
          emails: 0,
          aiCalls: 0,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key === "[SENSITIVE]")
    throw new Error(
      "An authorized service-role key is required in the process environment; never pass it in arguments.",
    );
  const client = createClient(target.url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
            : AbortSignal.timeout(10_000),
        }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  console.log(
    JSON.stringify({ target: target.kind, ...(await seedFixture(client, fixture)) }, null, 2),
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
