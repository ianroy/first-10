import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
export async function learningRaces({ database, password }) {
  assert.match(database, /^firstten_guest_learning_test_[a-f0-9]{10}$/);
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
    b = postgres(options);
  const owner = randomUUID(),
    cid = randomUUID(),
    team = randomUUID(),
    principal = randomUUID(),
    buddy = randomUUID(),
    assignment = randomUUID(),
    activity = randomUUID(),
    buddyActivity = randomUUID();
  const session = randomBytes(32).toString("hex"),
    buddySession = randomBytes(32).toString("hex"),
    recovery = randomBytes(32).toString("hex");
  const hash = (v) => createHash("sha256").update(v).digest("hex");
  const fixture = readFileSync(
    new URL("../../../supabase/tests/cls-008.sql", import.meta.url),
    "utf8",
  );
  const match = /VALUES\('full','([^']+)'\),\('empty','([^']+)'\)/.exec(fixture);
  assert(match);
  let doc = JSON.parse(match[1]);
  const json = (v) => JSON.stringify(v);
  const start = async (c, role = "service_role") => {
    await c`BEGIN`;
    await c`SET LOCAL statement_timeout='15s'`;
    await c.unsafe("SET LOCAL ROLE " + role);
  };
  const result = (rows) => rows[0].result;
  const waitBlocked = async (blocker, waiter) => {
    let found = false;
    for (let n = 0; n < 50; n++) {
      const [r] =
        await admin`SELECT ${blocker}::integer=ANY(pg_blocking_pids(${waiter}))AS blocked`;
      if (r.blocked) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert(found, "The competing request must actually wait on the first connection");
  };
  const save = (c, token, id, rev, mutation, document) =>
    c`SELECT public.save_guest_learning_activity(${token},${id},'principal_private',${rev},${mutation},false,${c.json(document)})AS result`;
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)VALUES(${owner},'authenticated','authenticated',${"guest-learning-race-" + owner + "@example.invalid"},'','{}','{}',now(),now())`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional guest learning concurrency','class',clock_timestamp()+interval '1 day')`;
      await s`INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(${assignment},${cid},${owner},${owner},'Fictional reviewed assignment','published')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${cid},${owner},'Fictional race team')`;
      for (const pid of [principal, buddy])
        await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${pid},${cid},${team},${owner},'Fictional race learner')`;
      for (const [pid, token] of [
        [principal, session],
        [buddy, buddySession],
      ])
        await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${cid},${team},${pid},${hash(token)},clock_timestamp()+interval '1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${cid},${team},${principal},'principal_recovery',${hash(recovery)},1,clock_timestamp()+interval '1 day')`;
    });
    const [{ pid: pa }] = await a`SELECT pg_backend_pid()AS pid`;
    const [{ pid: pb }] = await b`SELECT pg_backend_pid()AS pid`;
    assert.notEqual(pa, pb);
    await start(a);
    await start(b);
    assert.equal(result(await save(a, session, activity, 0, randomUUID(), doc)).ok, true);
    let pending = save(b, session, activity, 0, randomUUID(), doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CONFLICT");
    await b`COMMIT`;
    console.log(
      "Actual two-connection guest create CAS: competitor blocked, one save won, stale request conflicted.",
    );
    doc = structuredClone(doc);
    doc.discovery.frame.solution = "Fictional revised proposed test";
    const mutation = randomUUID();
    await start(a);
    await start(b);
    assert.equal(result(await save(a, session, activity, 1, mutation, doc)).data.savedRevision, 2);
    pending = save(b, session, activity, 1, mutation, doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    const duplicate = result(await pending);
    assert.equal(duplicate.data.replayed, true);
    assert.equal(duplicate.data.savedRevision, 2);
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT revision FROM firstten_private.guest_learning_activities WHERE id=${activity}`
        )[0].revision,
      ),
      2,
    );
    console.log(
      "Actual duplicate guest save: competitor waited and replayed one acknowledged revision; no duplicate write.",
    );
    const spec = {
      activityId: activity,
      assignmentId: assignment,
      threadId: randomUUID(),
      requestId: randomUUID(),
      audience: "teacher",
      selections: [{ kind: "discovery", recordId: activity, field: "problem" }],
      redactions: [],
      reflection: {
        title: "Fictional race review",
        interpretation: "An unverified possibility",
        uncertainty: "No actual interview",
        decision: "Test",
        nextAction: "Ask about an actual event",
      },
    };
    await start(a);
    const preview = result(
      await a`SELECT public.preview_guest_learning_submission(${session},${a.json(spec)})AS result`,
    );
    assert.equal(preview.ok, true);
    await a`COMMIT`;
    const changed = structuredClone(doc);
    changed.discovery.frame.problem = "A different fictional source";
    await start(a);
    assert.equal(result(await save(a, session, activity, 2, randomUUID(), changed)).ok, true);
    await a`COMMIT`;
    await start(a);
    const stale = result(
      await a`SELECT public.confirm_guest_learning_submission(${session},${preview.data.id},${preview.data.hash},${randomUUID()})AS result`,
    );
    assert.equal(stale.code, "CHANGED");
    await a`COMMIT`;
    doc = changed;
    console.log(
      "Actual selected-source mutation invalidated the reviewed preview; no snapshot was published.",
    );
    spec.requestId = randomUUID();
    await start(a);
    const fresh = result(
      await a`SELECT public.preview_guest_learning_submission(${session},${a.json(spec)})AS result`,
    );
    assert.equal(fresh.ok, true);
    await a`COMMIT`;
    const confirmId = randomUUID();
    await start(a);
    await start(b);
    const first = result(
      await a`SELECT public.confirm_guest_learning_submission(${session},${fresh.data.id},${fresh.data.hash},${confirmId})AS result`,
    );
    assert.equal(first.ok, true);
    pending =
      b`SELECT public.confirm_guest_learning_submission(${session},${fresh.data.id},${fresh.data.hash},${confirmId})AS result`.execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    assert.deepEqual(result(await pending), first);
    await b`COMMIT`;
    const [count] =
      await admin`SELECT count(*)AS n FROM firstten_private.class_submission_versions WHERE thread_id=${spec.threadId}`;
    assert.equal(Number(count.n), 1);
    console.log(
      "Actual concurrent guest confirmation: one immutable version/grant, stable duplicate receipt.",
    );
    // A teacher close wins the class lock before a competing save/export acquisition.
    await a`BEGIN`;
    await a`UPDATE public.classes SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=${cid}`;
    await start(b);
    pending = save(b, session, activity, 3, randomUUID(), doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    assert.equal(
      Number(
        (
          await admin`SELECT revision FROM firstten_private.guest_learning_activities WHERE id=${activity}`
        )[0].revision,
      ),
      3,
    );
    await start(b);
    assert.equal(
      result(await b`SELECT public.load_guest_learning_activity(${session},${activity})AS result`)
        .code,
      "NOT_FOUND",
    );
    await b`COMMIT`;
    await admin`UPDATE public.classes SET archived_at=NULL,revision=revision+1 WHERE id=${cid}`;
    assert.equal(
      (
        await admin`SELECT firstten_private.guest_publication_allowed(${first.data.id})AS allowed`
      )[0].allowed,
      false,
    );
    console.log(
      "Actual class-close versus save: blocked save denied without revision change; export acquisition denied, reopen did not revive prior disclosure.",
    );
    await start(a);
    assert.equal(result(await save(a, buddySession, buddyActivity, 0, randomUUID(), doc)).ok, true);
    await a`COMMIT`;
    await start(a, "authenticated");
    await a`SELECT set_config('request.jwt.claims',${json({ sub: owner, role: "authenticated" })},true)`;
    assert.equal(
      result(await a`SELECT public.revoke_guest_scope(${cid},${team},${buddy})AS result`).ok,
      true,
    );
    await start(b);
    pending = save(b, buddySession, buddyActivity, 1, randomUUID(), doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    console.log(
      "Actual principal revoke versus save: pending private edit denied after revocation committed.",
    );
    await start(a);
    const recovered = result(
      await a`SELECT public.exchange_guest_entry('principal_recovery',${recovery},'','',${"e".repeat(64)})AS result`,
    );
    assert.equal(recovered.ok, true);
    await start(b);
    pending = save(b, session, activity, 3, randomUUID(), doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    await start(b);
    assert.equal(
      result(
        await b`SELECT public.load_guest_learning_activity(${recovered.sessionToken},${activity})AS result`,
      ).ok,
      true,
    );
    await b`COMMIT`;
    console.log(
      "Actual recovery versus save: old session waited then failed; rotated private identity reloaded the same saved activity.",
    );
    await admin`UPDATE public.classes SET access_expires_at=clock_timestamp()+interval '600 milliseconds',revision=revision+1 WHERE id=${cid}`;
    await a`BEGIN`;
    await a`SELECT id FROM public.classes WHERE id=${cid}FOR UPDATE`;
    await start(b);
    pending = save(b, recovered.sessionToken, activity, 3, randomUUID(), doc).execute();
    pending.catch(() => {});
    await waitBlocked(pa, pb);
    let expired = false;
    for (let n = 0; n < 60; n++) {
      const [row] =
        await admin`SELECT access_expires_at<=clock_timestamp()AS expired FROM public.classes WHERE id=${cid}`;
      if (row.expired) {
        expired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert(expired);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    await b`COMMIT`;
    console.log(
      "Actual deadline elapsed during lock wait: guest save rechecked time and failed without writing.",
    );
  } finally {
    for (const c of [a, b])
      try {
        await c`ROLLBACK`;
      } catch {}
    await Promise.all([admin.end(), a.end(), b.end()]);
  }
}
