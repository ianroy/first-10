import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Exact named LOCAL First Ten stack only. No hosted or unrelated database is accepted.
const container = "supabase_db_hdwnnuvqqkkpontcdbwa";
const info = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(info.NetworkSettings.Ports["5432/tcp"][0].HostPort, "55322");
const password = info.Config.Env.find((value) => value.startsWith("POSTGRES_PASSWORD=")).slice(18);
const options = {
  host: "127.0.0.1",
  port: 55322,
  database: "postgres",
  username: "postgres",
  password,
  onnotice: () => {},
  max: 1,
  connect_timeout: 5,
  idle_timeout: 5,
};
const admin = postgres(options),
  first = postgres(options),
  second = postgres(options);
const user = randomUUID(),
  project = randomUUID(),
  origins = [randomUUID(), randomUUID()];
let created = false;
try {
  await admin.begin(async (sql) => {
    await sql`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      VALUES(${user},'authenticated','authenticated',${`origin-concurrency-${user}@example.invalid`},'',now(),'{}','{}',now(),now())`;
    await sql`INSERT INTO public.projects(id,user_id,name,stage) VALUES(${project},${user},'Fictional local concurrency fixture',3)`;
    for (const id of origins) {
      await sql`SELECT public.record_ai_generation(${sql.json({ request_id: id, user_id: user, project_id: project, kind: "stage2", prompt_id: "first-ten.stage2", prompt_version: 1, schema_id: "first-ten.stage2.output", schema_version: 1, requested_model: "fixture/no-call", actual_model: null, requested_provider: null, actual_provider: null, provider_generation_id: null, prompt_tokens: null, completion_tokens: null, total_tokens: null, cost_usd: null, attempts: 1 })})`;
    }
    await sql`INSERT INTO public.outreach(user_id,project_id,stage,kind,title,body) VALUES(${user},${project},3,'referral','Untouched stage3','Fictional earlier stage3 draft')`;
  });
  created = true;
  const [{ pid: firstPid }] = await first`SELECT pg_backend_pid() AS pid`;
  const [{ pid: secondPid }] = await second`SELECT pg_backend_pid() AS pid`;
  await first`BEGIN`;
  await first`SET LOCAL statement_timeout='15s'`;
  await first`SELECT set_config('request.jwt.claim.sub',${user},true)`;
  await first`SET LOCAL ROLE authenticated`;
  await first`SELECT public.save_generated_outreach(${project},2,${origins[0]},${first.json([
    { kind: "channel", title: "A", body: "Fictional channel A" },
    { kind: "draft", title: "A", body: "Fictional draft A" },
  ])},${first.json(["Fictional survey A"])})`;
  await second`BEGIN`;
  await second`SET LOCAL statement_timeout='15s'`;
  await second`SELECT set_config('request.jwt.claim.sub',${user},true)`;
  await second`SET LOCAL ROLE authenticated`;
  const blockedSave =
    second`SELECT public.save_generated_outreach(${project},2,${origins[1]},${second.json([
      { kind: "channel", title: "B", body: "Fictional channel B" },
      { kind: "draft", title: "B", body: "Fictional draft B" },
    ])},${second.json(["Fictional survey B"])})`.execute();
  let blocked = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const [{ waiting }] =
      await admin`SELECT ${firstPid}::integer=ANY(pg_blocking_pids(${secondPid})) AS waiting`;
    if (waiting) {
      blocked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(blocked, true, "Second replacement must wait for the first project transaction");
  await first`COMMIT`;
  await blockedSave;
  await second`COMMIT`;
  const rows =
    await admin`SELECT stage,body,generation_origin_id FROM public.outreach WHERE project_id=${project} ORDER BY stage,body`;
  assert.deepEqual(
    rows.filter((r) => r.stage === 2).map((r) => r.body),
    ["Fictional channel B", "Fictional draft B"],
  );
  assert(rows.filter((r) => r.stage === 2).every((r) => r.generation_origin_id === origins[1]));
  assert.equal(rows.find((r) => r.stage === 3).body, "Fictional earlier stage3 draft");
  const [saved] =
    await admin`SELECT survey,survey_origin_id FROM public.projects WHERE id=${project}`;
  assert.deepEqual(saved.survey, ["Fictional survey B"]);
  assert.equal(saved.survey_origin_id, origins[1]);
  console.log(
    "Two concurrent connections serialized; saved rows, survey and origin match the final request; other stage preserved.",
  );
} finally {
  await Promise.allSettled([first`ROLLBACK`, second`ROLLBACK`]);
  if (created) {
    await admin.begin(async (sql) => {
      await sql`DELETE FROM public.projects WHERE id=${project} AND user_id=${user}`;
      await sql`DELETE FROM auth.users WHERE id=${user}`;
    });
    const [{ remaining }] =
      await admin`SELECT (SELECT count(*) FROM public.projects WHERE id=${project})+(SELECT count(*) FROM auth.users WHERE id=${user})+(SELECT count(*) FROM firstten_private.ai_generation_provenance WHERE project_id=${project}) AS remaining`;
    assert.equal(Number(remaining), 0);
    console.log(
      "Created fictional local fixtures removed; no provider request or production data access.",
    );
  }
  await Promise.all([admin.end(), first.end(), second.end()]);
}
