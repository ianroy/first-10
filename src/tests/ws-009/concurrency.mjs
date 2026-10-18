import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Opt-in dedicated local fixture rehearsal. Never logs connection secrets.
const info = JSON.parse(
  execFileSync("/usr/local/bin/docker", ["inspect", "supabase_db_hdwnnuvqqkkpontcdbwa"], {
    encoding: "utf8",
  }),
)[0];
assert.equal(info.NetworkSettings.Ports["5432/tcp"][0].HostPort, "55322");
const database = process.env["WS009_TEST_DATABASE"];
assert.match(database ?? "", /^firstten_ws009_[a-f0-9]{12}$/);
const options = {
  host: "127.0.0.1",
  port: 55322,
  database,
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
  contact = randomUUID();
const email = `ws009-race-${owner}@example.invalid`,
  name = "Fictional WS009 concurrency";
async function begin(s) {
  await s`BEGIN`;
  await s`SET LOCAL statement_timeout='10s'`;
  await s`SELECT set_config('request.jwt.claim.sub',${owner},true)`;
  await s`SET LOCAL ROLE authenticated`;
}
async function blocked(pidA, pidB) {
  for (let i = 0; i < 40; i++) {
    const [{ waiting }] =
      await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Concurrent transactions did not overlap on parent lock");
}
try {
  await admin.begin(async (s) => {
    await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES(${owner},'authenticated','authenticated',${email},'',now(),'{}','{}',now(),now())`;
    await s`INSERT INTO public.projects(id,user_id,name) VALUES(${project},${owner},${name})`;
    await s`INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES(${contact},${owner},${project},'Fictional')`;
  });
  const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`,
    [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
  assert.notEqual(pidA, pidB);
  // A direct child edit takes a parent SHARE lock until commit; archive must wait.
  await begin(a);
  await begin(b);
  await a`UPDATE public.contacts SET why='Saved before archive' WHERE id=${contact}`;
  const archiving =
    b`SELECT public.set_owned_project_archived(${project},true,0,${randomUUID()}) AS result`.execute();
  await blocked(pidA, pidB);
  await a`COMMIT`;
  assert.equal((await archiving)[0].result.ok, true);
  await b`COMMIT`;
  assert.equal(
    (await admin`SELECT why FROM public.contacts WHERE id=${contact}`)[0].why,
    "Saved before archive",
  );
  // A late edit cannot persist after archive commits.
  await begin(a);
  await assert.rejects(a`UPDATE public.contacts SET why='Lost stale edit' WHERE id=${contact}`, {
    code: "PT409",
    message: "WORKSPACE_ARCHIVED",
  });
  await a`ROLLBACK`;
  await begin(a);
  assert.equal(
    (
      await a`SELECT public.set_owned_project_archived(${project},false,1,${randomUUID()}) AS result`
    )[0].result.ok,
    true,
  );
  await a`COMMIT`;
  // Parent-first RPC versus child-first direct edit fails fast, not a deadlock.
  await begin(a);
  await begin(b);
  await a`SELECT public.set_owned_project_archived(${project},true,2,${randomUUID()})`;
  await assert.rejects(b`UPDATE public.contacts SET why='Competing edit' WHERE id=${contact}`, {
    code: "PT409",
    message: "WORKSPACE_BUSY",
  });
  await b`ROLLBACK`;
  await a`COMMIT`;
  assert.equal(
    (await admin`SELECT why FROM public.contacts WHERE id=${contact}`)[0].why,
    "Saved before archive",
  );
  console.log(
    "WS009 actual two-connection checks passed: write-before-archive serialization, archive-before-write rejection, NOWAIT deadlock avoidance, original content preserved.",
  );
} finally {
  await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
  await admin.begin(async (s) => {
    const [identity] =
      await s`SELECT p.user_id,p.name,u.email FROM public.projects p JOIN auth.users u ON u.id=p.user_id WHERE p.id=${project}`;
    if (!identity) return;
    assert.equal(identity.user_id, owner);
    assert.equal(identity.name, name);
    assert.equal(identity.email, email);
    await s`DELETE FROM public.projects WHERE id=${project} AND user_id=${owner}`;
    await s`DELETE FROM auth.users WHERE id=${owner} AND email=${email}`;
  });
  assert.equal(
    (await admin`SELECT count(*)::integer AS n FROM public.projects WHERE id=${project}`)[0].n,
    0,
  );
  await Promise.all([admin.end(), a.end(), b.end()]);
}
