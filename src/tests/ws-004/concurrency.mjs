import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Dedicated local rehearsal only. No connection URL, secret or query parameters are logged.
const info = JSON.parse(
  execFileSync("/usr/local/bin/docker", ["inspect", "supabase_db_hdwnnuvqqkkpontcdbwa"], {
    encoding: "utf8",
  }),
)[0];
assert.equal(info.NetworkSettings.Ports["5432/tcp"][0].HostPort, "55322");
const options = {
  host: "127.0.0.1",
  port: 55322,
  database: "postgres",
  username: "postgres",
  password: info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD=")).slice(18),
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
};
const admin = postgres(options),
  a = postgres(options),
  b = postgres(options);
const owner = randomUUID(),
  project = randomUUID(),
  draft = randomUUID(),
  mutation = randomUUID();
const email = `ws004-race-${owner}@example.invalid`,
  name = "Fictional WS004 concurrency";
const questions = ["Élodie: what happened last time?"],
  doc = {
    schemaVersion: 1,
    policyVersion: 1,
    answers: [{ q: questions[0], note: "Fictional winning observation", quote: "" }],
    tags: [],
    choices: { noteStatus: "granted", aiStatus: "unknown", sharingStatus: "unknown" },
    currentQuestion: 1,
  };
let created = false;
async function begin(s) {
  await s`BEGIN`;
  await s`SET LOCAL statement_timeout='15s'`;
  await s`SELECT set_config('request.jwt.claim.sub',${owner},true)`;
  await s`SET LOCAL ROLE authenticated`;
}
async function blocked(pidA, pidB) {
  for (let i = 0; i < 40; i++) {
    const [{ waiting }] =
      await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  assert.fail("Competing sessions did not overlap on the project lock");
}
try {
  await admin.begin(async (s) => {
    await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES(${owner},'authenticated','authenticated',${email},'',now(),'{}','{}',now(),now())`;
    await s`INSERT INTO public.projects(id,user_id,name,questions) VALUES(${project},${owner},${name},${s.json(questions)})`;
  });
  created = true;
  await begin(a);
  const [{ result: initial }] =
    await a`SELECT public.create_interview_draft(${project},${draft},NULL,${a.json(questions)},NULL,'granted') AS result`;
  await a`COMMIT`;
  assert.equal(initial.ok, true);
  const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`,
    [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
  assert.notEqual(pidA, pidB);
  await begin(a);
  await begin(b);
  const [{ result: win }] =
    await a`SELECT public.save_interview_draft(${project},${draft},1,${mutation},NULL,${a.json(doc)}) AS result`;
  assert.equal(win.draft.revision, 2);
  const losing = structuredClone(doc);
  losing.answers[0].note = "Stale losing observation";
  const stale =
    b`SELECT public.save_interview_draft(${project},${draft},1,${randomUUID()},NULL,${b.json(losing)}) AS result`.execute();
  await blocked(pidA, pidB);
  await a`COMMIT`;
  const [{ result: conflict }] = await stale;
  await b`COMMIT`;
  assert.deepEqual(conflict, { ok: false, code: "CONFLICT", currentRevision: 2 });
  await begin(a);
  const [{ result: retry }] =
    await a`SELECT public.save_interview_draft(${project},${draft},1,${mutation},NULL,${a.json(doc)}) AS result`;
  await a`COMMIT`;
  assert.deepEqual(retry, win);
  const [saved] =
    await admin`SELECT revision,document,(SELECT count(*) FROM public.interviews WHERE project_id=${project}) AS interviews FROM public.interview_drafts WHERE id=${draft}`;
  assert.equal(Number(saved.revision), 2);
  assert.deepEqual(saved.document, doc);
  assert.equal(Number(saved.interviews), 0);
  await begin(a);
  await begin(b);
  const [{ result: complete }] =
    await a`SELECT public.complete_interview_draft(${project},${draft},2) AS result`;
  assert.equal(complete.ok, true);
  assert.equal(complete.replayed, false);
  const duplicate =
    b`SELECT public.complete_interview_draft(${project},${draft},2) AS result`.execute();
  await blocked(pidA, pidB);
  await a`COMMIT`;
  const [{ result: receipt }] = await duplicate;
  await b`COMMIT`;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.replayed, true);
  assert.equal(receipt.interviewId, complete.interviewId);
  const [counts] =
    await admin`SELECT (SELECT count(*) FROM public.interviews WHERE project_id=${project}) AS interviews,(SELECT count(*) FROM public.processing_consents WHERE project_id=${project}) AS consents,(SELECT count(*) FROM firstten_private.interview_capture_operations WHERE project_id=${project}) AS operations,(SELECT document FROM public.interview_drafts WHERE id=${draft}) AS document`;
  assert.equal(Number(counts.interviews), 1);
  assert.equal(Number(counts.consents), 1);
  assert.equal(Number(counts.operations), 1);
  assert.equal(counts.document, null);
  await begin(a);
  const [{ result: createReplay }] =
    await a`SELECT public.create_interview_draft(${project},${draft},NULL,${a.json(questions)},NULL,'granted') AS result`;
  await a`COMMIT`;
  assert.equal(createReplay.draft.status, "completed");
  assert.equal(createReplay.draft.interviewId, complete.interviewId);
  console.log(
    "Actual overlapping saves: one revision, one stale conflict; identical retry adds no revision. Actual overlapping completions: one interview, one consent and one receipt; raw draft copy cleared. Completed-create replay remains terminal.",
  );
} finally {
  await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
  if (created) {
    // Approved local test-only exception: audit rows cannot normally be deleted.
    // Validate exact fresh identities, lock this table, disable only its append-only
    // trigger for these exact synthetic rows, and restore it before transaction commit.
    // Any mismatch/error aborts cleanup; no broader deletion or hosted target is allowed.
    await admin.begin(async (s) => {
      const rows =
        await s`SELECT p.user_id,p.name,u.email FROM public.projects p JOIN auth.users u ON u.id=p.user_id WHERE p.id=${project}`;
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], { user_id: owner, name, email });
      await s`LOCK TABLE firstten_private.processing_consent_history IN ACCESS EXCLUSIVE MODE`;
      const [{ enabled }] =
        await s`SELECT tgenabled AS enabled FROM pg_trigger WHERE tgrelid='firstten_private.processing_consent_history'::regclass AND tgname='consent_history_append_only'`;
      assert.equal(enabled, "O");
      await s`ALTER TABLE firstten_private.processing_consent_history DISABLE TRIGGER consent_history_append_only`;
      await s`DELETE FROM firstten_private.processing_consent_history WHERE user_id=${owner} AND project_id=${project}`;
      await s`ALTER TABLE firstten_private.processing_consent_history ENABLE TRIGGER consent_history_append_only`;
      await s`DELETE FROM firstten_private.interview_capture_operations WHERE user_id=${owner} AND project_id=${project}`;
      await s`DELETE FROM public.projects WHERE id=${project} AND user_id=${owner}`;
      await s`DELETE FROM auth.users WHERE id=${owner} AND email=${email}`;
    });
    const [{ remaining, enabled }] =
      await admin`SELECT (SELECT count(*) FROM public.projects WHERE id=${project})+(SELECT count(*) FROM public.interview_drafts WHERE project_id=${project})+(SELECT count(*) FROM public.interviews WHERE project_id=${project})+(SELECT count(*) FROM public.processing_consents WHERE project_id=${project})+(SELECT count(*) FROM firstten_private.processing_consent_history WHERE project_id=${project})+(SELECT count(*) FROM firstten_private.interview_capture_operations WHERE project_id=${project})+(SELECT count(*) FROM auth.users WHERE id=${owner}) AS remaining,(SELECT tgenabled FROM pg_trigger WHERE tgrelid='firstten_private.processing_consent_history'::regclass AND tgname='consent_history_append_only') AS enabled`;
    assert.equal(Number(remaining), 0);
    assert.equal(enabled, "O");
    console.log(
      "Exact local synthetic fixtures absent and append-only trigger enabled after cleanup.",
    );
  }
  await Promise.all([admin.end(), a.end(), b.end()]);
}
