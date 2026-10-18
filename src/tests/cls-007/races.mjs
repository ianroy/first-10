import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import postgres from "postgres";
export async function guestRaces({ database, password }) {
  assert.match(database, /^firstten_guest_entry_test_[a-f0-9]{10}$/);
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
    classId = randomUUID(),
    team = randomUUID(),
    principal = randomUUID();
  const session = randomBytes(32).toString("hex"),
    recovery = randomBytes(32).toString("hex");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  try {
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)VALUES(${owner},'authenticated','authenticated',${"guest-race-" + owner + "@example.invalid"},'','{}','{}',now(),now())`;
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${classId},${owner},'Fictional guest history race','hackathon',clock_timestamp()+interval '1 day')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${team},${classId},${owner},'Race team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${principal},${classId},${team},${owner},'Race learner')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${classId},${team},${principal},${hash(session)},clock_timestamp()+interval '1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${classId},${team},${principal},'principal_recovery',${hash(recovery)},1,clock_timestamp()+interval '1 day')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,kind,token_hash,max_uses,expires_at)SELECT ${classId},${team},'team_invite',encode(sha256(convert_to('race-history-'||n,'UTF8')),'hex'),1,clock_timestamp()+interval '1 day' FROM generate_series(1,254)n`;
    });
    const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`;
    const [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
    assert.notEqual(pidA, pidB);
    for (const c of [a, b]) {
      await c`BEGIN`;
      await c`SET LOCAL statement_timeout='15s'`;
      await c`SET LOCAL ROLE service_role`;
    }
    const [{ result: first }] =
      await a`SELECT public.manage_guest_session(${session},'rotate_principal_recovery') AS result`;
    assert.equal(first.ok, true);
    const pending =
      b`SELECT public.manage_guest_session(${session},'rotate_principal_recovery') AS result`.execute();
    pending.catch(() => {});
    let waiting = false;
    for (let n = 0; n < 30; n++) {
      const [row] = await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
      if (row.waiting) {
        waiting = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert(waiting, "Competing rotation must actually wait for the class lock");
    await a`COMMIT`;
    const [{ result: second }] = await pending;
    await b`COMMIT`;
    assert.deepEqual(second, { ok: false, code: "RATE_LIMITED" });
    const [saved] =
      await admin`SELECT (SELECT count(*) FROM firstten_private.guest_capabilities WHERE team_id=${team}) AS caps,
   (SELECT count(*) FROM firstten_private.class_guest_sessions WHERE team_id=${team}) AS sessions,
   (SELECT count(*) FROM firstten_private.guest_capabilities WHERE token_hash=${hash(first.token)} AND revoked_at IS NULL AND uses=0)AS valid`;
    assert.equal(Number(saved.caps), 256);
    assert.equal(Number(saved.sessions), 1);
    assert.equal(Number(saved.valid), 1);
    console.log(
      "Two real connections at cap255: one rotation succeeded, competing rotation waited then denied; cap256 and new valid private credential preserved.",
    );
    // A second empty class tests expiry while manage waits for a real class lock.
    const expiryClass = randomUUID(),
      expiryTeam = randomUUID(),
      expiryPrincipal = randomUUID(),
      expirySession = randomBytes(32).toString("hex"),
      expiryRecovery = randomBytes(32).toString("hex");
    await admin.begin(async (s) => {
      await s`INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(${expiryClass},${owner},'Fictional crossed expiry','class',clock_timestamp()+interval '4 seconds')`;
      await s`INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(${expiryTeam},${expiryClass},${owner},'Expiry team')`;
      await s`INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(${expiryPrincipal},${expiryClass},${expiryTeam},${owner},'Expiry learner')`;
      await s`INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)VALUES(${expiryClass},${expiryTeam},${expiryPrincipal},${hash(expirySession)},clock_timestamp()+interval '1 hour')`;
      await s`INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at)VALUES(${expiryClass},${expiryTeam},${expiryPrincipal},'principal_recovery',${hash(expiryRecovery)},1,clock_timestamp()+interval '1 day')`;
    });
    await a`BEGIN`;
    await a`SELECT id FROM public.classes WHERE id=${expiryClass} FOR UPDATE`;
    await b`BEGIN`;
    await b`SET LOCAL ROLE service_role`;
    await b`SET LOCAL statement_timeout='15s'`;
    const blocked =
      b`SELECT public.manage_guest_session(${expirySession},'rotate_principal_recovery')AS result`.execute();
    blocked.catch(() => {});
    waiting = false;
    for (let n = 0; n < 30; n++) {
      const [row] = await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
      if (row.waiting) {
        waiting = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert(waiting);
    const [{ valid }] =
      await admin`SELECT access_expires_at>clock_timestamp() AS valid FROM public.classes WHERE id=${expiryClass}`;
    assert(valid);
    let expired = false;
    for (let n = 0; n < 120; n++) {
      const [row] =
        await admin`SELECT access_expires_at<=clock_timestamp()AS expired FROM public.classes WHERE id=${expiryClass}`;
      if (row.expired) {
        expired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert(expired);
    await a`COMMIT`;
    const [{ result: denied }] = await blocked;
    await b`COMMIT`;
    assert.deepEqual(denied, { ok: false, code: "NOT_FOUND" });
    const [{ unchanged }] =
      await admin`SELECT count(*)=1 AS unchanged FROM firstten_private.guest_capabilities WHERE team_id=${expiryTeam} AND token_hash=${hash(expiryRecovery)} AND revoked_at IS NULL AND uses=0`;
    assert(unchanged);
    console.log(
      "Manage request blocked across actual class expiry returned NOT_FOUND; rejected rotation left its prior recovery credential unchanged.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    await Promise.allSettled([
      admin.end({ timeout: 5 }),
      a.end({ timeout: 5 }),
      b.end({ timeout: 5 }),
    ]);
  }
}
