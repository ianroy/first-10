import { z } from "zod";

export const BUDGET_KINDS = ["questions", "synthesis", "stage2", "stage3"] as const;
export const BUDGET_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3.1-flash-lite",
  "openai/gpt-5-mini",
] as const;
export const budgetKindSchema = z.enum(BUDGET_KINDS);
export type BudgetKind = z.infer<typeof budgetKindSchema>;
export const USD_MICRO = 1_000_000;
export const GENERAL_CAP_MICRO = 24 * USD_MICRO;
export const FIXED_DEMO_CAP_MICRO = USD_MICRO;
const integer = z.number().int().safe().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const label = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
  );
export const budgetRouteSchema = z
  .object({
    kind: budgetKindSchema,
    version: integer.min(1).max(2_147_483_647),
    enabled: z.literal(true),
    model: z.enum(BUDGET_MODELS),
    provider_slug: z.string().regex(/^[a-z0-9][a-z0-9/_-]{0,79}$/),
    response_providers: z.array(label).min(1).max(4),
    input_token_ceiling: integer.min(1).max(2_000_000),
    output_token_ceiling: integer.min(1).max(100_000),
    input_byte_ceiling: integer.min(1).max(200_000),
    prompt_micro_per_million: integer.min(1).max(100_000_000),
    completion_micro_per_million: integer.min(1).max(100_000_000),
    bounds_review_sha256: hash,
    quality_review_sha256: hash,
    checked_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
    operator_reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/),
    purpose: z.enum(["product", "eval_only"]),
    eval_user_id: z.string().uuid().nullable(),
    eval_project_id: z.string().uuid().nullable(),
    eval_context_sha256: z.array(hash).min(1).max(32).nullable(),
  })
  .strict()
  .refine(
    (route) =>
      route.purpose === "product"
        ? route.eval_user_id === null &&
          route.eval_project_id === null &&
          route.eval_context_sha256 === null
        : route.eval_user_id !== null &&
          route.eval_project_id !== null &&
          route.eval_context_sha256 !== null,
    "Route evaluation scope is incomplete.",
  );
export type BudgetRoute = z.infer<typeof budgetRouteSchema>;
export const budgetReceiptSchema = z
  .object({
    operationId: z.string().uuid(),
    state: z.enum(["reserved", "in_flight", "unknown", "closed_unknown", "settled", "cancelled"]),
    reservedMicro: integer.positive().max(1_000_000_000_000),
    chargeMicro: integer.max(1_000_000_000_000),
    resultAllowed: z.boolean(),
    route: budgetRouteSchema,
    dispatch: z.boolean().optional(),
  })
  .strict();
export type BudgetReceipt = z.infer<typeof budgetReceiptSchema>;
export const trustedUsageSchema = z
  .object({
    generationId: z.string().regex(/^gen-[0-9A-Za-z-]{1,123}$/),
    model: label,
    provider: label,
    costUsd: z.number().finite().min(0).max(1_000_000),
    promptTokens: integer.max(2_147_483_647),
    completionTokens: integer.max(2_147_483_647),
    outputValid: z.boolean(),
  })
  .strict();
export type TrustedUsage = z.infer<typeof trustedUsageSchema>;

/** Accounting rounds up; request-price ceilings use dollars per million, not total dollars. */
export function dollarsToMicro(dollars: number) {
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000)
    throw new Error("Invalid trusted cost.");
  return Math.ceil(dollars * USD_MICRO);
}
export function reservedMicro(route: BudgetRoute) {
  // BigInt avoids rounding down an integer product near a microdollar boundary.
  const numerator =
    BigInt(route.input_token_ceiling) * BigInt(route.prompt_micro_per_million) +
    BigInt(route.output_token_ceiling) * BigInt(route.completion_micro_per_million);
  return Number((numerator + 999_999n) / 1_000_000n);
}
export function providerBudgetParameters(route: BudgetRoute) {
  return {
    model: route.model,
    max_tokens: route.output_token_ceiling,
    provider: {
      only: [route.provider_slug],
      order: [route.provider_slug],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny" as const,
      zdr: true,
      max_price: {
        prompt: route.prompt_micro_per_million / USD_MICRO,
        completion: route.completion_micro_per_million / USD_MICRO,
      },
    },
  };
}
