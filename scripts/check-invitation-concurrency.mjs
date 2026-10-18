import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Deliberately no configurable URL: this rehearsal can reach only the existing
// dedicated local First Ten fixture stack, never hosted or the unrelated54322.
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
  const bindings = info.NetworkSettings.Ports["5432/tcp"];
  assert(bindings?.length && bindings.every((binding) => binding.HostPort === "55322"));
  const password = info.Config.Env.find((value) => value.startsWith("POSTGRES_PASSWORD="))?.slice(
    18,
  );
  assert(password, "Dedicated local database credential must exist");
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
    a = postgres(options),
    b = postgres(options);
  const run = randomUUID(),
    owner = randomUUID(),
    recipient = randomUUID(),
    project = randomUUID();
  const requests = [randomUUID(), randomUUID()];
  let previousCapability;
  let locked = false;
  const actor = async (connection, user) => {
    await connection`SET LOCAL statement_timeout='15s'`;
    await connection`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: "authenticated" })},true)`;
    await connection`SET LOCAL ROLE authenticated`;
    const [{ actual }] = await connection`SELECT current_user AS actual`;
    assert.equal(actual, "authenticated");
  };
  try {
    phase = "local connection guard";
    await admin`SET statement_timeout='15s'`;
    const [{ database, port }] =
      await admin`SELECT current_database() AS database,inet_server_port() AS port`;
    assert.equal(database, "postgres");
    assert.equal(port, 5432);
    // Same guard as the rolled-back policy runner. Session ownership spans our
    // committed fixtures and independent connections, so local suites cannot
    // race our temporary operator-only capability change.
    phase = "exclusive policy guard";
    const [{ acquired }] = await admin`SELECT pg_try_advisory_lock(171017,2) AS acquired`;
    assert(acquired, "Another local policy verification is active; retry after it finishes");
    locked = true;
    phase = "capability snapshot";
    const [{ enabled }] =
      await admin`SELECT enabled FROM firstten_private.project_collaboration_capability WHERE singleton`;
    assert.equal(typeof enabled, "boolean");
    previousCapability = enabled;
    phase = "fixture setup";
    await admin.begin(async (s) => {
      await s`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES(${owner},'authenticated','authenticated',${`invite-owner-${run}@example.invalid`},'',now(),${s.json({ firstten_local_invite_race: run })},'{}',now(),now()),
              (${recipient},'authenticated','authenticated',${`invite-recipient-${run}@example.invalid`},'',now(),${s.json({ firstten_local_invite_race: run })},'{}',now(),now())`;
      await s`INSERT INTO public.projects(id,user_id,name,questions,checklist)
        VALUES(${project},${owner},'Fictional invitation race','["Retain original question"]',${s.json({ firstten_local_invite_race: run, preserve: true })})`;
      await s`UPDATE firstten_private.project_collaboration_capability SET enabled=true WHERE singleton`;
    });
    phase = "invitation issue";
    const invitations = await admin.begin(async (s) => {
      await actor(s, owner);
      const [{ result: viewer }] =
        await s`SELECT public.create_project_invitation('project',${project},${recipient},'viewer',7,${requests[0]}) AS result`;
      const [{ result: editor }] =
        await s`SELECT public.create_project_invitation('project',${project},${recipient},'editor',7,${requests[1]}) AS result`;
      assert.equal(viewer.ok, true);
      assert.equal(editor.ok, true);
      assert.match(viewer.token, /^[0-9a-f]{64}$/);
      assert.match(editor.token, /^[0-9a-f]{64}$/);
      assert.notEqual(viewer.token, editor.token);
      return { viewer, editor };
    });
    phase = "two-connection acceptance";
    const [{ pid: pidA }] = await a`SELECT pg_backend_pid() AS pid`;
    const [{ pid: pidB }] = await b`SELECT pg_backend_pid() AS pid`;
    assert.notEqual(pidA, pidB);
    for (const connection of [a, b]) {
      await connection`BEGIN`;
      await actor(connection, recipient);
    }
    const [{ result: first }] =
      await a`SELECT public.accept_project_invitation('project',${invitations.viewer.token}) AS result`;
    assert.equal(first.ok, true);
    assert.equal(first.data.role, "viewer");
    assert.equal(first.data.membershipRevision, 1);
    const pending =
      b`SELECT public.accept_project_invitation('project',${invitations.editor.token}) AS result`.execute();
    let observed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const [{ waiting }] =
        await admin`SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB})) AS waiting`;
      if (waiting) {
        observed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(observed, "Second recipient connection must wait on the first project's row lock");
    await a`COMMIT`;
    const [{ result: second }] = await pending;
    await b`COMMIT`;
    assert.deepEqual(second, { ok: false, code: "REVISION_CONFLICT" });
    phase = "receipt replay and data verification";
    const replay = await b.begin(async (s) => {
      await actor(s, recipient);
      const [{ result }] =
        await s`SELECT public.accept_project_invitation('project',${invitations.viewer.token}) AS result`;
      return result;
    });
    phase = "receipt equality";
    assert.deepEqual(replay, first);
    const [saved] = await admin`SELECT
      (SELECT count(*) FROM public.project_members WHERE project_id=${project}) AS members,
      (SELECT role FROM public.project_members WHERE project_id=${project} AND user_id=${recipient}) AS role,
      (SELECT revision FROM public.project_members WHERE project_id=${project} AND user_id=${recipient}) AS revision,
      (SELECT count(*) FROM firstten_private.project_invitations WHERE project_id=${project} AND accepted_at IS NOT NULL) AS accepted,
      (SELECT count(*) FROM firstten_private.invitation_audit WHERE project_id=${project} AND operation='accept') AS accepts,
      questions,checklist FROM public.projects WHERE id=${project} AND user_id=${owner}`;
    phase = "single grant counts";
    assert.equal(Number(saved.members), 1);
    assert.equal(saved.role, "viewer");
    assert.equal(Number(saved.revision), 1);
    assert.equal(Number(saved.accepted), 1);
    assert.equal(Number(saved.accepts), 1);
    phase = "preserved project content";
    assert.deepEqual(saved.questions, ["Retain original question"]);
    assert.deepEqual(saved.checklist, { firstten_local_invite_race: run, preserve: true });
    console.log(
      "Two actual independent recipient connections: viewer acceptance committed once; competing editor invitation conflicted after an observed project-row lock wait.",
    );
    console.log(
      "Same-token receipt replay produced no extra membership, revision, acceptance or audit; original project content unchanged.",
    );
  } finally {
    await Promise.allSettled([a`ROLLBACK`, b`ROLLBACK`]);
    try {
      if (locked) {
        await admin.begin(async (s) => {
          // UUIDs and an immutable run marker bound cleanup to only fixtures
          // this invocation created. No existing user/project is touched.
          await s`DELETE FROM public.projects WHERE id=${project} AND user_id=${owner} AND checklist->>'firstten_local_invite_race'=${run}`;
          await s`DELETE FROM auth.users WHERE id IN (${owner},${recipient}) AND raw_app_meta_data->>'firstten_local_invite_race'=${run}`;
          if (previousCapability !== undefined)
            await s`UPDATE firstten_private.project_collaboration_capability SET enabled=${previousCapability} WHERE singleton`;
        });
        const [{ remaining }] = await admin`SELECT
          (SELECT count(*) FROM public.projects WHERE id=${project})+
          (SELECT count(*) FROM auth.users WHERE id IN (${owner},${recipient}))+
          (SELECT count(*) FROM public.project_members WHERE project_id=${project})+
          (SELECT count(*) FROM firstten_private.project_invitations WHERE project_id=${project})+
          (SELECT count(*) FROM firstten_private.invitation_operations WHERE project_id=${project})+
          (SELECT count(*) FROM firstten_private.invitation_audit WHERE project_id=${project}) AS remaining`;
        phase = "fixture cleanup absence";
        assert.equal(Number(remaining), 0);
        if (previousCapability !== undefined) {
          const [{ enabled }] =
            await admin`SELECT enabled FROM firstten_private.project_collaboration_capability WHERE singleton`;
          phase = "capability restoration";
          assert.equal(enabled, previousCapability);
        }
        console.log(
          "Only newly created local fictional fixtures removed; original local collaboration capability restored and verified.",
        );
      }
    } finally {
      try {
        if (locked) await admin`SELECT pg_advisory_unlock(171017,2)`;
      } finally {
        await Promise.allSettled([
          admin.end({ timeout: 5 }),
          a.end({ timeout: 5 }),
          b.end({ timeout: 5 }),
        ]);
      }
    }
  }
}
verify().catch((error) => {
  // Never print postgres errors, query parameters or invitation secrets.
  const code = typeof error?.code === "string" ? error.code : "CHECK_FAILED";
  console.error(
    `Local invitation concurrency verification failed at ${phase} (${code}); sensitive query details withheld.`,
  );
  process.exitCode = 1;
});
