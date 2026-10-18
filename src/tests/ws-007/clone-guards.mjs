import assert from "node:assert/strict";
export const CONTAINER = "supabase_db_hdwnnuvqqkkpontcdbwa";
export const CLONE_PATTERN = /^firstten_ws007_[a-f0-9]{12}$/;
export function validateContainer(identity) {
  assert.equal(identity?.Name, "/" + CONTAINER, "Exact dedicated container required");
  assert.equal(identity?.State?.Running, true, "Dedicated container must be running");
  const ports = identity?.NetworkSettings?.Ports?.["5432/tcp"];
  assert.ok(Array.isArray(ports) && ports.length > 0, "Dedicated port bindings required");
  assert.ok(
    ports.every((p) => p.HostPort === "55322"),
    "Every binding must be dedicated55322",
  );
}
export function validateCloneName(name) {
  assert.match(name, CLONE_PATTERN, "Only this rehearsal's disposable clone namespace is allowed");
  return name;
}
export function validateExpectedHistory(value) {
  assert.match(value ?? "", /^20261018\d{6}$/, "Explicit reviewed local history marker required");
  return value;
}
export function validateSourceState(value, expectedHistory) {
  assert.deepEqual(
    value,
    {
      history_marker: expectedHistory,
      schema24_sentinel_present: true,
      schema25_sentinel_present: false,
    },
    "Local history and actual schema sentinels must separately match the reviewed snapshot",
  );
}
export function validateEmptyClone(value) {
  assert.equal(value.trim(), "0", "Schema-only clone must contain no users or projects");
}
