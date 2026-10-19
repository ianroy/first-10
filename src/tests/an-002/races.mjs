import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { readFileSync } from "node:fs";
export async function measurementRaces({ database, password }) {
  assert.match(database, /^firstten_measurement_test_[a-f0-9]{10}$/);
  const opts = {
    host: "127.0.0.1",
    port: 55322,
    database,
    username: "postgres",
    password,
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  };
  const admin = postgres(opts),
    a = postgres(opts),
    b = postgres(opts);
  const actor = randomUUID(),
    project = randomUUID(),
    draft = randomUUID(),
    interview = randomUUID();
  const start = async (c) => {
    await c`BEGIN`;
    await c`SET LOCAL statement_timeout='15s'`;
    await c`SELECT set_config('request.jwt.claim.sub',${actor},true)`;
    await c`SET LOCAL ROLE authenticated`;
  };
  const blocked = async (pa, pb) => {
    for (let n = 0; n < 80; n++) {
      if ((await admin`SELECT ${pa}::integer=ANY(pg_blocking_pids(${pb}))AS waiting`)[0].waiting)
        return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail("Expected competing sessions never overlapped");
  };
  const fixture = readFileSync(
    new URL("../../../supabase/tests/an-002.sql", import.meta.url),
    "utf8",
  );
  const fixtureBlock = (name) => {
    const match = fixture.match(
      new RegExp(
        "-- BEGIN_AN003_TEST_ONLY_READINESS_" +
          name +
          "\\n([\\s\\S]*?)-- END_AN003_TEST_ONLY_READINESS_" +
          name,
      ),
    );
    assert(match, "Missing reviewed readiness fixture block");
    return match[1];
  };
  try {
    assert.equal((await admin`SELECT current_database()AS name`)[0].name, database);
    await admin.unsafe(fixtureBlock("SETUP"));
    await admin`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES(${actor},'authenticated','authenticated',${`measurement-race-${actor}@example.invalid`},'{"synthetic":true}','{}')`;
    await admin`UPDATE firstten_private.product_measurement_policy SET enabled=true,environment='test',instrumentation_start=clock_timestamp(),last_purge_at=clock_timestamp(),purge_schedule_verified_at=clock_timestamp(),purge_schedule_receipt=repeat('a',64)`;
    await start(a);
    assert.equal(
      (
        await a`SELECT public.save_product_measurement_preference('granted',0,${randomUUID()})AS r`
      )[0].r.ok,
      true,
    );
    await a`INSERT INTO public.projects(id,user_id,name,questions)VALUES(${project},${actor},'Fictional measurement race','["What happened?"]')`;
    assert.equal(
      (
        await a`SELECT public.create_interview_draft(${project},${draft},NULL,'["What happened?"]',NULL,'granted')AS r`
      )[0].r.ok,
      true,
    );
    await a`COMMIT`;
    const pa = (await a`SELECT pg_backend_pid()AS pid`)[0].pid,
      pb = (await b`SELECT pg_backend_pid()AS pid`)[0].pid;
    await start(a);
    await start(b);
    const first = (await a`SELECT public.complete_interview_draft(${project},${draft},1)AS r`)[0].r;
    const duplicate =
      b`SELECT public.complete_interview_draft(${project},${draft},1)AS r`.execute();
    duplicate.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    const replay = (await duplicate)[0].r;
    await b`COMMIT`;
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.interviewId, replay.interviewId);
    assert.equal(
      Number(
        (
          await admin`SELECT count(*)AS n FROM firstten_private.product_event_log WHERE artifact_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=${actor} AND entity_kind='interview')`
        )[0].n,
      ),
      1,
    );
    console.log(
      "Observed duplicate canonical completion race: one completed source and one milestone event.",
    );
    await start(a);
    await a`INSERT INTO public.interviews(id,user_id,project_id,completed)VALUES(${interview},${actor},${project},false)`;
    await a`COMMIT`;
    await start(a);
    assert.equal(
      (
        await a`SELECT public.save_product_measurement_preference('withdrawn',1,${randomUUID()})AS r`
      )[0].r.ok,
      true,
    );
    await start(b);
    const completion =
      b`UPDATE public.interviews SET completed=true WHERE id=${interview}`.execute();
    completion.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    await completion;
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT count(*)AS n FROM firstten_private.product_event_log WHERE subject_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=${actor} AND entity_kind='account')`
        )[0].n,
      ),
      0,
    );
    assert.equal(
      (await admin`SELECT completed FROM public.interviews WHERE id=${interview}`)[0].completed,
      true,
    );
    console.log(
      "Observed withdrawal/legacy-completion race: business work succeeds while optional measurement stays absent.",
    );
    await start(a);
    assert.equal(
      (
        await a`SELECT public.save_product_measurement_preference('granted',2,${randomUUID()})AS r`
      )[0].r.ok,
      true,
    );
    await a`COMMIT`;
    const p1 = randomUUID(),
      p2 = randomUUID();
    await start(a);
    await a`INSERT INTO public.projects(id,user_id,name)VALUES(${p1},${actor},'First simultaneous idea')`;
    await start(b);
    const second =
      b`INSERT INTO public.projects(id,user_id,name)VALUES(${p2},${actor},'Second simultaneous idea')`.execute();
    second.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    await second;
    await b`COMMIT`;
    const counts = (
      await admin`SELECT count(*)AS n,count(DISTINCT subject_ref)AS subjects FROM firstten_private.product_event_log WHERE project_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=${actor} AND entity_kind='project')`
    )[0];
    assert.equal(Number(counts.n), 2);
    assert.equal(Number(counts.subjects), 1);
    console.log(
      "Observed simultaneous-project race: two project events retain one account subject.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    try {
      await admin`UPDATE firstten_private.product_measurement_policy SET enabled=false,environment='development',instrumentation_start=NULL,purge_schedule_verified_at=NULL,purge_schedule_receipt=NULL`;
      await admin.unsafe(fixtureBlock("CLEANUP"));
    } finally {
      await Promise.all([admin.end(), a.end(), b.end()]);
    }
  }
}
