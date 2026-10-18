import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { seedFixture, targetFor, validateFixture } from "./seed-demo.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../docs/demo/supabase-fixture.json", import.meta.url), "utf8"),
);
function clientFixture() {
  const users = new Map();
  const tables = new Map();
  const client = {
    users,
    tables,
    auth: {
      admin: {
        getUserById: async (id) => ({
          data: { user: users.get(id) },
          error: users.has(id) ? null : { status: 404 },
        }),
        createUser: async (user) => {
          users.set(user.id, structuredClone(user));
          return { data: { user }, error: null };
        },
      },
    },
    from: (table) => {
      if (!tables.has(table)) tables.set(table, new Map());
      const rows = tables.get(table);
      return {
        select: () => ({
          eq: (_key, id) => ({
            maybeSingle: async () => {
              const row = rows.get(id);
              return { data: row ? { ...row, demo: row.checklist?.demo } : null, error: null };
            },
          }),
        }),
        insert: async (row) => {
          if (rows.has(row.id)) return { error: { code: "23505" } };
          rows.set(row.id, structuredClone(row));
          return { error: null };
        },
      };
    },
  };
  return client;
}

test("wrong and production-looking targets fail before a client is created", () => {
  for (const url of [
    "https://other.supabase.co",
    "http://127.0.0.1:54321",
    "https://hdwnnuvqqkkpontcdbwa.supabase.co.evil.test",
    "https://user:password@hdwnnuvqqkkpontcdbwa.supabase.co",
    "https://hdwnnuvqqkkpontcdbwa.supabase.co/?key=secret",
  ])
    assert.throws(() => targetFor(url, "hdwnnuvqqkkpontcdbwa"));
  assert.throws(() => targetFor("https://hdwnnuvqqkkpontcdbwa.supabase.co"));
  assert.equal(
    targetFor("https://hdwnnuvqqkkpontcdbwa.supabase.co", "hdwnnuvqqkkpontcdbwa").kind,
    "authorized-hosted",
  );
  assert.equal(targetFor("http://127.0.0.1:55321").kind, "isolated-local");
});
test("fixture identities, reference bounds and synthetic exclusions cannot drift", () => {
  validateFixture(fixture);
  const bad = structuredClone(fixture);
  bad.interviews[0].contact_id = "not-a-fixture-contact";
  assert.throws(() => validateFixture(bad));
  const unlabeled = structuredClone(fixture);
  unlabeled.project.checklist.demo.excludeFromResearch = false;
  assert.throws(() => validateFixture(unlabeled));
});
test("repeat seeding inserts nothing and preserves presenter edits and unrelated records", async () => {
  const client = clientFixture();
  client.from("projects");
  client.tables
    .get("projects")
    .set("unrelated", { id: "unrelated", name: "KEEP", user_id: "someone-else" });
  const first = await seedFixture(client, fixture);
  assert.equal(first.created.interviews, 5);
  client.tables.get("contacts").get(fixture.contacts[0].id).first_name = "Presenter edit";
  const second = await seedFixture(client, fixture);
  assert.equal(
    Object.values(second.created).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(
    client.tables.get("contacts").get(fixture.contacts[0].id).first_name,
    "Presenter edit",
  );
  assert.equal(client.tables.get("projects").get("unrelated").name, "KEEP");
  assert.equal(second.updates, 0);
  assert.equal(second.deletions, 0);
});
test("a reserved identity collision refuses to seed app records", async () => {
  const client = clientFixture();
  client.users.set(fixture.account.id, {
    id: fixture.account.id,
    email: "someone-else",
    app_metadata: {},
  });
  await assert.rejects(seedFixture(client, fixture), /expected synthetic account/);
  assert.equal(client.tables.size, 0);
});
test("a cross-owner fixture-row collision is never overwritten", async () => {
  const client = clientFixture();
  await seedFixture(client, fixture);
  const row = client.tables.get("interviews").get(fixture.interviews[0].id);
  row.user_id = "other-owner";
  await assert.rejects(seedFixture(client, fixture), /different owner\/project/);
  assert.equal(row.user_id, "other-owner");
});
