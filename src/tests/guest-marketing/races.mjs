import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
export async function marketingRaces({ database, password }) {
  assert.match(database, /^firstten_guest_marketing_test_[a-f0-9]{10}$/);
  const options = {
    host: "127.0.0.1",
    port: 55322,
    database,
    username: "postgres",
    password,
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  };
  const admin = postgres(options),
    a = postgres(options),
    b = postgres(options),
    owner = randomUUID(),
    cid = randomUUID(),
    team = randomUUID(),
    principal = randomUUID(),
    plan = randomUUID(),
    session = randomBytes(32).toString("hex");
  const hash = (v) => createHash("sha256").update(v).digest("hex"),
    fixture = readFileSync(
      new URL("../../../supabase/tests/guest-marketing.sql", import.meta.url),
      "utf8",
    ),
    match = /VALUES\('full','([^']+)'\)/.exec(fixture);
  assert(match);
  const doc = JSON.parse(match[1]);
  const start = async (c) => {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await c`SET LOCAL ROLE service_role`;
    },
    result = (r) => r[0].result,
    save = (c, rev, mutation, d = doc) =>
      c`SELECT public.save_guest_marketing_plan(${session},${plan},'principal_private',${rev},${mutation},false,${c.json(d)})AS result`;
  const blocked = async (blocker, waiter) => {
    for (let n = 0; n < 60; n++) {
      const [r] =
        await admin`SELECT ${blocker}::integer=ANY(pg_blocking_pids(${waiter}))AS blocked`;
      if (r.blocked) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Competing save never actually blocked");
  };
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES(${owner},'authenticated','authenticated',${`guest-marketing-${owner}@example.invalid`},'{}','{}')`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional marketing races','class',clock_timestamp()+interval '1 day')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${cid},${owner},'Fictional race team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${principal},${cid},${team},${owner},'Fictional race learner')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${cid},${team},${principal},${hash(session)},clock_timestamp()+interval '1 hour')`;
    });
    const [{ pid: pa }] = await a`SELECT pg_backend_pid()AS pid`,
      [{ pid: pb }] = await b`SELECT pg_backend_pid()AS pid`;
    assert.notEqual(pa, pb);
    await start(a);
    await start(b);
    assert.equal(result(await save(a, 0, randomUUID())).ok, true);
    let pending = save(b, 0, randomUUID()).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CONFLICT");
    await b`COMMIT`;
    console.log(
      "Actual create race: one revision, stale competing create conflicted after observed lock wait.",
    );
    const mutation = randomUUID(),
      edited = { ...doc, title: "Fictional revised plan" };
    await start(a);
    await start(b);
    assert.equal(result(await save(a, 1, mutation, edited)).data.savedRevision, 2);
    pending = save(b, 1, mutation, edited).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    const replay = result(await pending);
    assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.savedRevision, 2);
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT revision FROM firstten_private.guest_marketing_plans WHERE id=${plan}`
        )[0].revision,
      ),
      2,
    );
    console.log("Actual exact save race: waiting duplicate replays one acknowledged revision.");
    await a`BEGIN`;
    await a`UPDATE public.classes SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=${cid}`;
    await start(b);
    pending = save(b, 2, randomUUID(), { ...edited, title: "Should not persist" }).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT revision FROM firstten_private.guest_marketing_plans WHERE id=${plan}`
        )[0].revision,
      ),
      2,
    );
    await admin`UPDATE public.classes SET archived_at=NULL,revision=revision+1 WHERE id=${cid}`;
    console.log("Actual class closure race: blocked save denied, prior document unchanged.");
    await a`BEGIN`;
    await a`UPDATE public.class_guest_principals SET revoked_at=clock_timestamp() WHERE id=${principal}`;
    await start(b);
    pending = save(b, 2, randomUUID(), { ...edited, title: "Revoked save" }).execute();
    pending.catch(() => {});
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    await admin`UPDATE public.class_guest_principals SET revoked_at=NULL WHERE id=${principal}`;
    console.log(
      "Actual principal revoke race: save re-resolved authority after observed lock wait.",
    );
    await admin.unsafe(
      "CREATE FUNCTION public.gm_delay()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(1.2);RETURN NEW;END$$;CREATE TRIGGER gm_delay BEFORE UPDATE ON firstten_private.guest_marketing_plans FOR EACH ROW EXECUTE FUNCTION public.gm_delay();",
    );
    await admin`UPDATE firstten_private.class_guest_sessions SET expires_at=clock_timestamp()+interval '600 milliseconds' WHERE token_hash=${hash(session)}`;
    await start(b);
    assert.equal(
      result(await save(b, 2, randomUUID(), { ...edited, title: "Expired midwrite" })).code,
      "NOT_FOUND",
    );
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT revision FROM firstten_private.guest_marketing_plans WHERE id=${plan}`
        )[0].revision,
      ),
      2,
    );
    assert.equal(
      Number(
        (
          await admin`SELECT count(*)AS n FROM firstten_private.guest_marketing_operations WHERE principal_id=${principal}`
        )[0].n,
      ),
      2,
    );
    console.log(
      "Actual deadline crossed inside UPDATE: document, revision and receipt rolled back.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    await Promise.all([admin.end(), a.end(), b.end()]);
  }
}
