import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
const info = JSON.parse(
  execFileSync("docker", ["inspect", "supabase_db_hdwnnuvqqkkpontcdbwa"], { encoding: "utf8" }),
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
const user = randomUUID(),
  project = randomUUID(),
  requests = [randomUUID(), randomUUID()];
let created = false;
try {
  await admin.begin(async (s) => {
    await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES(${user},'authenticated','authenticated',${`lifecycle-${user}@example.invalid`},'',now(),'{}','{}',now(),now())`;
    await s`INSERT INTO public.projects(id,user_id,name,questions,checklist) VALUES(${project},${user},'Fictional lifecycle race','["Retain this question"]','{"preserve":true}')`;
  });
  created = true;
  const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`,
    [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
  for (const c of [a, b]) {
    await c`BEGIN`;
    await c`SET LOCAL statement_timeout='15s'`;
    await c`SELECT set_config('request.jwt.claim.sub',${user},true)`;
    await c`SET LOCAL ROLE authenticated`;
  }
  const [{ result: first }] =
    await a`SELECT public.set_owned_project_archived(${project},true,0,${requests[0]}) AS result`;
  assert.equal(first.ok, true);
  assert.equal(first.data.lifecycleRevision, 1);
  const pending =
    b`SELECT public.set_owned_project_archived(${project},true,0,${requests[1]}) AS result`.execute();
  let observed = false;
  for (let i = 0; i < 30; i++) {
    const [{ waiting }] =
      await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
    if (waiting) {
      observed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(observed, "Second lifecycle transition must wait on the first project lock");
  await a`COMMIT`;
  const [{ result: second }] = await pending;
  await b`COMMIT`;
  assert.deepEqual(second, { ok: false, code: "REVISION_CONFLICT", currentRevision: 1 });
  const [saved] =
    await admin`SELECT archived_at,lifecycle_revision,questions,checklist FROM public.projects WHERE id=${project}`;
  assert(saved.archived_at);
  assert.equal(Number(saved.lifecycle_revision), 1);
  assert.deepEqual(saved.questions, ["Retain this question"]);
  assert.deepEqual(saved.checklist, { preserve: true });
  console.log(
    "Two actual concurrent lifecycle requests: one archive transition, one revision conflict, content unchanged.",
  );
} finally {
  await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
  if (created) {
    await admin.begin(async (s) => {
      await s`DELETE FROM public.projects WHERE id=${project} AND user_id=${user}`;
      await s`DELETE FROM auth.users WHERE id=${user}`;
    });
    const [{ remaining }] =
      await admin`SELECT (SELECT count(*) FROM public.projects WHERE id=${project})+(SELECT count(*) FROM auth.users WHERE id=${user})+(SELECT count(*) FROM firstten_private.project_lifecycle_operations WHERE project_id=${project}) AS remaining`;
    assert.equal(Number(remaining), 0);
    console.log("Only newly created local fictional fixtures removed.");
  }
  await Promise.all([admin.end(), a.end(), b.end()]);
}
