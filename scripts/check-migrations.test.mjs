import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMigrations } from "./check-migrations.mjs";

const file = (name, content = "SELECT 1;") => ({ name, content });
const old = file("20261017000000_initial.sql");
test("append-only ordered migrations retain the baseline", () => {
  assert.deepEqual(checkMigrations([old, file("20261018000000_next.sql")], [old]), []);
});
test("parallel workers cannot reuse a migration number", () => {
  assert.match(checkMigrations([old, file("20261017000000_other.sql")]).join(" "), /Duplicate/);
});
test("editing, removing or renaming published migrations fails", () => {
  assert.match(checkMigrations([file(old.name, "SELECT 2;")], [old]).join(" "), /edited/);
  assert.match(checkMigrations([], [old]).join(" "), /removed or renamed/);
  assert.match(
    checkMigrations([file("20261018000000_renamed.sql")], [old]).join(" "),
    /removed or renamed/,
  );
});
test("backdated additions, malformed names and empty files fail", () => {
  assert.match(
    checkMigrations([old, file("20261016000000_earlier.sql")], [old]).join(" "),
    /predates/,
  );
  assert.match(checkMigrations([file("not-a-version.sql")]).join(" "), /Invalid/);
  assert.match(checkMigrations([file("20261018000000_empty.sql", " \n")]).join(" "), /Empty/);
});
