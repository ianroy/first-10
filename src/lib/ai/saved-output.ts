import { z } from "zod";
import { validateAIOutput, type AIKind, type AIOutput } from "./contracts";

type PrivateKind = Exclude<AIKind, "marketing_demo">;
const envelope = z.object({ originId: z.string().uuid(), data: z.unknown() }).strict();
/** Provider JSON remains strict and unchanged; the server's receipt travels outside that JSON. */
export function recordedAIOutput<K extends PrivateKind>(kind: K, value: unknown) {
  const parsed = envelope.safeParse(value);
  if (!parsed.success) throw new Error("The AI origin is missing. Your saved work is unchanged.");
  return { originId: parsed.data.originId, data: validateAIOutput(kind, parsed.data.data) };
}
export function outreachRows(value: AIOutput<"stage2"> | AIOutput<"stage3">) {
  return "drafts" in value
    ? [
        ...value.channels.map((c) => ({ kind: "channel", ...c })),
        ...value.drafts.map((c) => ({ kind: "draft", ...c })),
      ]
    : [
        ...value.channels.map((c) => ({ kind: "channel", ...c })),
        ...value.referral_asks.map((body, i) => ({
          kind: "referral",
          title: `Referral ask ${i + 1}`,
          body,
        })),
        ...value.onboarding_questions.map((body) => ({ kind: "onboarding", title: "", body })),
      ];
}
export const aiOriginSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum(["questions", "synthesis", "stage2", "stage3"]),
    promptId: z.string(),
    promptVersion: z.number().int().positive(),
    schemaId: z.string(),
    schemaVersion: z.number().int().positive(),
    requestedModel: z.string(),
    actualModel: z.string().nullable(),
    provider: z.string().nullable(),
    costUsd: z.number().nonnegative().nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
