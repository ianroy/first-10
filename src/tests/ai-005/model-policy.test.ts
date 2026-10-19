import { expect, it } from "vitest";
import { inspectLiveCandidateEndpoint, LIVE_AI_CANDIDATE } from "@/lib/ai/model-policy";
const endpoint = {
  tag: "google-vertex/global",
  provider_name: "Google",
  model_id: LIVE_AI_CANDIDATE.model,
  status: 0,
  service_tier: null,
  context_length: 1048576,
  max_completion_tokens: 65536,
  supported_parameters: ["response_format", "structured_outputs", "max_tokens", "reasoning"],
  supports_implicit_caching: false,
  pricing: { prompt: "0.00000025", completion: "0.0000015", internal_reasoning: "0.0000015" },
};
const envelope = (e: unknown[]) => ({ data: { id: LIVE_AI_CANDIDATE.model, endpoints: e } });
it("selects only the reviewed standard global Vertex endpoint", () => {
  expect(
    inspectLiveCandidateEndpoint(
      envelope([
        { ...endpoint, tag: "google-ai-studio" },
        { ...endpoint, tag: "google-vertex/global/flex", service_tier: "flex" },
        endpoint,
      ]),
    ),
  ).toEqual(LIVE_AI_CANDIDATE);
});
it.each([
  { tag: "google-vertex" },
  { tag: "google-vertex/eu" },
  { provider_name: "Google AI Studio" },
  { status: -5 },
  { service_tier: "priority" },
  { supports_implicit_caching: true },
  { context_length: 1048577 },
  { max_completion_tokens: 65537 },
  { supported_parameters: ["response_format", "max_tokens"] },
  { pricing: { ...endpoint.pricing, internal_reasoning: "0.000002" } },
  { pricing: { ...endpoint.pricing, prompt: "0.000000251" } },
])("refuses changed, broader or unbounded eligibility: %j", (override) => {
  expect(() => inspectLiveCandidateEndpoint(envelope([{ ...endpoint, ...override }]))).toThrow();
});
it("does not silently choose between duplicate endpoint identities", () => {
  expect(() => inspectLiveCandidateEndpoint(envelope([endpoint, endpoint]))).toThrow();
});
