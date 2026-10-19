import { z } from "zod";
import { runtimeCaseIdSchema } from "./runtime-evaluation-contract.ts";

export const AI_KINDS = ["questions", "synthesis", "stage2", "stage3", "marketing_demo"] as const;
export type AIKind = (typeof AI_KINDS)[number];
export const aiRequestSchema = z
  .object({
    kind: z.enum([...AI_KINDS, "runtime_evaluation"]),
    projectId: z.string().uuid(),
    operationId: z.string().uuid(),
    withOrigin: z.boolean().optional(),
    withEvaluation: z.literal(true).optional(),
    evaluationCaseId: runtimeCaseIdSchema.optional(),
  })
  .strict()
  .refine(
    (request) =>
      !request.withEvaluation || (request.kind !== "marketing_demo" && !request.withOrigin),
    "Evaluation receipts are separate from product/demo responses.",
  )
  .refine(
    (request) =>
      request.kind === "runtime_evaluation"
        ? Boolean(request.evaluationCaseId) && !request.withOrigin && !request.withEvaluation
        : request.evaluationCaseId === undefined,
    "Fixed runtime checks require their own case identity and response shape.",
  );

const text = z.string().trim().min(1).max(2400);
const texts = z.array(text).max(20);
const titled = z.array(z.object({ title: text, body: text }).strict()).max(12);
const demoText = z
  .string()
  .trim()
  .min(1)
  .max(1600)
  .refine(
    (value) =>
      !/(?:https?:\/\/|www\.|mailto:|(?:\b[a-z0-9][a-z0-9-]*\.)+[a-z]{2,63}\b)/i.test(value),
    "Do not invent destinations for the classroom example.",
  );
export const aiOutputSchemas = {
  marketing_demo: z
    .object({
      channel: demoText,
      hook: demoText,
      body: demoText,
      cta: demoText,
      accessCheck: demoText,
      peerCheck: demoText,
      measurement: demoText,
      uncertainty: demoText,
    })
    .strict(),
  questions: z.object({ questions: texts.min(1) }).strict(),
  synthesis: z
    .object({ problems: texts, objections: texts, best_fit: texts, quotes: texts, changes: titled })
    .strict(),
  stage2: z.object({ channels: titled, drafts: titled, survey: texts }).strict(),
  stage3: z
    .object({ channels: titled, referral_asks: texts, onboarding_questions: texts })
    .strict(),
} satisfies Record<AIKind, z.ZodTypeAny>;

export type AIOutput<K extends AIKind> = z.infer<(typeof aiOutputSchemas)[K]>;

export function validateAIOutput<K extends AIKind>(kind: K, value: unknown): AIOutput<K> {
  const result = aiOutputSchemas[kind].safeParse(value);
  if (!result.success)
    throw new Error(
      "The AI draft did not match the expected format. Your saved work is unchanged.",
    );
  return result.data as AIOutput<K>;
}
