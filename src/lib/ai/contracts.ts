import { z } from "zod";

export const AI_KINDS = ["questions", "synthesis", "stage2", "stage3"] as const;
export type AIKind = (typeof AI_KINDS)[number];
export const aiRequestSchema = z
  .object({
    kind: z.enum(AI_KINDS),
    projectId: z.string().uuid(),
  })
  .strict();

const text = z.string().trim().min(1).max(2400);
const texts = z.array(text).max(20);
const titled = z.array(z.object({ title: text, body: text }).strict()).max(12);
export const aiOutputSchemas = {
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
