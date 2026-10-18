import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSuite,
  parseDatabaseUrl,
  parseLocalConfig,
  parseTap,
  validateTarget,
} from "../../../scripts/test-policies.mjs";

const local = "postgresql://postgres:never-log-this@127.0.0.1:55322/postgres";
const config = { projectId: "firstten-policy-tests", configuredPort: 55322 };

test("accepts only the explicitly named local stack and matching port", () => {
  assert.equal(validateTarget(local, config).target, "postgresql://127.0.0.1:55322/postgres");
  assert.throws(() => validateTarget(local, { ...config, configuredPort: 54322 }));
  assert.throws(() => validateTarget(local));
  assert.throws(() => validateTarget(local.replace("55322", "54322"), config));
});

test("always rejects production, even if accidentally allowlisted", () => {
  const url = "postgresql://postgres:secret@db.hdwnnuvqqkkpontcdbwa.supabase.co:5432/postgres";
  assert.throws(
    () =>
      validateTarget(url, {
        allowlist: ["postgresql://db.hdwnnuvqqkkpontcdbwa.supabase.co:5432/postgres"],
      }),
    /protected production/,
  );
  assert.throws(
    () => validateTarget(local, { ...config, projectId: "hdwnnuvqqkkpontcdbwa" }),
    /protected production/,
  );
});

test("remote databases require an exact credential-free disposable allowlist entry", () => {
  const remote = "postgresql://tester:secret@disposable.example.test:5432/policy_test";
  assert.throws(() => validateTarget(remote));
  assert.throws(() => validateTarget(remote, { allowlist: ["disposable.example.test"] }));
  assert.equal(
    validateTarget(remote, { allowlist: ["postgresql://disposable.example.test:5432/policy_test"] })
      .local,
    false,
  );
});

test("rejects connection query options and treats localhost lookalikes as remote", () => {
  assert.throws(() => validateTarget(`${local}?host=production.example`, config));
  assert.throws(() => validateTarget(local.replace("127.0.0.1", "localhost.example.test"), config));
  assert.throws(() => parseDatabaseUrl("http://127.0.0.1:55321"));
  assert.throws(() => parseDatabaseUrl(local.replace("/postgres", "/postgres/other")));
});

test("parses the local database port, not the API or shadow port", () => {
  assert.deepEqual(
    parseLocalConfig(
      'project_id = "firstten-policy-tests"\n[api]\nport = 55321\n[db]\nport = 55322 # test\nshadow_port = 55320\n',
    ),
    { projectId: "firstten-policy-tests", port: 55322 },
  );
});

test("TAP distinguishes expected integrity gaps from new authorization failures", () => {
  const parsed = parseTap(
    "ok 1 - owner\nnot ok 2 - gap # TODO SEC-003\nnot ok 3 - leaked row\n1..3\nPOLICY_FIXTURES_ROLLED_BACK\n",
  );
  assert.equal(parsed.assertions, 3);
  assert.equal(parsed.knownGaps.length, 1);
  assert.equal(parsed.failures.length, 1);
  assert.equal(parsed.validPlan, true);
  assert.equal(parsed.cleanupOk, true);
});

test("missing/truncated TAP or missing rollback proof cannot pass", () => {
  assert.equal(parseTap("ok 1 - only one\n1..2\n").validPlan, false);
  assert.equal(parseTap("ok 1 - only one\n1..1\n").cleanupOk, false);
  assert.equal(parseTap("").validPlan, false);
  assert.equal(parseTap("ok 1 - duplicated\nok 1 - duplicated\n1..2\n").validPlan, false);
  assert.equal(parseTap("ok 1 - pass\n1..1\nBail out! unsafe state\n").validPlan, false);
});

test("suite is one rollback transaction and strict mode removes expected-gap tolerance", () => {
  const sql = buildSuite(["SELECT ok(true, 'fixture');"], true);
  assert.ok(sql.startsWith("BEGIN;"));
  assert.match(sql, /firstten\.policy_strict = 'on'/);
  assert.match(sql, /ROLLBACK;/);
  assert.doesNotMatch(sql, /COMMIT;/);
  assert.match(sql, /POLICY_FIXTURES_ROLLED_BACK/);
});
