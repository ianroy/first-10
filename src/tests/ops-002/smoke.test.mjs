import assert from "node:assert/strict";
import test from "node:test";
import { deploymentOrigin, smokeDeployment } from "../../../scripts/smoke.mjs";

const page = '<title>First Ten</title><input type="email" />';
const health = {
  schemaVersion: 1,
  service: "first-ten",
  status: "ok",
  checks: {
    publicSupabaseUrl: true,
    publicSupabaseKey: true,
    serverSupabaseUrl: true,
    serverSupabaseKey: true,
  },
};
const fixture =
  (mutate = (_path, response) => response) =>
  async (url) => {
    const path = new URL(url).pathname;
    return mutate(
      path,
      path === "/api/health"
        ? Response.json(health)
        : new Response(page, { headers: { "content-type": "text/html" } }),
    );
  };

test("working public deployment passes while auth and browser coverage remain explicit", async () => {
  const report = await smokeDeployment("https://fixture.example", { fetchImpl: fixture() });
  assert.equal(report.public.length, 3);
  assert.equal(report.authenticated.status, "skipped");
  assert.equal(report.browserRuntime.status, "manual");
});
test("missing browser configuration fails the deployment fixture", async () => {
  await assert.rejects(
    smokeDeployment("https://fixture.example", {
      fetchImpl: fixture((path, response) =>
        path === "/api/health"
          ? Response.json({ ...health, checks: { ...health.checks, publicSupabaseKey: false } })
          : response,
      ),
    }),
    /configuration checks failed/,
  );
});
test("failed deployments, redirects and deceptive health HTML fail without body disclosure", async () => {
  for (const response of [
    new Response("DO_NOT_LOG_SECRET", { status: 503 }),
    new Response("", { status: 302 }),
    new Response(page),
  ]) {
    await assert.rejects(
      smokeDeployment("https://fixture.example", { fetchImpl: async () => response }),
      (error) => !error.message.includes("DO_NOT_LOG_SECRET"),
    );
  }
});
test("missing sign-in UI and SSR error states fail", async () => {
  for (const body of [
    "<title>First Ten</title>",
    '<title>First Ten</title><input type="email"/>This page didn’t load',
  ]) {
    await assert.rejects(
      smokeDeployment("https://fixture.example", {
        fetchImpl: async () => new Response(body, { headers: { "content-type": "text/html" } }),
      }),
    );
  }
});
test("credential/query/remote-http target URLs are rejected before fetching", () => {
  for (const url of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/?token=secret",
    "https://example.com/auth",
  ])
    assert.throws(() => deploymentOrigin(url));
  assert.equal(deploymentOrigin("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
});
