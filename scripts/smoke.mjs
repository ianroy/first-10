#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export function deploymentOrigin(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Supply an absolute deployment URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Deployment URL must be an HTTPS origin (or local HTTP), without credentials or query parameters.",
    );
  return url.origin;
}

async function boundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1_000_000) {
      await reader.cancel();
      throw new Error("Response exceeds the smoke-check size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function smokeDeployment(input, { fetchImpl = fetch } = {}) {
  const origin = deploymentOrigin(input);
  const results = [];
  for (const path of ["/", "/auth", "/api/health"]) {
    let response;
    let body;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: path === "/api/health" ? "application/json" : "text/html" },
      });
      body = await boundedText(response);
    } catch {
      throw new Error(
        `${path}: request failed, timed out or exceeded the response limit; response details withheld.`,
      );
    }
    // Never log response bodies: error pages can contain configuration values.
    if (response.status !== 200)
      throw new Error(`${path}: expected HTTP200, received HTTP${response.status}.`);
    if (path === "/api/health") {
      let report;
      try {
        report = JSON.parse(body);
      } catch {
        throw new Error("/api/health: invalid health response.");
      }
      const keys = [
        "publicSupabaseUrl",
        "publicSupabaseKey",
        "serverSupabaseUrl",
        "serverSupabaseKey",
      ];
      if (
        report.schemaVersion !== 1 ||
        report.service !== "first-ten" ||
        report.status !== "ok" ||
        !keys.every((key) => report.checks?.[key] === true)
      )
        throw new Error("/api/health: required public/server configuration checks failed.");
    } else {
      if (!/text\/html/i.test(response.headers.get("content-type") ?? ""))
        throw new Error(`${path}: expected HTML.`);
      if (
        !/<title>[^<]*First Ten[^<]*<\/title>/i.test(body) ||
        /This page didn.t load|Missing Supabase environment variable|INTERNAL_SERVER_ERROR/.test(
          body,
        )
      ) {
        throw new Error(`${path}: expected product page or found an application error.`);
      }
      if (path === "/auth" && !/type="email"/.test(body))
        throw new Error("/auth: sign-in form is absent.");
    }
    results.push({ path, status: "passed" });
  }
  return {
    origin,
    public: results,
    authenticated: {
      status: "skipped",
      reason:
        "Requires a designated test-account browser walkthrough; HTTP200 does not prove authentication or persistence.",
    },
    browserRuntime: {
      status: "manual",
      reason: "Inspect hydration, console errors and interactive controls in a real browser.",
    },
  };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/smoke.mjs https://deployment.example (or SMOKE_URL). Public checks only; no credentials or paid calls.",
    );
    return 0;
  }
  if (args.length > 1) throw new Error("Expected one deployment URL.");
  const report = await smokeDeployment(args[0] || env.SMOKE_URL);
  console.log(JSON.stringify(report, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
