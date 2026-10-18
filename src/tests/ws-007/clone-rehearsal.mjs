#!/usr/bin/env node
/** Explicit coordinator approval only. No migrations, provider calls, source data writes or audit bypass. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  CONTAINER,
  validateCloneName,
  validateContainer,
  validateExpectedHistory,
  validateSourceState,
  validateEmptyClone,
} from "./clone-guards.mjs";

export const fixtures = [
  {
    owner: "c2070000-0000-4000-8000-000000000001",
    project: "c2070000-0000-4000-8000-000000000011",
    draft: "c2070000-0000-4000-8000-000000000021",
    contact: "c2070000-0000-4000-8000-000000000031",
    marker: "A1",
  },
  {
    owner: "c2070000-0000-4000-8000-000000000001",
    project: "c2070000-0000-4000-8000-000000000012",
    draft: "c2070000-0000-4000-8000-000000000022",
    contact: "c2070000-0000-4000-8000-000000000032",
    marker: "A2",
  },
  {
    owner: "c2070000-0000-4000-8000-000000000002",
    project: "c2070000-0000-4000-8000-000000000013",
    draft: "c2070000-0000-4000-8000-000000000023",
    contact: "c2070000-0000-4000-8000-000000000033",
    marker: "B1",
  },
  {
    owner: "c2070000-0000-4000-8000-000000000002",
    project: "c2070000-0000-4000-8000-000000000014",
    draft: "c2070000-0000-4000-8000-000000000024",
    contact: "c2070000-0000-4000-8000-000000000034",
    marker: "B2",
  },
];
const questions = ["What happened the last time you faced this problem?"];
const document = (marker) => ({
  schemaVersion: 1,
  policyVersion: 1,
  answers: [{ q: questions[0], note: `FICTIONAL_BASE_${marker}`, quote: "" }],
  tags: [],
  choices: { noteStatus: "granted", aiStatus: "unknown", sharingStatus: "unknown" },
  currentQuestion: 1,
});
const diagnostic = "/private/tmp/firstten-ws007-clone-diagnostic.log";
function docker(args, input, allowFailure = false) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0 && !allowFailure) throw new Error("Dedicated clone command failed");
  return result;
}
const psql = (database, user = "postgres") => [
  "exec",
  "-i",
  CONTAINER,
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
async function beginActor(session, owner) {
  await session`BEGIN`;
  await session`SET LOCAL statement_timeout='12s'`;
  await session`SELECT set_config('request.jwt.claim.sub',${owner},true)`;
  await session`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: owner, role: "authenticated" })},true)`;
  await session`SET LOCAL ROLE authenticated`;
}
async function asActor(session, owner, operation) {
  await beginActor(session, owner);
  try {
    const result = await operation(session);
    await session`COMMIT`;
    return result;
  } catch (error) {
    await session`ROLLBACK`;
    throw error;
  }
}
async function assertBlocked(admin, blocking, waiting) {
  for (let i = 0; i < 60; i++) {
    const [{ blocked }] =
      await admin`SELECT ${blocking}::integer=ANY(pg_blocking_pids(${waiting}::integer)) AS blocked`;
    if (blocked) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.fail("The real database sessions did not overlap on the expected parent lock");
}
async function seed(admin, session) {
  for (const owner of [fixtures[0].owner, fixtures[2].owner])
    await admin`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES(${owner},'authenticated','authenticated',${`ws007-${owner}@example.invalid`},'{}','{}')`;
  for (let index = 0; index < fixtures.length; index++) {
    const f = fixtures[index];
    if (index % 2 === 0) {
      await admin`INSERT INTO public.projects(id,user_id,name,description,audience,problem,questions,checklist) VALUES(${f.project},${f.owner},'The same idea name','The same description','Students','Problem',${admin.json(questions)},'{"manual":true,"metrics":{"active":0}}')`;
    } else {
      const first = fixtures[index - 1];
      const [before] =
        await admin`SELECT to_jsonb(p) AS row FROM public.projects p WHERE id=${first.project}`;
      const [draftBefore] =
        await admin`SELECT to_jsonb(d) AS row FROM public.interview_drafts d WHERE id=${first.draft}`;
      const [{ result }] = await asActor(
        session,
        f.owner,
        (s) =>
          s`SELECT public.create_owned_project(${f.project},${randomUUID()},'The same idea name','The same description','Students','Problem','') AS result`,
      );
      assert.equal(result.ok, true);
      const [after] =
        await admin`SELECT to_jsonb(p) AS row FROM public.projects p WHERE id=${first.project}`;
      const [draftAfter] =
        await admin`SELECT to_jsonb(d) AS row FROM public.interview_drafts d WHERE id=${first.draft}`;
      assert.deepEqual(
        after,
        before,
        "Adding a second idea must retain the legacy first row byte for byte",
      );
      assert.deepEqual(
        draftAfter,
        draftBefore,
        "Adding another idea cannot alter acknowledged private drafts",
      );
      await admin`UPDATE public.projects SET questions=${admin.json(questions)} WHERE id=${f.project}`;
    }
    await admin`INSERT INTO public.contacts(id,user_id,project_id,first_name,why) VALUES(${f.contact},${f.owner},${f.project},'Sam',${`FICTIONAL_PERSON_${f.marker}`})`;
    await asActor(session, f.owner, async (s) => {
      const [{ result: created }] =
        await s`SELECT public.create_interview_draft(${f.project},${f.draft},${f.contact},${s.json(questions)},NULL,'granted') AS result`;
      assert.equal(created.ok, true);
      const [{ result: saved }] =
        await s`SELECT public.save_interview_draft(${f.project},${f.draft},1,${randomUUID()},${f.contact},${s.json(document(f.marker))}) AS result`;
      assert.equal(saved.ok, true);
      assert.equal(saved.draft.revision, 2);
    });
  }
}
async function assertOwnership(session) {
  for (const owner of [fixtures[0].owner, fixtures[2].owner]) {
    const mine = fixtures.filter((f) => f.owner === owner);
    await asActor(session, owner, async (s) => {
      assert.deepEqual(
        (await s`SELECT id,name FROM public.projects ORDER BY id`).map((r) => r.id),
        mine.map((f) => f.project),
      );
      assert.deepEqual(
        (await s`SELECT id,first_name FROM public.contacts ORDER BY id`).map((r) => r.id),
        mine.map((f) => f.contact),
      );
      assert.deepEqual(
        (await s`SELECT id FROM public.interview_drafts ORDER BY id`).map((r) => r.id),
        mine.map((f) => f.draft),
      );
      for (const f of fixtures) {
        const [{ result }] =
          await s`SELECT public.load_interview_draft(${f.project},${f.draft}) AS result`;
        if (f.owner === owner)
          assert.equal(result.draft.document.answers[0].note, `FICTIONAL_BASE_${f.marker}`);
        else assert.deepEqual(result, { ok: false, code: "NOT_FOUND" });
      }
      const [{ result: crossed }] =
        await s`SELECT public.load_interview_draft(${mine[0].project},${mine[1].draft}) AS result`;
      assert.deepEqual(crossed, { ok: false, code: "NOT_FOUND" });
      const foreign = fixtures.find((f) => f.owner !== owner);
      const [{ result: saveDenied }] =
        await s`SELECT public.save_interview_draft(${foreign.project},${foreign.draft},2,${randomUUID()},${foreign.contact},${s.json(document(foreign.marker))}) AS result`;
      assert.deepEqual(saveDenied, { ok: false, code: "NOT_FOUND" });
      const [{ result: completeDenied }] =
        await s`SELECT public.complete_interview_draft(${foreign.project},${foreign.draft},2) AS result`;
      assert.deepEqual(completeDenied, { ok: false, code: "NOT_FOUND" });
    });
  }
}
async function load(admin, f) {
  const [row] =
    await admin`SELECT revision,status,document,completed_interview_id AS interview FROM public.interview_drafts WHERE id=${f.draft}`;
  return { ...row, revision: Number(row.revision) };
}
async function restore(session, f) {
  const [{ result }] = await asActor(
    session,
    f.owner,
    (s) =>
      s`SELECT public.set_owned_project_archived(${f.project},false,1,${randomUUID()}) AS result`,
  );
  assert.equal(result.ok, true);
}
async function races(admin, a, b) {
  const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`,
    [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
  assert.notEqual(pidA, pidB);
  // Accepted save commits first, so archive waits and must retain its exact acknowledged contents.
  const one = fixtures[0],
    saved = document(one.marker);
  saved.answers[0].note = "FICTIONAL_ACK_BEFORE_ARCHIVE";
  const mutation = randomUUID();
  await beginActor(a, one.owner);
  await beginActor(b, one.owner);
  const [{ result: ack }] =
    await a`SELECT public.save_interview_draft(${one.project},${one.draft},2,${mutation},${one.contact},${a.json(saved)}) AS result`;
  assert.equal(ack.ok, true);
  const archiveAfterSave =
    b`SELECT public.set_owned_project_archived(${one.project},true,0,${randomUUID()}) AS result`.execute();
  archiveAfterSave.catch(() => {});
  await assertBlocked(admin, pidA, pidB);
  await a`COMMIT`;
  assert.equal((await archiveAfterSave)[0].result.ok, true);
  await b`COMMIT`;
  assert.deepEqual((await load(admin, one)).document, saved);
  await restore(a, one);
  const [{ result: replay }] = await asActor(
    a,
    one.owner,
    (s) =>
      s`SELECT public.save_interview_draft(${one.project},${one.draft},2,${mutation},${one.contact},${s.json(saved)}) AS result`,
  );
  assert.deepEqual(replay, ack);
  // Archive commits first: waiting draft save is denied without changing its saved revision.
  const two = fixtures[1],
    rejected = document(two.marker);
  rejected.answers[0].note = "FICTIONAL_REJECTED_WHILE_ARCHIVED";
  const retryMutation = randomUUID();
  await beginActor(a, two.owner);
  await beginActor(b, two.owner);
  assert.equal(
    (
      await a`SELECT public.set_owned_project_archived(${two.project},true,0,${randomUUID()}) AS result`
    )[0].result.ok,
    true,
  );
  const saveAfterArchive =
    b`SELECT public.save_interview_draft(${two.project},${two.draft},2,${retryMutation},${two.contact},${b.json(rejected)}) AS result`.execute();
  saveAfterArchive.catch(() => {});
  await assertBlocked(admin, pidA, pidB);
  await a`COMMIT`;
  assert.equal((await saveAfterArchive)[0].result.code, "ARCHIVED");
  await b`COMMIT`;
  assert.equal((await load(admin, two)).revision, 2);
  assert.deepEqual((await load(admin, two)).document, document(two.marker));
  await restore(a, two);
  const [{ result: explicitRetry }] = await asActor(
    a,
    two.owner,
    (s) =>
      s`SELECT public.save_interview_draft(${two.project},${two.draft},2,${retryMutation},${two.contact},${s.json(rejected)}) AS result`,
  );
  assert.equal(explicitRetry.ok, true);
  assert.deepEqual((await load(admin, two)).document, rejected);
  // Finalize commits first: archive waits, the completed interview and terminal receipt survive.
  const three = fixtures[2];
  await beginActor(a, three.owner);
  await beginActor(b, three.owner);
  const [{ result: complete }] =
    await a`SELECT public.complete_interview_draft(${three.project},${three.draft},2) AS result`;
  assert.equal(complete.ok, true);
  assert.equal(complete.replayed, false);
  const archiveAfterComplete =
    b`SELECT public.set_owned_project_archived(${three.project},true,0,${randomUUID()}) AS result`.execute();
  archiveAfterComplete.catch(() => {});
  await assertBlocked(admin, pidA, pidB);
  await a`COMMIT`;
  assert.equal((await archiveAfterComplete)[0].result.ok, true);
  await b`COMMIT`;
  assert.equal((await load(admin, three)).status, "completed");
  assert.equal((await load(admin, three)).document, null);
  await restore(a, three);
  const [{ result: completeReplay }] = await asActor(
    a,
    three.owner,
    (s) => s`SELECT public.complete_interview_draft(${three.project},${three.draft},2) AS result`,
  );
  assert.equal(completeReplay.replayed, true);
  assert.equal(completeReplay.interviewId, complete.interviewId);
  // Archive commits first: no completion/capture/consent is persisted; explicit restore can finalize once.
  const four = fixtures[3];
  await beginActor(a, four.owner);
  await beginActor(b, four.owner);
  assert.equal(
    (
      await a`SELECT public.set_owned_project_archived(${four.project},true,0,${randomUUID()}) AS result`
    )[0].result.ok,
    true,
  );
  const completeAfterArchive =
    b`SELECT public.complete_interview_draft(${four.project},${four.draft},2) AS result`.execute();
  completeAfterArchive.catch(() => {});
  await assertBlocked(admin, pidA, pidB);
  await a`COMMIT`;
  assert.equal((await completeAfterArchive)[0].result.code, "ARCHIVED");
  await b`COMMIT`;
  assert.equal((await load(admin, four)).status, "active");
  assert.deepEqual((await load(admin, four)).document, document(four.marker));
  assert.equal(
    Number(
      (await admin`SELECT count(*) AS n FROM public.interviews WHERE project_id=${four.project}`)[0]
        .n,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await admin`SELECT count(*) AS n FROM firstten_private.interview_capture_operations WHERE project_id=${four.project}`
      )[0].n,
    ),
    0,
  );
  await restore(a, four);
  const [{ result: completedAfterRestore }] = await asActor(
    a,
    four.owner,
    (s) => s`SELECT public.complete_interview_draft(${four.project},${four.draft},2) AS result`,
  );
  assert.equal(completedAfterRestore.ok, true);
  assert.equal(completedAfterRestore.replayed, false);
  const [{ result: retried }] = await asActor(
    a,
    four.owner,
    (s) => s`SELECT public.complete_interview_draft(${four.project},${four.draft},2) AS result`,
  );
  assert.equal(retried.replayed, true);
  assert.equal(retried.interviewId, completedAfterRestore.interviewId);
  for (const f of [three, four]) {
    const [counts] =
      await admin`SELECT (SELECT count(*) FROM public.interviews WHERE project_id=${f.project}) AS interviews,(SELECT count(*) FROM public.processing_consents WHERE project_id=${f.project} AND target_kind='interview') AS consents,(SELECT count(*) FROM firstten_private.interview_capture_operations WHERE project_id=${f.project}) AS captures`;
    assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])), {
      interviews: 1,
      consents: 1,
      captures: 1,
    });
  }
  assert.equal(
    (await load(admin, fixtures[0])).document.answers[0].note,
    "FICTIONAL_ACK_BEFORE_ARCHIVE",
  );
  assert.equal(
    (await load(admin, fixtures[1])).document.answers[0].note,
    "FICTIONAL_REJECTED_WHILE_ARCHIVED",
  );
}

export async function main() {
  assert.equal(
    process.env["WS007_APPROVED_REHEARSAL"],
    "1",
    "Coordinator must approve these exact reviewed sources before any database action",
  );
  const expectedHistory = validateExpectedHistory(process.env["WS007_EXPECTED_HISTORY"]);
  const db = validateCloneName(`firstten_ws007_${randomBytes(6).toString("hex")}`);
  const identity = JSON.parse(docker(["inspect", CONTAINER, "--format", "{{json .}}"]).stdout);
  validateContainer(identity);
  // Local migrations04–24 were applied as pinned SQL, so history remains03.
  // Never rewrite history or pretend its max(version) proves the actual schema.
  const sourceState = () =>
    JSON.parse(
      docker(
        psql("postgres"),
        "SELECT json_build_object('history_marker',(SELECT max(version) FROM supabase_migrations.schema_migrations),'schema24_sentinel_present',to_regclass('firstten_private.marketing_submission_versions') IS NOT NULL,'schema25_sentinel_present',to_regclass('firstten_private.product_event_log') IS NOT NULL);",
      ).stdout.trim(),
    );
  const before = sourceState();
  validateSourceState(before, expectedHistory);
  const schema = docker([
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema-only",
  ]).stdout;
  const after = sourceState();
  validateSourceState(after, expectedHistory);
  assert.deepEqual(after, before, "Local history/schema sentinels changed during snapshot");
  assert.equal(
    docker(
      psql("postgres"),
      `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
    ).stdout.trim(),
    "0",
  );
  let creationAttempted = false;
  let connections = [];
  const receipt = {
    database: db,
    source_history_marker: expectedHistory,
    reviewed_applied_schema: "20261018024000",
    reviewed_schema24_migration_sha256:
      "9bd05330ef36dc72109419b2b9dcc297242cace0468d7a816b16d8e0a48e3634",
    source_state_before: before,
    source_state_after: after,
    schema24_sentinel: "firstten_private.marketing_submission_versions",
    absent_schema25_sentinel: "firstten_private.product_event_log",
    schema_sha256: createHash("sha256").update(schema).digest("hex"),
    fixtures,
    source_data_write_operations: 0,
    provider_calls: 0,
    complete: false,
    clone_absent: false,
  };
  try {
    creationAttempted = true; // CREATE may succeed even when its acknowledgement is lost.
    docker(["exec", CONTAINER, "createdb", "-U", "postgres", "-T", "template0", db]);
    const restored = docker(psql(db, "supabase_admin"), schema, true);
    if (restored.status !== 0) {
      await writeFile(diagnostic, restored.stderr, { mode: 0o600 });
      throw new Error("Schema-only restore failed");
    }
    validateEmptyClone(
      docker(
        psql(db),
        "SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.projects);",
      ).stdout,
    );
    const passwordEntry = identity.Config?.Env?.find((v) => v.startsWith("POSTGRES_PASSWORD="));
    assert.ok(passwordEntry, "Dedicated runtime credential missing");
    const options = {
      host: "127.0.0.1",
      port: 55322,
      database: db,
      username: "postgres",
      password: passwordEntry.slice(18),
      max: 1,
      connect_timeout: 5,
      prepare: false,
      onnotice: () => {},
    };
    const admin = postgres(options),
      a = postgres(options),
      b = postgres(options);
    connections = [admin, a, b];
    await seed(admin, a);
    await assertOwnership(a);
    await races(admin, a, b);
    assert.equal(
      Number(
        (
          await admin`SELECT (SELECT count(*) FROM firstten_private.ai_usage_operations)+(SELECT count(*) FROM firstten_private.ai_context_claims) AS n`
        )[0].n,
      ),
      0,
    );
    receipt.complete = true;
  } finally {
    if (connections.length) {
      await Promise.allSettled(connections.map((s) => s`ROLLBACK`));
      await Promise.allSettled(connections.map((s) => s.end({ timeout: 5 })));
    }
    if (creationAttempted) {
      const exists = docker(
        psql("postgres"),
        `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
      ).stdout.trim();
      assert.ok(["0", "1"].includes(exists), "Exact clone existence unconfirmed");
      if (exists === "1")
        docker(["exec", CONTAINER, "dropdb", "-U", "postgres", "--force", db], undefined, true);
    }
    receipt.clone_absent =
      docker(
        psql("postgres"),
        `SELECT count(*) FROM pg_database WHERE datname='${db}';`,
      ).stdout.trim() === "0";
    await writeFile(
      "/private/tmp/firstten-ws007-clone-receipt.json",
      JSON.stringify(receipt, null, 2) + "\n",
      { mode: 0o600 },
    );
    assert.equal(receipt.clone_absent, true, "Exact disposable clone cleanup unconfirmed");
  }
  console.log(
    JSON.stringify({
      complete: receipt.complete,
      clone_absent: receipt.clone_absent,
      owners: 2,
      projects: 4,
      observed_lock_races: 4,
      provider_calls: 0,
      source_data_write_operations: 0,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (error) => {
    await writeFile(
      diagnostic,
      JSON.stringify({ name: error.name, message: error.message, code: error.code }) + "\n",
      { mode: 0o600 },
    );
    console.error(
      "WS007 clone rehearsal failed. Private diagnostic and any cleanup receipt are in /private/tmp; no source data write is permitted.",
    );
    process.exitCode = 1;
  });
}
