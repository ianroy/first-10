import { z } from "zod";

/** Candidate selection only. A catalog match never enables a database route. */
export const LIVE_AI_CANDIDATE = {
  model: "google/gemini-3.1-flash-lite",
  providerSlug: "google-vertex/global",
  responseProvider: "Google",
  inputTokenCeiling: 1_048_576,
  billableOutputTokenCeiling: 65_536,
  requestOutputTokenCeiling: 4000,
  promptMicroPerMillion: 250_000,
  completionMicroPerMillion: 1_500_000,
} as const;
const price = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .transform(Number)
  .refine(Number.isFinite);
const endpoint = z.object({
  tag: z.string(),
  provider_name: z.string(),
  model_id: z.string(),
  status: z.number().int(),
  service_tier: z.string().nullable(),
  context_length: z.number().int().positive(),
  max_completion_tokens: z.number().int().positive(),
  supported_parameters: z.array(z.string()),
  supports_implicit_caching: z.boolean(),
  pricing: z.object({ prompt: price, completion: price, internal_reasoning: price }),
});
export function inspectLiveCandidateEndpoint(value: unknown) {
  const data = z
    .object({ data: z.object({ id: z.string(), endpoints: z.array(z.unknown()).max(100) }) })
    .parse(value).data;
  if (data.id !== LIVE_AI_CANDIDATE.model) throw new Error("Unexpected candidate model");
  const matches = data.endpoints.filter(
    (v) =>
      v !== null && typeof v === "object" && "tag" in v && v.tag === LIVE_AI_CANDIDATE.providerSlug,
  );
  if (matches.length !== 1) throw new Error("Exact standard endpoint unavailable");
  const selected = endpoint.parse(matches[0]);
  if (
    selected.model_id !== data.id ||
    selected.provider_name !== LIVE_AI_CANDIDATE.responseProvider ||
    selected.status !== 0 ||
    selected.service_tier !== null ||
    selected.supports_implicit_caching ||
    selected.context_length > LIVE_AI_CANDIDATE.inputTokenCeiling ||
    selected.max_completion_tokens > LIVE_AI_CANDIDATE.billableOutputTokenCeiling ||
    selected.max_completion_tokens < LIVE_AI_CANDIDATE.requestOutputTokenCeiling ||
    !["response_format", "structured_outputs", "max_tokens", "reasoning"].every((p) =>
      selected.supported_parameters.includes(p),
    ) ||
    Math.ceil(selected.pricing.prompt * 1e12) > LIVE_AI_CANDIDATE.promptMicroPerMillion ||
    Math.ceil(selected.pricing.completion * 1e12) > LIVE_AI_CANDIDATE.completionMicroPerMillion ||
    Math.ceil(selected.pricing.internal_reasoning * 1e12) >
      LIVE_AI_CANDIDATE.completionMicroPerMillion
  )
    throw new Error("Candidate endpoint requires a new review");
  return { ...LIVE_AI_CANDIDATE };
}
