import { z } from "zod";
export const RUNTIME_EVALUATION_VERSION = "first-ten-runtime-evaluation-v7" as const;
export const RUNTIME_EVALUATION_CAP_USD = 4;
export const runtimeCaseIdSchema = z.enum([
  "questions-typical-v7",
  "questions-edge-v7",
  "synthesis-typical-v7",
  "synthesis-edge-v7",
  "stage2-typical-v7",
  "stage2-edge-v7",
  "stage3-typical-v7",
  "stage3-edge-v7",
]);
export type RuntimeCaseId = z.infer<typeof runtimeCaseIdSchema>;
export function runtimeCaseOperationId(id: RuntimeCaseId) {
  const index = runtimeCaseIdSchema.options.indexOf(id);
  if (index < 0) throw new Error("Unknown fixed evaluation case");
  return `f1e70000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}
export const runtimeEvaluationReceiptSchema = z
  .object({
    version: z.literal(RUNTIME_EVALUATION_VERSION),
    caseId: runtimeCaseIdSchema,
    kind: z.enum(["questions", "synthesis", "stage2", "stage3"]),
    operationId: z.string().uuid(),
    contextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    routeVersion: z.number().int().positive(),
    model: z.literal("google/gemini-3.1-flash-lite"),
    provider: z.literal("Google"),
    generationId: z.string().regex(/^gen-[0-9A-Za-z-]{1,123}$/),
    costUsd: z.number().finite().nonnegative().max(RUNTIME_EVALUATION_CAP_USD),
    latencyMs: z.number().finite().nonnegative().max(60000),
    draft: z.record(z.string(), z.unknown()),
    grounding: z
      .object({
        observations: z.array(z.unknown()).max(20),
        inferences: z.array(z.unknown()).max(140),
        missingEvidence: z.array(z.unknown()).min(1).max(4),
      })
      .strict(),
    fictional: z.literal(true),
  })
  .strict();
