// Offline parity only. This module cannot enable routes or make a paid request.
import { SOURCE_PATHS, loadVersionedFixtures } from "./eval-ai.mjs";
export const RUNTIME_FIXTURE_PATH = "src/tests/ai-eval/fixtures.v7.json";
export const RUNTIME_SOURCE_PATHS = [
  ...SOURCE_PATHS,
  "src/lib/ai/budget-binding.ts",
  "src/lib/ai/model-policy.ts",
  "src/lib/ai/readiness.server.ts",
  "src/lib/ai/readiness-access.server.ts",
  "src/lib/ai/runtime-evaluation-cases.v7.ts",
  "src/lib/ai/runtime-evaluation-contract.ts",
  "src/lib/ai/runtime-evaluation-plan.ts",
  "src/lib/ai/runtime-evaluation.server.ts",
];
export const loadRuntimeFixtures = (root = process.cwd()) =>
  loadVersionedFixtures(root, {
    path: RUNTIME_FIXTURE_PATH,
    version: "first-ten-existing-kinds-v7",
    sourcePaths: RUNTIME_SOURCE_PATHS,
  });
