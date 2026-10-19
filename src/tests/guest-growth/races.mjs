import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
export async function growthRaces({ database, password }) {
  assert.match(database, /^firstten_growth_test_[a-f0-9]{12}$/);
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
    b = postgres(opts),
    owner = randomUUID(),
    cid = randomUUID(),
    team = randomUUID(),
    principal = randomUUID(),
    artifact = randomUUID();
  let session = randomBytes(32).toString("hex");
  const recovery = randomBytes(32).toString("hex"),
    hash = (s) => createHash("sha256").update(s).digest("hex");
  const text = readFileSync(
      new URL("../../../supabase/tests/cls-009.sql", import.meta.url),
      "utf8",
    ),
    doc = JSON.parse(/gg_docs VALUES\('blank_learning',true,'([^']+)'\)/.exec(text)[1]);
  const result = (r) => r[0].result,
    start = async (c) => {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await c`SET LOCAL ROLE service_role`;
    };
  const save = (c, id, expected, mutation, d = doc) =>
    c`SELECT public.save_guest_growth_artifact(${session},${id},'principal_private',${expected},${mutation},false,${c.json(d)})AS result`;
  const waits = [];
  const blocked = async (pa, pb) => {
    for (let n = 0; n < 80; n++) {
      if ((await admin`SELECT ${pa}::integer=ANY(pg_blocking_pids(${pb}))AS waiting`)[0].waiting) {
        waits.push(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("No true overlapping lock wait observed");
  };
  const pid = async (c) => (await c`SELECT pg_backend_pid()AS pid`)[0].pid;
  const canonical = (v) =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
            .join(",")}}`;
  const exportSpec = async (id, revision) => {
    const row = (
      await admin`SELECT firstten_private.guest_growth_authority(p)authority,firstten_private.guest_growth_hash(firstten_private.guest_growth_record(x,${revision}))record_hash,x.kind,x.audience,x.author_principal_id FROM public.class_guest_principals p CROSS JOIN firstten_private.guest_growth_artifacts x WHERE p.id=${principal}AND x.id=${id}`
    )[0];
    const v = row.authority,
      context = {
        classId: v.classId,
        teamId: v.teamId,
        principalId: v.principalId,
        accessExpiresAt: v.accessExpiresAt,
        className: v.className,
        teamAlias: v.teamAlias,
        principalAlias: v.principalAlias,
      };
    return {
      scope: {
        classId: v.classId,
        teamId: v.teamId,
        principalId: v.principalId,
        accessExpiresAt: v.accessExpiresAt,
        contextHash: hash(canonical(context)),
      },
      sources: [
        {
          state: "saved",
          artifactId: id,
          revision,
          kind: row.kind,
          audience: row.audience,
          authorPrincipalId: row.author_principal_id,
          recordHash: row.record_hash,
        },
      ],
    };
  };
  let pending;
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES(${owner},'authenticated','authenticated',${`growth-${owner}@example.invalid`},'{}','{}')`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${cid},${owner},'Fictional growth race','class',clock_timestamp()+interval'1 day')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${cid},${owner},'Fictional race team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${principal},${cid},${team},${owner},'Fictional race learner')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${cid},${team},${principal},${hash(session)},clock_timestamp()+interval'1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${cid},${team},${principal},'principal_recovery',${hash(recovery)},1,clock_timestamp()+interval'1 day')`;
    });
    const pa = await pid(a),
      pb = await pid(b),
      mutation = randomUUID();
    await start(a);
    assert.equal(result(await save(a, artifact, 0, mutation)).ok, true);
    await start(b);
    pending = save(b, artifact, 0, mutation).execute();
    await blocked(pa, pb);
    await a`COMMIT`;
    const replay = result(await pending);
    pending = null;
    assert.equal(replay.ok, true);
    assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.savedRevision, 1);
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_versions WHERE artifact_id=${artifact}`
      )[0].n,
      1,
    );
    await start(a);
    assert.equal(
      result(await save(a, artifact, 1, randomUUID(), { ...doc, title: "First concurrent edit" }))
        .ok,
      true,
    );
    await start(b);
    pending = save(b, artifact, 1, randomUUID(), {
      ...doc,
      title: "Stale concurrent edit",
    }).execute();
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CONFLICT");
    pending = null;
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT document->>'title' title FROM firstten_private.guest_growth_versions WHERE artifact_id=${artifact}AND revision=2`
      )[0].title,
      "First concurrent edit",
    );
    // Recovery holds the same class fence while a previously issued capability waits.
    await a`BEGIN`;
    await a`SELECT id FROM public.classes WHERE id=${cid}FOR UPDATE`;
    await start(b);
    const deniedMutation = randomUUID();
    pending = save(b, artifact, 2, deniedMutation).execute();
    await blocked(pa, pb);
    const recovered = result(
      await a`SELECT public.exchange_guest_entry('principal_recovery',${recovery},'','',${"e".repeat(64)})AS result`,
    );
    assert.equal(recovered.ok, true);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    pending = null;
    await b`COMMIT`;
    session = recovered.sessionToken;
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_operations WHERE request_id=${deniedMutation}`
      )[0].n,
      0,
    );
    // Delete an actual retained source while bulk authorization waits for that source row.
    const source = randomUUID(),
      parent = randomUUID();
    const experiment = JSON.parse(
      /gg_docs VALUES\('blank_experiment',true,'([^']+)'\)/.exec(text)[1],
    );
    await start(a);
    assert.equal(result(await save(a, source, 0, randomUUID())).ok, true);
    await a`COMMIT`;
    await start(a);
    assert.equal(
      result(
        await save(a, parent, 0, randomUUID(), {
          ...experiment,
          learningRefs: [{ kind: "learning", artifactId: source, revision: 1 }],
        }),
      ).ok,
      true,
    );
    await a`COMMIT`;
    const dependencySpec = await exportSpec(parent, 1);
    await a`BEGIN`;
    await a`DELETE FROM firstten_private.guest_growth_artifacts WHERE id=${source}`;
    await start(b);
    pending =
      b`SELECT public.authorize_guest_growth_export(${session},${b.json(dependencySpec.scope)},${b.json(dependencySpec.sources)})AS result`.execute();
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CHANGED");
    pending = null;
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_versions WHERE artifact_id=${parent}`
      )[0].n,
      1,
    );
    await admin`DELETE FROM firstten_private.guest_growth_artifacts WHERE id=${parent}`;
    //63 artifacts leave exactly one slot; two overlapping creates cannot cross64.
    await admin.begin(async (s) => {
      for (let i = 0; i < 62; i++) {
        const id = randomUUID();
        await s`INSERT INTO firstten_private.guest_growth_artifacts(id,class_id,team_id,author_principal_id,kind,audience,current_revision)VALUES(${id},${cid},${team},${principal},'learning','principal_private',1)`;
        await s`INSERT INTO firstten_private.guest_growth_versions(artifact_id,revision,document)VALUES(${id},1,${s.json(doc)})`;
      }
    });
    await start(a);
    assert.equal(result(await save(a, randomUUID(), 0, randomUUID())).ok, true);
    await start(b);
    pending = save(b, randomUUID(), 0, randomUUID()).execute();
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "CAPACITY");
    pending = null;
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_artifacts WHERE class_id=${cid}`
      )[0].n,
      64,
    );
    // An actual clock deadline passes during version insertion. Every write/receipt rolls back.
    await admin.unsafe(
      `CREATE SEQUENCE firstten_private.growth_test_delay_seq;CREATE FUNCTION firstten_private.growth_test_delay()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.artifact_id='${artifact}'::uuid THEN PERFORM nextval('firstten_private.growth_test_delay_seq');PERFORM pg_sleep(1.4);END IF;RETURN NEW;END $$;CREATE TRIGGER growth_test_delay BEFORE INSERT ON firstten_private.guest_growth_versions FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_test_delay()`,
    );
    await admin`UPDATE public.classes SET access_expires_at=clock_timestamp()+interval'1 second',revision=revision+1 WHERE id=${cid}`;
    const expiryMutation = randomUUID();
    await start(a);
    assert.equal(result(await save(a, artifact, 2, expiryMutation)).code, "NOT_FOUND");
    await a`COMMIT`;
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_versions WHERE artifact_id=${artifact}`
      )[0].n,
      2,
    );
    assert.equal(
      (
        await admin`SELECT count(*)::int n FROM firstten_private.guest_growth_operations WHERE request_id=${expiryMutation}`
      )[0].n,
      0,
    );
    assert.equal(
      (await admin`SELECT is_called FROM firstten_private.growth_test_delay_seq`)[0].is_called,
      true,
      "Late expiry must happen after attempted version insertion",
    );
    await admin.unsafe(
      "DROP TRIGGER growth_test_delay ON firstten_private.guest_growth_versions;DROP FUNCTION firstten_private.growth_test_delay();DROP SEQUENCE firstten_private.growth_test_delay_seq",
    );
    await admin`UPDATE public.classes SET access_expires_at=clock_timestamp()+interval'1 day',revision=revision+1 WHERE id=${cid}`;
    // Class closure commits before the already waiting content request can resolve authority.
    const closeSpec = await exportSpec(artifact, 2);
    await a`BEGIN`;
    await a`UPDATE public.classes SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=${cid}`;
    await start(b);
    pending =
      b`SELECT public.authorize_guest_growth_export(${session},${b.json(closeSpec.scope)},${b.json(closeSpec.sources)})AS result`.execute();
    await blocked(pa, pb);
    await a`COMMIT`;
    assert.equal(result(await pending).code, "NOT_FOUND");
    pending = null;
    await b`COMMIT`;
    assert.equal(
      (
        await admin`SELECT current_revision FROM firstten_private.guest_growth_artifacts WHERE id=${artifact}`
      )[0].current_revision,
      2,
    );
    assert.equal(waits.length, 6);
    return {
      actualBlockedOverlaps: waits.length,
      cases: [
        "stable retry",
        "stale CAS",
        "recovery fence",
        "artifact cap",
        "source deletion versus bulk export",
        "late expiry rollback",
        "class closure",
      ],
    };
  } finally {
    await a`ROLLBACK`.catch(() => {});
    await b`ROLLBACK`.catch(() => {});
    if (pending) await pending.catch(() => {});
    await admin
      .unsafe(
        "DROP TRIGGER IF EXISTS growth_test_delay ON firstten_private.guest_growth_versions;DROP FUNCTION IF EXISTS firstten_private.growth_test_delay();DROP SEQUENCE IF EXISTS firstten_private.growth_test_delay_seq",
      )
      .catch(() => {});
    await admin`DELETE FROM auth.users WHERE id=${owner}`.catch(() => {});
    await Promise.all([a.end({ timeout: 2 }), b.end({ timeout: 2 }), admin.end({ timeout: 2 })]);
  }
}
