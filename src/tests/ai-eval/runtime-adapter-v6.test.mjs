import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import {
  invokeGenerateAI,
  discoverGenerateAI,
  assertLocalOrigin,
  appendJournal,
  validatePaidResult,
} from "../../../scripts/eval-ai-paid.mjs";
import { assertLocalDatabaseUrl } from "../../../evals/fixture-staging.v6.mjs";
import { loadFixtures } from "../../../scripts/eval-ai.mjs";
const originalFetch = globalThis.fetch;
// The test process never reads an ambient key. Block every external network destination.
process.env.OPENROUTER_API_KEY = "synthetic-runtime-test-key";
process.env.SUPABASE_URL = "http://127.0.0.1:55321";
process.env.SUPABASE_PUBLISHABLE_KEY = "synthetic-publishable";
globalThis.fetch = (url, init) => {
  const u = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
  if (u.hostname !== "127.0.0.1" || u.port !== "55889")
    throw new Error("Offline runtime test blocked network");
  return originalFetch(url, init);
};
test("official SDK frames a real compiled generateAI request and actual auth middleware rejects before provider access", async () => {
  const server = await createServer({
    envDir: false,
    server: { host: "127.0.0.1", port: 55889, strictPort: true },
    logLevel: "silent",
  });
  try {
    await server.listen();
    const binding = await discoverGenerateAI(server);
    assert.match(binding.transformedSha256, /^[a-f0-9]{64}$/);
    let attempts = 0;
    await assert.rejects(
      invokeGenerateAI({
        origin: "http://127.0.0.1:55889",
        functionId: binding.functionId,
        token: "synthetic-invalid-token",
        request: {
          kind: "questions",
          projectId: "fa030000-0000-4000-8000-000000000002",
          operationId: "fa030000-0000-4000-8000-000000000004",
          withEvaluation: true,
        },
        signal: AbortSignal.timeout(15000),
        fetcher: async (url, init) => {
          attempts++;
          assert.equal(init.redirect, "error");
          assert.equal(init.headers.get("x-tsr-serverFn"), "true");
          assert.equal(
            init.headers.get("authorization") === "Bearer synthetic-invalid-token",
            true,
          );
          return globalThis.fetch(url, init);
        },
      }),
      /Unauthorized: Invalid token/,
    );
    assert.equal(attempts, 1);
    await assert.rejects(
      invokeGenerateAI({
        origin: "http://127.0.0.1:55889",
        functionId: "invalid-stale-client-function",
        token: "synthetic-invalid-token",
        request: {},
        signal: AbortSignal.timeout(10000),
      }),
    );
  } finally {
    await server.close();
  }
});
test("token destinations fail closed outside explicitly isolated loopback origin/database", () => {
  for (const origin of [
    "https://evil.invalid",
    "https://first-10-three.vercel.app",
    "http://localhost:55889",
    "http://127.0.0.1:55889/path",
    "http://user:pass@127.0.0.1:55889",
  ])
    assert.throws(() => assertLocalOrigin(origin));
  assert.equal(assertLocalOrigin("http://127.0.0.1:55889"), "http://127.0.0.1:55889");
  for (const url of [
    "postgres://user:pass@127.0.0.1:54322/postgres?sslmode=disable",
    "postgres://user:pass@remote:55322/postgres?sslmode=disable",
    "postgres://user:pass@127.0.0.1:55322/other?sslmode=disable",
  ])
    assert.throws(() => assertLocalDatabaseUrl(url));
});
test("durable private intent journal precedes invocation and retains unknown operation identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eval-v6-journal-"));
  try {
    const handle = await open(join(dir, "journal.jsonl"), "wx", 0o600);
    try {
      await appendJournal(handle, { state: "dispatch_intent", operationId: "stable-synthetic-id" });
      assert.equal(
        JSON.parse((await readFile(join(dir, "journal.jsonl"), "utf8")).trim()).operationId,
        "stable-synthetic-id",
      );
      await appendJournal(handle, {
        state: "unknown_or_withheld",
        operationId: "stable-synthetic-id",
      });
    } finally {
      await handle.close();
    }
    assert.equal((await readFile(join(dir, "journal.jsonl"), "utf8")).trim().split("\n").length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("measured response rejects invented metadata and wrong operation/context/version", async () => {
  const fixtures = await loadFixtures();
  const c = fixtures.cases[0];
  const binding = {
    operationId: "fa030000-0000-4000-8000-000000000004",
    routeVersion: 1,
    provider: "Google Vertex",
  };
  assert.throws(() =>
    validatePaidResult(
      c,
      { draft: {}, grounding: {}, evaluation: { finishReason: "stop", latencyMs: 0 } },
      binding,
    ),
  );
});
