import test from "node:test";
import assert from "node:assert/strict";
import {
  validateContainer,
  validateCloneName,
  validateExpectedHistory,
  validateSourceState,
  validateEmptyClone,
  CONTAINER,
} from "./clone-guards.mjs";
const good = () => ({
  Name: "/" + CONTAINER,
  State: { Running: true },
  NetworkSettings: {
    Ports: {
      "5432/tcp": [
        { HostIp: "127.0.0.1", HostPort: "55322" },
        { HostIp: "::1", HostPort: "55322" },
      ],
    },
  },
});
test("exact dedicated running container and every binding are required", () => {
  assert.doesNotThrow(() => validateContainer(good()));
  for (const value of [
    null,
    { ...good(), Name: "/another_database" },
    { ...good(), State: { Running: false } },
    { ...good(), NetworkSettings: { Ports: {} } },
  ])
    assert.throws(() => validateContainer(value));
  const mixed = good();
  mixed.NetworkSettings.Ports["5432/tcp"][1].HostPort = "54322";
  assert.throws(() => validateContainer(mixed));
});
test("ordinary, hosted-looking or differently named databases cannot be cleanup targets", () => {
  assert.equal(validateCloneName("firstten_ws007_012345abcdef"), "firstten_ws007_012345abcdef");
  for (const value of [
    "postgres",
    "supabase",
    "firstten_eval_v6_01234567",
    "firstten_ws007_012345ABCDEF",
    "firstten_ws007_012345abcdef; DROP DATABASE postgres",
  ])
    assert.throws(() => validateCloneName(value));
});
test("operator must bind the schema snapshot to its exact reviewed local history marker", () => {
  assert.equal(validateExpectedHistory("20261018003000"), "20261018003000");
  for (const value of [undefined, "", "latest", "20261018024000 OR true", "20261019024000"])
    assert.throws(() => validateExpectedHistory(value));
});
test("schema24 presence and future25 absence are verified independently of stale local migration history", () => {
  const state = {
    history_marker: "20261018003000",
    schema24_sentinel_present: true,
    schema25_sentinel_present: false,
  };
  assert.doesNotThrow(() => validateSourceState(state, "20261018003000"));
  for (const bad of [
    { ...state, history_marker: "20261018024000" },
    { ...state, schema24_sentinel_present: false },
    { ...state, schema25_sentinel_present: true },
    { ...state, schema25_sentinel_present: null },
  ])
    assert.throws(() => validateSourceState(bad, "20261018003000"));
});
test("a clone carrying any source account/project data fails before fixture writes", () => {
  assert.doesNotThrow(() => validateEmptyClone("0\n"));
  for (const value of ["1", "2", "", "0\n1"]) assert.throws(() => validateEmptyClone(value));
});
