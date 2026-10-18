import { z } from "zod";

export const EVALUATION_KEY_CAP_USD = 0.9;
const count = z.number().int().safe().nonnegative();
const label = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
  );
export const evaluationReceiptSchema = z
  .object({
    operationId: z.string().uuid(),
    attemptId: z.string().uuid(),
    contextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    routeVersion: count.positive(),
    originId: z.string().uuid(),
    model: label,
    provider: label,
    generationId: z.string().regex(/^gen-[0-9A-Za-z-]{1,123}$/),
    attempts: z.literal(1),
    finishReason: label,
    latencyMs: z.number().finite().nonnegative().max(60_000),
    usage: z
      .object({
        prompt_tokens: count,
        completion_tokens: count,
        total_tokens: count,
        cost: z.number().finite().nonnegative().max(EVALUATION_KEY_CAP_USD),
      })
      .strict(),
  })
  .strict();
