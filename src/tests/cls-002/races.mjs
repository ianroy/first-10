import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
export async function submissionRaces({ database, password }) {
  assert.match(database, /^firstten_submission_test_[a-f0-9]{10}$/);
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
    student = randomUUID(),
    cid = randomUUID(),
    aid = randomUUID(),
    pid = randomUUID(),
    tid = randomUUID();
  const actor = async (c, id) => {
    await c`SET LOCAL ROLE authenticated`;
    await c`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: id, role: "authenticated" })},true)`;
  };
  try {
    await admin.begin(async (s) => {
      for (const id of [owner, student])
        await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)VALUES(${id},'authenticated','authenticated',${"submission-race-" + id + "@example.invalid"},'','{}','{}',now(),now())`;
      await s`INSERT INTO public.projects(id,user_id,name,problem)VALUES(${pid},${student},'Fictional reviewed race','Fictional selected source only')`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional submission race','class',clock_timestamp()+interval '1 day')`;
      await s`INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(${aid},${cid},${owner},${owner},'Selected discovery review','published')`;
      await s`INSERT INTO public.class_members(class_id,user_id,created_by,role,display_label)VALUES(${cid},${student},${owner},'student','Race learner')`;
      await s`INSERT INTO public.class_project_links(class_id,user_id,project_id)VALUES(${cid},${student},${pid})`;
    });
    const [pa, pb] = await Promise.all([
      a`SELECT pg_backend_pid()AS pid`,
      b`SELECT pg_backend_pid()AS pid`,
    ]);
    assert.notEqual(pa[0].pid, pb[0].pid);
    await a.begin(async (s) => {
      await actor(s, student);
      const [{ result }] =
        await s`SELECT public.set_processing_consent(${pid},'project',${pid},'unknown','unknown','granted',1,0)AS result`;
      assert(result.ok);
    });
    const spec = {
      source: { type: "account_project", projectId: pid },
      classId: cid,
      assignmentId: aid,
      threadId: tid,
      requestId: randomUUID(),
      audience: "teacher",
      selections: [{ kind: "project", recordId: pid, field: "problem" }],
      redactions: [],
      reflection: {
        title: "Fictional race review",
        interpretation: "Owner-reported",
        uncertainty: "Not verified",
        decision: "Test",
        nextAction: "Interview",
      },
    };
    const preview = await a.begin(async (s) => {
      await actor(s, student);
      const [{ result }] =
        await s`SELECT public.preview_class_submission(${s.json(spec)})AS result`;
      assert(result.ok);
      return result.data;
    });
    for (const c of [a, b]) {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await actor(c, student);
    }
    const requestA = randomUUID(),
      requestB = randomUUID();
    const [{ result: first }] =
      await a`SELECT public.confirm_class_submission(${preview.id},${preview.hash},${requestA})AS result`;
    assert(first.ok);
    const pending =
      b`SELECT public.confirm_class_submission(${preview.id},${preview.hash},${requestB})AS result`.execute();
    pending.catch(() => {});
    let waiting = false;
    for (let n = 0; n < 40; n++) {
      const [row] =
        await admin`SELECT ${pa[0].pid}::integer=ANY(pg_blocking_pids(${pb[0].pid}))AS waiting`;
      if (row.waiting) {
        waiting = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert(waiting, "Second confirmation must actually wait on first connection");
    await a`COMMIT`;
    const [{ result: second }] = await pending;
    await b`COMMIT`;
    assert(second.ok);
    assert.equal(second.data.id, first.data.id);
    const [row] =
      await admin`SELECT (SELECT count(*)FROM firstten_private.class_submission_versions WHERE thread_id=${tid})AS versions,(SELECT count(*)FROM firstten_private.class_submission_grants g JOIN firstten_private.class_submission_versions v ON v.id=g.snapshot_id WHERE v.thread_id=${tid})AS grants`;
    assert.equal(Number(row.versions), 1);
    assert.equal(Number(row.grants), 1);
    // Two independently reviewed alternatives at the same head: only one can advance it.
    const alternatives = [];
    for (let n = 0; n < 2; n++)
      alternatives.push(
        await a.begin(async (s) => {
          await actor(s, student);
          const [{ result }] =
            await s`SELECT public.preview_class_submission(${s.json({ ...spec, requestId: randomUUID() })})AS result`;
          assert(result.ok);
          return result.data;
        }),
      );
    for (const c of [a, b]) {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await actor(c, student);
    }
    const [{ result: advanced }] =
      await a`SELECT public.confirm_class_submission(${alternatives[0].id},${alternatives[0].hash},${randomUUID()})AS result`;
    assert(advanced.ok);
    const contender =
      b`SELECT public.confirm_class_submission(${alternatives[1].id},${alternatives[1].hash},${randomUUID()})AS result`.execute();
    contender.catch(() => {});
    waiting = false;
    for (let n = 0; n < 40; n++) {
      const [row] =
        await admin`SELECT ${pa[0].pid}::integer=ANY(pg_blocking_pids(${pb[0].pid}))AS waiting`;
      if (row.waiting) {
        waiting = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert(waiting);
    await a`COMMIT`;
    const [{ result: conflict }] = await contender;
    await b`COMMIT`;
    assert.deepEqual(conflict, { ok: false, code: "CHANGED" });
    const [{ versions: total }] =
      await admin`SELECT count(*)AS versions FROM firstten_private.class_submission_versions WHERE thread_id=${tid}`;
    assert.equal(Number(total), 2);
    const teacherRead = () =>
      b.begin(async (s) => {
        await actor(s, owner);
        const [{ result }] =
          await s`SELECT public.get_teacher_class_submission(${cid},${first.data.id})AS result`;
        return result;
      });
    assert((await teacherRead()).ok);
    await a.begin(async (s) => {
      await actor(s, student);
      const [{ result }] =
        await s`SELECT public.withdraw_class_submission(${first.data.id},${randomUUID()})AS result`;
      assert(result.ok);
    });
    assert.deepEqual(await teacherRead(), { ok: false, code: "NOT_FOUND" });
    await a.begin(async (s) => {
      await actor(s, student);
      const [{ result }] =
        await s`SELECT public.confirm_class_submission(${preview.id},${preview.hash},${requestA})AS result`;
      assert(result.ok);
      assert.equal(result.data.grantState, "withdrawn");
    });
    const [unchanged] =
      await admin`SELECT count(*)AS count FROM firstten_private.class_submission_grants g JOIN firstten_private.class_submission_versions v ON v.id=g.snapshot_id WHERE v.id=${first.data.id} AND g.state='active'`;
    assert.equal(Number(unchanged.count), 0);
    console.log(
      "Two real connections: competing same-preview confirmation blocked, both received one immutable receipt, exactly one grant per receipt; competing different previews produced one new version/one CHANGED; committed withdrawal denied subsequent teacher read and replay did not regrant.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    await Promise.all([a.end(), b.end(), admin.end()]);
  }
}
