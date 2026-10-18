import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// No configurable URL, remote host or database mutation outside new fixtures.
let phase = "container guard";
async function verify() {
  const [info] = JSON.parse(
    execFileSync("docker", ["inspect", "supabase_db_hdwnnuvqqkkpontcdbwa"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    }),
  );
  assert.equal(info.Name, "/supabase_db_hdwnnuvqqkkpontcdbwa");
  assert.equal(info.State.Running, true);
  const ports = info.NetworkSettings.Ports["5432/tcp"];
  assert(ports?.length && ports.every((p) => p.HostPort === "55322"));
  const password = info.Config.Env.find((v) => v.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  assert(password);
  const options = {
    host: "127.0.0.1",
    port: 55322,
    database: "postgres",
    username: "postgres",
    password,
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  };
  const admin = postgres(options),
    blocker = postgres(options),
    recipientConnection = postgres(options);
  const run = randomUUID(),
    owner = randomUUID(),
    recipient = randomUUID(),
    classId = randomUUID();
  let locked = false;
  let pending;
  const actor = async (sql, user) => {
    await sql`SET LOCAL statement_timeout='15s'`;
    await sql`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: "authenticated" })},true)`;
    await sql`SET LOCAL ROLE authenticated`;
    const [{ actual }] = await sql`SELECT current_user AS actual`;
    assert.equal(actual, "authenticated");
  };
  try {
    phase = "local database guard";
    await admin`SET statement_timeout='15s'`;
    const [{ database, port }] =
      await admin`SELECT current_database() AS database,inet_server_port() AS port`;
    assert.equal(database, "postgres");
    assert.equal(port, 5432);
    const [{ acquired }] = await admin`SELECT pg_try_advisory_lock(171017,2) AS acquired`;
    assert(acquired, "Another local policy run is active");
    locked = true;
    phase = "fictional fixtures";
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES(${owner},'authenticated','authenticated',${`class-owner-${run}@example.invalid`},'',now(),${s.json({ firstten_class_expiry: run })},'{}',now(),now()),
        (${recipient},'authenticated','authenticated',${`class-recipient-${run}@example.invalid`},'',now(),${s.json({ firstten_class_expiry: run })},'{}',now(),now())`;
      await actor(s, owner);
      const [{ result }] = await s`SELECT public.create_class(${classId},${randomUUID()},${s.json({
        name: "Fictional blocked expiry",
        mode: "hackathon",
        instructions: run,
        accessExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        retentionDays: 1,
      })}) AS result`;
      assert.equal(result.ok, true);
    });
    const invitation = await admin.begin(async (s) => {
      await actor(s, owner);
      const [{ result }] =
        await s`SELECT public.create_class_invitation(${classId},${recipient},1,${randomUUID()}) AS result`;
      assert.equal(result.ok, true);
      assert.match(result.token, /^[0-9a-f]{64}$/);
      return result;
    });
    // Operator-only fixture shortening; no production expiry control or token log.
    await admin`UPDATE firstten_private.class_invitations SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=${invitation.data.id} AND class_id=${classId}`;
    phase = "actual cross-session lock wait";
    const [{ pid: lockPid }] = await blocker`SELECT pg_backend_pid() AS pid`;
    const [{ pid: acceptPid }] = await recipientConnection`SELECT pg_backend_pid() AS pid`;
    assert.notEqual(lockPid, acceptPid);
    await blocker`BEGIN`;
    await blocker`SELECT id FROM public.classes WHERE id=${classId} FOR UPDATE`;
    await recipientConnection`BEGIN`;
    await actor(recipientConnection, recipient);
    pending =
      recipientConnection`SELECT public.accept_class_invitation(${invitation.token},'Fictional alias') AS result`.execute();
    // Attach immediately so an exceptional timeout never becomes unhandled.
    pending.catch(() => {});
    let observed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const [{ waiting }] =
        await admin`SELECT ${lockPid}::integer=ANY(pg_blocking_pids(${acceptPid})) AS waiting`;
      if (waiting) {
        observed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(observed, "Acceptance must start while valid and block on the actual class row");
    const [{ stillValid }] =
      await admin`SELECT expires_at>clock_timestamp() AS "stillValid" FROM firstten_private.class_invitations WHERE id=${invitation.data.id}`;
    assert.equal(stillValid, true);
    let expired = false;
    for (let attempt = 0; attempt < 70; attempt++) {
      const [row] =
        await admin`SELECT expires_at<=clock_timestamp() AS expired FROM firstten_private.class_invitations WHERE id=${invitation.data.id}`;
      if (row.expired) {
        expired = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(expired, "Actual wall-clock expiry must pass before releasing the lock");
    await blocker`COMMIT`;
    const [{ result }] = await pending;
    await recipientConnection`COMMIT`;
    assert.deepEqual(result, { ok: false, code: "NOT_FOUND" });
    phase = "no grant after expiry";
    const [saved] = await admin`SELECT
      (SELECT count(*) FROM public.class_members WHERE class_id=${classId}) AS members,
      (SELECT count(*) FROM firstten_private.class_audit WHERE class_id=${classId} AND operation='invite_accept') AS accepts,
      (SELECT count(*) FROM firstten_private.class_invitations WHERE class_id=${classId} AND accepted_at IS NOT NULL) AS consumed`;
    assert.equal(Number(saved.members), 0);
    assert.equal(Number(saved.accepts), 0);
    assert.equal(Number(saved.consumed), 0);
    console.log(
      "Actual independent connections: valid acceptance blocked on class row, crossed wall-clock expiry, then denied without enrollment, consumption or acceptance audit.",
    );
  } finally {
    await Promise.allSettled([blocker`ROLLBACK`, recipientConnection`ROLLBACK`]);
    if (pending) await Promise.allSettled([pending]);
    try {
      if (locked) {
        await admin.begin(async (s) => {
          await s`DELETE FROM public.classes WHERE id=${classId} AND user_id=${owner} AND instructions=${run}`;
          await s`DELETE FROM auth.users WHERE id IN (${owner},${recipient}) AND raw_app_meta_data->>'firstten_class_expiry'=${run}`;
        });
        const [{ remaining }] = await admin`SELECT
          (SELECT count(*) FROM public.classes WHERE id=${classId})+
          (SELECT count(*) FROM public.class_members WHERE class_id=${classId})+
          (SELECT count(*) FROM firstten_private.class_invitations WHERE class_id=${classId})+
          (SELECT count(*) FROM firstten_private.class_operations WHERE class_id=${classId})+
          (SELECT count(*) FROM firstten_private.class_invitation_operations WHERE class_id=${classId})+
          (SELECT count(*) FROM firstten_private.class_audit WHERE class_id=${classId})+
          (SELECT count(*) FROM auth.users WHERE id IN (${owner},${recipient})) AS remaining`;
        assert.equal(Number(remaining), 0);
        console.log(
          "All newly created fictional class/user/invitation fixtures removed; no capability flag changed.",
        );
      }
    } finally {
      if (locked) await admin`SELECT pg_advisory_unlock(171017,2)`;
      await Promise.allSettled([
        admin.end({ timeout: 5 }),
        blocker.end({ timeout: 5 }),
        recipientConnection.end({ timeout: 5 }),
      ]);
    }
  }
}
verify().catch((error) => {
  const code = typeof error?.code === "string" ? error.code : "CHECK_FAILED";
  console.error(
    `Local class expiry verification failed at ${phase} (${code}); sensitive query details withheld.`,
  );
  process.exitCode = 1;
});
