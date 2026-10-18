import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const info = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
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
const user = randomUUID(),
  project = randomUUID(),
  mutation = randomUUID();
const doc = {
  schemaVersion: 1,
  frame: { problem: "Fictional race winner", solution: "" },
  hypothesisDraft: {
    population: "",
    situation: "",
    prediction: "",
    disconfirming: "",
    timeWindow: "",
    reason: "",
  },
  hypotheses: [],
  selectedHypothesisId: null,
  people: [],
  missingPerspectives: "",
  scriptDraft: { title: "", opening: "", questions: [], closing: "" },
  scripts: [],
  selectedScriptId: null,
  contexts: [],
  excludedContextIds: [],
  results: [],
  reflection: { decision: null, reason: "", productChange: "", nextTest: "", uncertainty: "" },
};
let created = false;
async function begin(client) {
  await client`BEGIN`;
  await client`SET LOCAL statement_timeout='15s'`;
  await client`SELECT set_config('request.jwt.claim.sub',${user},true)`;
  await client`SET LOCAL ROLE authenticated`;
}
async function observeBlock(pidA, pidB) {
  for (let i = 0; i < 40; i++) {
    const [{ waiting }] =
      await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
    if (waiting) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  assert.fail("The competing request must overlap and wait on the project lock");
}
try {
  await admin.begin(async (s) => {
    await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES(${user},'authenticated','authenticated',${`discovery-race-${user}@example.invalid`},'',now(),${s.json({})},${s.json({})},now(),now())`;
    await s`INSERT INTO public.projects(id,user_id,name,questions) VALUES(${project},${user},'Fictional discovery concurrency',${s.json(["Original saved question"])})`;
  });
  created = true;
  const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`;
  const [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
  assert.notEqual(pidA, pidB);
  await begin(a);
  await begin(b);
  const [{ result: first }] =
    await a`SELECT public.save_discovery_workspace(${project},0,${mutation},${a.json(doc)}) AS result`;
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  const competing = structuredClone(doc);
  competing.frame.problem = "Losing stale draft must not overwrite";
  const pending =
    b`SELECT public.save_discovery_workspace(${project},0,${randomUUID()},${b.json(competing)}) AS result`.execute();
  await observeBlock(pidA, pidB);
  await a`COMMIT`;
  const [{ result: second }] = await pending;
  await b`COMMIT`;
  assert.deepEqual(second, { ok: false, code: "CONFLICT", currentRevision: 1 });
  await begin(a);
  const [{ result: replay }] =
    await a`SELECT public.save_discovery_workspace(${project},0,${mutation},${a.json(doc)}) AS result`;
  await a`COMMIT`;
  assert.deepEqual(replay, first);
  const [saved] =
    await admin`SELECT revision,document,history FROM public.discovery_workspaces WHERE project_id=${project}`;
  assert.equal(Number(saved.revision), 1);
  assert.deepEqual(saved.document, doc);
  assert.deepEqual(saved.history, []);

  const hypothesisId = randomUUID(),
    scriptId = randomUUID(),
    stamp = new Date().toISOString();
  const versioned = structuredClone(doc);
  versioned.hypotheses = [
    {
      id: hypothesisId,
      createdAt: stamp,
      population: "Fictional organizers",
      situation: "Before a study meeting",
      prediction: "Recent rescheduling episodes",
      disconfirming: "No recent coordination problem",
      timeWindow: "One week",
      reason: "First test",
    },
  ];
  versioned.selectedHypothesisId = hypothesisId;
  versioned.scripts = [
    {
      id: scriptId,
      createdAt: stamp,
      hypothesisId,
      contextIds: [],
      title: "Preserved manual script",
      opening: "May I take notes?",
      questions: ["Tell me about the last meeting."],
      closing: "What have I missed?",
    },
  ];
  versioned.selectedScriptId = scriptId;
  await begin(a);
  const [{ result: next }] =
    await a`SELECT public.save_discovery_workspace(${project},1,${randomUUID()},${a.json(versioned)}) AS result`;
  await a`COMMIT`;
  assert.equal(next.ok, true);
  assert.equal(next.revision, 2);
  await begin(a);
  await begin(b);
  await a`UPDATE public.projects SET questions=${a.json(["A newer deliberate manual edit"])} WHERE id=${project}`;
  const adoption =
    b`SELECT public.adopt_discovery_script(${project},2,${scriptId},${b.json(["Original saved question"])},NULL) AS result`.execute();
  await observeBlock(pidA, pidB);
  await a`COMMIT`;
  const [{ result: adoptionResult }] = await adoption;
  await b`COMMIT`;
  assert.deepEqual(adoptionResult, { ok: false, code: "CONFLICT" });
  const [after] =
    await admin`SELECT p.questions,d.document,d.revision FROM public.projects p JOIN public.discovery_workspaces d ON d.project_id=p.id WHERE p.id=${project}`;
  assert.deepEqual(after.questions, ["A newer deliberate manual edit"]);
  assert.deepEqual(after.document, versioned);
  assert.equal(Number(after.revision), 2);
  console.log(
    "Actual overlapping sessions: one discovery save, one stale conflict; retry adds no revision. Stale script adoption preserves the newer questions and original script versions.",
  );
} finally {
  await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
  if (created) {
    await admin.begin(async (s) => {
      await s`DELETE FROM public.projects WHERE id=${project} AND user_id=${user}`;
      await s`DELETE FROM auth.users WHERE id=${user}`;
    });
    const [{ remaining }] =
      await admin`SELECT (SELECT count(*) FROM public.projects WHERE id=${project})+(SELECT count(*) FROM public.discovery_workspaces WHERE project_id=${project})+(SELECT count(*) FROM auth.users WHERE id=${user}) AS remaining`;
    assert.equal(Number(remaining), 0);
    console.log("Only this run's new local fictional fixtures removed; absence verified.");
  }
  await Promise.all([admin.end(), a.end(), b.end()]);
}
