import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
export async function handoffRaces({ database, password }) {
  assert.match(database, /^firstten_marketing_handoff_test_[a-f0-9]{10}$/);
  const opts = {
      host: "127.0.0.1",
      port: 55322,
      database,
      username: "postgres",
      password,
      max: 1,
      connect_timeout: 5,
      onnotice: () => {},
    },
    admin = postgres(opts),
    a = postgres(opts),
    b = postgres(opts);
  const owner = randomUUID(),
    cid = randomUUID(),
    team = randomUUID(),
    principal = randomUUID(),
    assignment = randomUUID(),
    plan = randomUUID(),
    thread = randomUUID(),
    recovery = randomBytes(32).toString("hex");
  let session = randomBytes(32).toString("hex"),
    revision = 1;
  const hash = (v) => createHash("sha256").update(v).digest("hex"),
    fixture = readFileSync(
      new URL("../../../supabase/tests/guest-marketing-handoff.sql", import.meta.url),
      "utf8",
    ),
    doc = JSON.parse(/VALUES\('full','([^']+)'\)/.exec(fixture)[1]);
  const result = (r) => r[0].result,
    start = async (c) => {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await c`SET LOCAL ROLE service_role`;
    };
  const blocked = async (pa, pb) => {
    for (let n = 0; n < 70; n++) {
      if ((await admin`SELECT ${pa}::integer=ANY(pg_blocking_pids(${pb}))AS waiting`)[0].waiting)
        return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("No actual lock wait observed");
  };
  const spec = () => ({
    planId: plan,
    expectedPlanRevision: revision,
    assignmentId: assignment,
    threadId: thread,
    requestId: randomUUID(),
    selections: [{ kind: "audience", recordId: plan }],
    redactions: [],
    reflection: {
      title: "Fictional marketing race",
      interpretation: "Not demand",
      uncertainty: "Unknown",
      decision: "Test",
      nextAction: "One action",
    },
  });
  const preview = async () => {
    await start(a);
    const r = result(
      await a`SELECT public.preview_guest_marketing_submission(${session},${a.json(spec())})AS result`,
    );
    await a`COMMIT`;
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.data;
  };
  const confirm = (c, p, id = randomUUID()) =>
    c`SELECT public.confirm_guest_marketing_submission(${session},${p.id},${p.hash},${id},true)AS result`;
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES(${owner},'authenticated','authenticated',${`marketing-handoff-${owner}@example.invalid`},'{}','{}')`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional marketing handoff races','class',clock_timestamp()+interval'1 day')`;
      await s`INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(${assignment},${cid},${owner},${owner},'Fictional marketing assignment','published')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${cid},${owner},'Fictional race team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${principal},${cid},${team},${owner},'Fictional race learner')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${cid},${team},${principal},${hash(session)},clock_timestamp()+interval'1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${cid},${team},${principal},'principal_recovery',${hash(recovery)},1,clock_timestamp()+interval'1 day')`;
    });
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.save_guest_marketing_plan(${session},${plan},'principal_private',0,${randomUUID()},false,${a.json(doc)})AS result`,
      ).ok,
      true,
    );
    assert.equal(
      result(
        await a`SELECT public.save_guest_marketing_sharing_choice(${session},${plan},'granted',0,${randomUUID()})AS result`,
      ).ok,
      true,
    );
    await a`COMMIT`;
    const pa = (await a`SELECT pg_backend_pid()AS pid`)[0].pid,
      pb = (await b`SELECT pg_backend_pid()AS pid`)[0].pid;
    let p = await preview();
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.save_guest_marketing_plan(${session},${plan},'principal_private',1,${randomUUID()},false,${a.json({ ...doc, title: "Later draft" })})AS result`,
      ).ok,
      true,
    );
    await start(b);
    let pending = confirm(b, p).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CHANGED");
    await b`COMMIT`;
    revision = 2;
    console.log("Observed plan-save/confirm lock race: stale source revision denied.");
    p = await preview();
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.save_guest_marketing_sharing_choice(${session},${plan},'withdrawn',1,${randomUUID()})AS result`,
      ).ok,
      true,
    );
    await start(b);
    pending = confirm(b, p).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "SHARING_REQUIRED");
    await b`COMMIT`;
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.save_guest_marketing_sharing_choice(${session},${plan},'granted',2,${randomUUID()})AS result`,
      ).ok,
      true,
    );
    await a`COMMIT`;
    console.log("Observed choice-withdrawal/confirm race: no copy/grant persisted.");
    p = await preview();
    const intent = randomUUID();
    await start(a);
    const first = result(await confirm(a, p, intent));
    assert.equal(first.ok, true);
    await start(b);
    pending = confirm(b, p, intent).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.deepEqual(result(await pending), first);
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT count(*)AS n FROM firstten_private.marketing_submission_versions WHERE thread_id=${thread}`
        )[0].n,
      ),
      1,
    );
    console.log("Observed duplicate-confirm race: one payload, grant and exact receipt.");
    p = await preview();
    await a`BEGIN`;
    await a`UPDATE public.classes SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=${cid}`;
    await start(b);
    pending = confirm(b, p).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    await admin`UPDATE public.classes SET archived_at=NULL,revision=revision+1 WHERE id=${cid}`;
    assert.equal(
      (
        await admin`SELECT firstten_private.marketing_publication_allowed(${first.data.id})AS allowed`
      )[0].allowed,
      false,
    );
    console.log("Observed class-close/confirm race; reopening never revives prior copy.");
    p = await preview();
    await start(a);
    const recovered = result(
      await a`SELECT public.exchange_guest_entry('principal_recovery',${recovery},'','',${"9".repeat(64)})AS result`,
    );
    assert.equal(recovered.ok, true);
    await start(b);
    pending = confirm(b, p).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    session = recovered.sessionToken;
    assert.equal(
      (
        await admin`SELECT firstten_private.marketing_publication_allowed(${first.data.id})AS allowed`
      )[0].allowed,
      false,
    );
    console.log(
      "Observed real principal-recovery/confirm race; old session denied, prior disclosure unavailable.",
    );
    p = await preview();
    await admin.unsafe(
      "CREATE FUNCTION public.gmh_delay()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(1.2);RETURN NEW;END$$;CREATE TRIGGER gmh_delay BEFORE INSERT ON firstten_private.marketing_submission_versions FOR EACH ROW EXECUTE FUNCTION public.gmh_delay();",
    );
    await admin`UPDATE firstten_private.class_guest_sessions SET expires_at=clock_timestamp()+interval'600 milliseconds'WHERE token_hash=${hash(session)}`;
    await start(b);
    assert.equal(result(await confirm(b, p)).code, "NOT_FOUND");
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT count(*)AS n FROM firstten_private.marketing_submission_versions WHERE thread_id=${thread}`
        )[0].n,
      ),
      1,
    );
    assert.equal(
      (
        await admin`SELECT consumed_snapshot_id FROM firstten_private.marketing_submission_previews WHERE id=${p.id}`
      )[0].consumed_snapshot_id,
      null,
    );
    console.log(
      "Late-expiry insert barrier: version, grant, consumption and receipt rolled back together.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    await Promise.all([admin.end(), a.end(), b.end()]);
  }
}
