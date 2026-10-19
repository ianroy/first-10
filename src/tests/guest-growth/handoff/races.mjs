import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import postgres from "postgres";
export const observeRaceFailure = (pending) => {
  void pending.catch(() => {});
  return pending;
};
export async function handoffRaces({ database, password }) {
  assert.match(database, /^firstten_growth_handoff_test_[a-f0-9]{12}$/);
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
  const owner = randomUUID(),
    cid = randomUUID(),
    team = randomUUID(),
    principal = randomUUID(),
    assignment = randomUUID(),
    source = randomUUID(),
    thread = randomUUID();
  let session = randomBytes(32).toString("hex");
  const recovery = randomBytes(32).toString("hex"),
    hash = (s) => createHash("sha256").update(s).digest("hex");
  const result = (rows) => rows[0].result;
  const start = async (c, role = "service_role") => {
    await c`BEGIN`;
    await c`SET LOCAL statement_timeout='15s'`;
    if (role === "service_role") await c`SET LOCAL ROLE service_role`;
    else {
      await c`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: owner, role: "authenticated" })},true)`;
      await c`SET LOCAL ROLE authenticated`;
    }
  };
  const rpcSave = async (c, id, kind = "learning", refs = []) => {
    const d = (await admin`SELECT firstten_private.guest_growth_blank(${kind}) AS document`)[0]
      .document;
    return result(
      await c`SELECT public.save_guest_growth_artifact(${session},${id},'principal_private',0,${randomUUID()},false,${c.json({ ...d, ...(kind === "experiment" ? { learningRefs: refs } : {}) })}) AS result`,
    );
  };
  const choice = async (c, id, state, rev) =>
    result(
      await c`SELECT public.save_guest_growth_sharing_choice(${session},${id},${state},${rev},${randomUUID()}) AS result`,
    );
  const spec = (id, tid, kind = "learning") => ({
    artifactId: id,
    expectedRevision: 1,
    assignmentId: assignment,
    threadId: tid,
    requestId: randomUUID(),
    selections: [{ kind, section: kind === "learning" ? "observations" : "plan" }],
    redactions: [],
    reflection: {
      title: "Fictional handoff race",
      interpretation: "Authored, not independently observed",
      uncertainty: "No verified customer proof",
      decision: "Revise",
      nextAction: "One permitted test",
    },
  });
  const preview = async (c, s) =>
    result(
      await c`SELECT public.preview_guest_growth_submission(${session},${c.json(s)}) AS result`,
    );
  const confirm = (c, p, request = randomUUID()) =>
    c`SELECT public.confirm_guest_growth_submission(${session},${p.data.id},${p.data.hash},${request},true) AS result`;
  const pid = async (c) => (await c`SELECT pg_backend_pid() AS pid`)[0].pid;
  const waits = [];
  async function blocked(pa, pb) {
    for (let n = 0; n < 80; n++) {
      if ((await admin`SELECT ${pa}::integer=ANY(pg_blocking_pids(${pb})) AS waiting`)[0].waiting) {
        waits.push(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("No genuine overlapping handoff lock wait");
  }
  let pending,
    originalView,
    wrapped = false;
  const restore = async () => {
    if (wrapped) {
      await admin.unsafe(
        `CREATE OR REPLACE FUNCTION firstten_private.growth_submission_view(v firstten_private.growth_submission_versions,include_payload boolean DEFAULT true)RETURNS jsonb LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$${originalView}$$;`,
      );
      wrapped = false;
    }
  };
  const delay = async () => {
    await admin.unsafe(
      `CREATE OR REPLACE FUNCTION firstten_private.growth_submission_view(v firstten_private.growth_submission_versions,include_payload boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$BEGIN PERFORM nextval('firstten_private.growth_handoff_delay_seq');PERFORM pg_sleep(2.4);RETURN (${originalView.trim().replace(/;$/, "")});END $$;`,
    );
    wrapped = true;
  };
  const setDeadline = async () => {
    await admin`UPDATE public.classes SET access_expires_at=clock_timestamp()+interval'2 seconds',revision=revision+1 WHERE id=${cid}`;
  };
  const witness = async () =>
    (await admin`SELECT last_value::integer AS n FROM firstten_private.growth_handoff_delay_seq`)[0]
      .n;
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES(${owner},'authenticated','authenticated',${`growth-handoff-${owner}@example.invalid`},'{}','{}')`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional growth handoff race','class',clock_timestamp()+interval'1 day')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${cid},${owner},'Fictional handoff team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${principal},${cid},${team},${owner},'Fictional handoff author')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${cid},${team},${principal},${hash(session)},clock_timestamp()+interval'1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${cid},${team},${principal},'principal_recovery',${hash(recovery)},1,clock_timestamp()+interval'1 day')`;
      await s`INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(${assignment},${cid},${owner},${owner},'Fictional reviewed handoff','published')`;
    });
    await start(a);
    assert.equal((await rpcSave(a, source)).ok, true);
    await a`COMMIT`;
    await start(a);
    assert.equal((await choice(a, source, "granted", 0)).ok, true);
    const p = await preview(a, spec(source, thread));
    assert.equal(p.ok, true);
    await a`COMMIT`;
    const pa = await pid(a),
      pb = await pid(b),
      mutation = randomUUID();
    await start(a);
    const first = result(await confirm(a, p, mutation));
    assert.equal(first.ok, true);
    await start(b);
    pending = observeRaceFailure(confirm(b, p, mutation).execute());
    await blocked(pa, pb);
    await a`COMMIT`;
    const replay = result(await pending);
    pending = null;
    assert.equal(replay.data.id, first.data.id);
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::integer AS n FROM firstten_private.growth_submission_versions WHERE thread_id=${thread}`
      )[0].n,
      1,
    );
    // Choice transition holds the class fence before stale exact confirmation resolves.
    await start(a);
    const stale = await preview(a, spec(source, thread));
    assert.equal(stale.ok, true);
    await a`COMMIT`;
    await start(a);
    assert.equal((await choice(a, source, "withdrawn", 1)).ok, true);
    await start(b);
    pending = observeRaceFailure(confirm(b, stale).execute());
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "SHARING_REQUIRED");
    pending = null;
    await b`COMMIT`;
    await start(a);
    assert.equal((await choice(a, source, "granted", 2)).ok, true);
    const next = await preview(a, spec(source, thread));
    assert.equal(next.ok, true);
    const second = result(await confirm(a, next));
    assert.equal(second.ok, true);
    await a`COMMIT`;
    // Teacher waits behind recipient withdrawal; never receives the stored payload.
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.withdraw_guest_growth_submission(${session},${second.data.id},${randomUUID()}) AS result`,
      ).ok,
      true,
    );
    await start(b, "authenticated");
    pending = observeRaceFailure(
      b`SELECT public.get_teacher_guest_growth_submission(${cid},${second.data.id}) AS result`.execute(),
    );
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    pending = null;
    await b`COMMIT`;
    // Actual retained source deletion cannot leave an apparently eligible dependent preview.
    const child = randomUUID(),
      childThread = randomUUID();
    await start(a);
    assert.equal(
      (
        await rpcSave(a, child, "experiment", [
          { kind: "learning", artifactId: source, revision: 1 },
        ])
      ).ok,
      true,
    );
    assert.equal((await choice(a, child, "granted", 0)).ok, true);
    const dep = await preview(a, spec(child, childThread, "experiment"));
    assert.equal(dep.ok, true);
    await a`COMMIT`;
    await a`BEGIN`;
    await a`SELECT id FROM public.classes WHERE id=${cid} FOR UPDATE`;
    await a`DELETE FROM firstten_private.guest_growth_artifacts WHERE id=${source}`;
    await start(b);
    pending = observeRaceFailure(confirm(b, dep).execute());
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "SHARING_REQUIRED");
    pending = null;
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::integer AS n FROM firstten_private.guest_growth_versions WHERE artifact_id=${child}`
      )[0].n,
      1,
    );
    const finalSource = randomUUID(),
      finalThread = randomUUID();
    await start(a);
    assert.equal((await rpcSave(a, finalSource)).ok, true);
    assert.equal((await choice(a, finalSource, "granted", 0)).ok, true);
    const closing = await preview(a, spec(finalSource, finalThread));
    assert.equal(closing.ok, true);
    await a`COMMIT`;
    await a`BEGIN`;
    await a`UPDATE public.classes SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=${cid}`;
    await start(b);
    pending = observeRaceFailure(confirm(b, closing).execute());
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    pending = null;
    await b`COMMIT`;
    await admin`UPDATE public.classes SET archived_at=NULL,revision=revision+1 WHERE id=${cid}`;
    await start(a);
    const recovering = await preview(a, spec(finalSource, finalThread));
    assert.equal(recovering.ok, true);
    await a`COMMIT`;
    await a`BEGIN`;
    await a`SELECT id FROM public.classes WHERE id=${cid} FOR UPDATE`;
    await start(b);
    pending = observeRaceFailure(confirm(b, recovering).execute());
    await blocked(pa, pb);
    const recovered = result(
      await a`SELECT public.exchange_guest_entry('principal_recovery',${recovery},'','',${hash("fictional handoff race client")}) AS result`,
    );
    assert.equal(recovered.ok, true);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    pending = null;
    await b`COMMIT`;
    session = recovered.sessionToken;
    assert.equal(waits.length, 6);
    // WITNESSED late result-construction expiry. No source/schema policy is changed.
    originalView = (
      await admin`SELECT prosrc FROM pg_proc WHERE oid='firstten_private.growth_submission_view(firstten_private.growth_submission_versions,boolean)'::regprocedure`
    )[0].prosrc;
    await admin`CREATE SEQUENCE firstten_private.growth_handoff_delay_seq MINVALUE 0 START 0`;
    await admin`SELECT nextval('firstten_private.growth_handoff_delay_seq')`; // Prime before recording a baseline.
    // Confirm writes must roll back when the class deadline passes while producing the result.
    await setDeadline();
    await start(a);
    const timed = await preview(a, spec(finalSource, finalThread));
    assert.equal(timed.ok, true);
    await a`COMMIT`;
    await delay();
    const before = await witness();
    await start(a);
    const failed = result(await confirm(a, timed));
    assert.equal(failed.code, "NOT_FOUND");
    await a`COMMIT`;
    assert((await witness()) > (await before));
    assert.equal(
      (
        await admin`SELECT count(*)::integer AS n FROM firstten_private.growth_submission_versions WHERE thread_id=${finalThread}`
      )[0].n,
      0,
    );
    await restore();
    // Build an actually eligible teacher copy before delaying its teacher get response.
    await setDeadline();
    await start(a);
    const validPreview = await preview(a, spec(finalSource, finalThread));
    assert.equal(validPreview.ok, true);
    const valid = result(await confirm(a, validPreview));
    assert.equal(valid.ok, true);
    await a`COMMIT`;
    await delay();
    const getBefore = await witness();
    await start(a, "authenticated");
    assert.equal(
      result(
        await a`SELECT public.get_teacher_guest_growth_submission(${cid},${valid.data.id}) AS result`,
      ).code,
      "NOT_FOUND",
    );
    await a`COMMIT`;
    assert((await witness()) > getBefore);
    await restore();
    // A fresh copy, not an already ineligible one, proves final teacher-list clock checks.
    await setDeadline();
    await start(a);
    const lp = await preview(a, spec(finalSource, finalThread));
    assert.equal(lp.ok, true);
    const lc = result(await confirm(a, lp));
    assert.equal(lc.ok, true);
    await a`COMMIT`;
    await delay();
    const listBefore = await witness();
    await start(a, "authenticated");
    assert.equal(
      result(await a`SELECT public.list_teacher_guest_growth_submissions(${cid}) AS result`).code,
      "NOT_FOUND",
    );
    await a`COMMIT`;
    assert((await witness()) > listBefore);
    await restore();
    // Private author reads and withdrawal result construction also obey the final deadline.
    await setDeadline();
    await delay();
    const authorBefore = await witness();
    await start(a);
    assert.equal(
      result(await a`SELECT public.get_guest_growth_submission(${session},${lc.data.id}) AS result`)
        .code,
      "NOT_FOUND",
    );
    await a`COMMIT`;
    assert((await witness()) > authorBefore);
    await restore();
    await setDeadline();
    await delay();
    const withdrawBefore = await witness();
    await start(a);
    assert.equal(
      result(
        await a`SELECT public.withdraw_guest_growth_submission(${session},${lc.data.id},${randomUUID()}) AS result`,
      ).code,
      "NOT_FOUND",
    );
    await a`COMMIT`;
    assert((await witness()) > withdrawBefore);
    await restore();
    assert.equal(
      (
        await admin`SELECT state FROM firstten_private.growth_submission_grants WHERE snapshot_id=${lc.data.id}`
      )[0].state,
      "active",
    );
    return {
      actualBlockedOverlaps: waits.length,
      stableCommitReplay: true,
      sourceDeletionDenied: true,
      lateResultExpiryCases: 5,
      witnessedRollback: true,
    };
  } finally {
    await a`ROLLBACK`.catch(() => {});
    await b`ROLLBACK`.catch(() => {});
    if (pending) await pending.catch(() => {});
    await admin`ROLLBACK`.catch(() => {});
    await restore().catch(() => {});
    await admin`DROP SEQUENCE IF EXISTS firstten_private.growth_handoff_delay_seq`.catch(() => {});
    // Best effort only: old24's parent audit incompatibility is a separate retention limitation.
    await admin`DELETE FROM auth.users WHERE id=${owner}`.catch(() => {});
    await Promise.all([a.end({ timeout: 2 }), b.end({ timeout: 2 }), admin.end({ timeout: 2 })]);
  }
}
