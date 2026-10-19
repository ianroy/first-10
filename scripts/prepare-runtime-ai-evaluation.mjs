#!/usr/bin/env node
// Prepare only: no credentials, DB access, inference or policy activation.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runtimeEvaluationBindings } from "../src/lib/ai/runtime-evaluation-plan.ts";
import { LIVE_AI_CANDIDATE } from "../src/lib/ai/model-policy.ts";
const output = process.argv[2];
if (!output || !output.startsWith("/private/tmp/"))
  throw new Error("Choose a new private temporary plan path.");
const paths = [
  "src/lib/ai.functions.ts",
  "src/lib/ai/contracts.ts",
  "src/lib/ai/budget-binding.ts",
  "src/lib/ai/budget.server.ts",
  "src/lib/ai/budget-contract.ts",
  "src/lib/ai/gateway.server.ts",
  "src/lib/ai/runtime-evaluation.server.ts",
  "src/lib/ai/runtime-evaluation-plan.ts",
  "src/lib/ai/runtime-evaluation-contract.ts",
  "src/lib/ai/runtime-evaluation-cases.v7.ts",
  "src/lib/ai/readiness.server.ts",
  "src/lib/ai/readiness-access.server.ts",
  "src/lib/ai/model-policy.ts",
  "src/lib/prompts/context-v2.ts",
  "src/lib/prompts/private-v2.ts",
  "src/lib/prompts/grounding-v2.ts",
];
const sourceHashes = {};
for (const path of paths)
  sourceHashes[path] = createHash("sha256")
    .update(await readFile(new URL("../" + path, import.meta.url)))
    .digest("hex");
const plan = {
  ...runtimeEvaluationBindings(),
  candidate: LIVE_AI_CANDIDATE,
  maximumCalls: 8,
  applicationEvaluationCapUsd: 4,
  totalRunCapUsd: 25,
  permanentDemoCarveoutUsd: 1,
  sourceHashes,
  approved: false,
  workspaceId: null,
  privacyReview: null,
  billingReview: null,
  openingHoldMicro: null,
  operatorReference: null,
};
await writeFile(output, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    prepared: true,
    approved: false,
    maximumCalls: 8,
    applicationEvaluationCapUsd: 4,
  }),
);
