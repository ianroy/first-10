import { validateAIOutput, type AIKind, type AIOutput } from "./contracts";
import { budgetRouteSchema, providerBudgetParameters, type BudgetRoute } from "./budget-contract";

// Baseline identity is evidence/compatibility only. Paid routing requires an explicit DB policy.
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const AI_TOTAL_DEADLINE_MS = 60_000;
export const AI_ATTEMPT_TIMEOUT_MS = 25_000;
export const AI_MAX_ATTEMPTS = 1;
export const AI_MAX_OUTPUT_TOKENS = 2500;
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export function resolveAIModel(value?: string) {
  return value?.trim() || DEFAULT_MODEL;
}
export type GatewayMetadata = {
  requestedModel: string;
  actualModel: string | null;
  generationId: string | null;
  model: string;
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cost: number | null;
  };
  provider: string | null;
  attempts: number;
};
export class AIGatewayError extends Error {
  constructor(
    public code: string,
    message: string,
    public attempts: number,
    public metadata: GatewayMetadata | null = null,
  ) {
    super(message);
    this.name = "AIGatewayError";
  }
}
type Options = {
  key: string;
  model?: string | undefined; // Ignored: retained only for specialized consumer compatibility.
  referer?: string | undefined;
  kind: AIKind;
  schema: object;
  system: string;
  user: string;
  route?: BudgetRoute;
  policy?: "synthetic-marketing-v1";
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};
const label = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 100 &&
  !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ? value
    : null;
const count = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
    ? value
    : null;
function metadataFromEnvelope(envelope: unknown, requestedModel: string): GatewayMetadata {
  const e =
    envelope !== null && typeof envelope === "object" ? (envelope as Record<string, unknown>) : {};
  const u =
    e["usage"] !== null && typeof e["usage"] === "object"
      ? (e["usage"] as Record<string, unknown>)
      : {};
  return {
    requestedModel,
    actualModel: label(e["model"]),
    model: label(e["model"]) ?? requestedModel,
    generationId:
      typeof e["id"] === "string" && /^gen-[0-9A-Za-z-]{1,123}$/.test(e["id"]) ? e["id"] : null,
    provider: label(e["provider"]),
    attempts: 1,
    usage: {
      prompt_tokens: count(u["prompt_tokens"]),
      completion_tokens: count(u["completion_tokens"]),
      total_tokens: count(u["total_tokens"]),
      cost:
        typeof u["cost"] === "number" &&
        Number.isFinite(u["cost"]) &&
        u["cost"] >= 0 &&
        u["cost"] <= 1_000_000
          ? u["cost"]
          : null,
    },
  };
}

/** Exactly one HTTP attempt. Errors carry only bounded billing metadata, never provider/source text. */
export async function requestStructuredDraft<T = AIOutput<AIKind>>(
  options: Options & { outputValidator?: (value: unknown) => T },
) {
  const now = options.now ?? Date.now;
  const started = now();
  const { kind, schema, system, user } = options;
  const key = options.key.trim();
  if (!key || key === "[SENSITIVE]")
    throw new AIGatewayError(
      "NOT_CONFIGURED",
      "AI is not configured. Your saved work is still available.",
      0,
    );
  const synthetic = options.policy === "synthetic-marketing-v1";
  if (synthetic && kind !== "marketing_demo")
    throw new AIGatewayError(
      "POLICY_MISMATCH",
      "This route is reserved for the fictional practice task.",
      0,
    );
  if (kind === "marketing_demo" && !synthetic)
    throw new AIGatewayError("POLICY_REQUIRED", "The fictional practice route is required.", 0);
  const parsed = synthetic ? null : budgetRouteSchema.safeParse(options.route);
  if (!synthetic && (!parsed?.success || parsed.data.kind !== kind))
    throw new AIGatewayError(
      "BUDGET_POLICY_REQUIRED",
      "An approved AI allowance is required. Continue manually.",
      0,
    );
  if (system.length + user.length > (synthetic ? 12_000 : 40_000))
    throw new AIGatewayError(
      "CONTEXT_LIMIT",
      "There is too much context for this draft. Narrow the material or continue manually.",
      0,
    );
  const parameters = synthetic
    ? {
        model: "google/gemini-2.5-flash-lite",
        max_tokens: 1200,
        provider: {
          require_parameters: true,
          only: ["google-vertex"],
          order: ["google-vertex"],
          allow_fallbacks: false,
          data_collection: "deny",
          zdr: true,
          max_price: { prompt: 0.1, completion: 0.4 },
        },
      }
    : providerBudgetParameters(parsed!.data!);
  const remaining = AI_TOTAL_DEADLINE_MS - (now() - started);
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw new AIGatewayError(
      "DEADLINE",
      "The AI request timed out before dispatch. Continue manually.",
      0,
    );
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(Math.max(1, Math.min(AI_ATTEMPT_TIMEOUT_MS, remaining))),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": options.referer || "https://first-10-three.vercel.app",
        "X-Title": "First Ten",
      },
      body: JSON.stringify({
        ...parameters,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: kind, strict: true, schema } },
      }),
    });
  } catch {
    throw new AIGatewayError(
      "OUTCOME_UNKNOWN",
      "The AI response could not be confirmed. The request will not be repeated automatically; continue manually.",
      1,
    );
  }
  if (!response.ok) {
    // Even error responses can follow upstream work. Do not log bodies, refund or retry.
    throw new AIGatewayError(
      `HTTP_${response.status}`,
      response.status === 402
        ? "The AI allowance is unavailable. Continue manually."
        : "The AI could not respond. Your saved work is unchanged; this request will not be repeated automatically.",
      1,
    );
  }
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new AIGatewayError(
      "INVALID_RESPONSE",
      "The AI returned an unreadable response. Continue manually.",
      1,
    );
  }
  const metadata = metadataFromEnvelope(envelope, parameters.model);
  const invalid = (code: string, message: string): never => {
    throw new AIGatewayError(code, message, 1, metadata);
  };
  const choice = envelope?.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter")
    invalid("REFUSAL", "The provider could not make this draft. Continue manually.");
  if (choice?.finish_reason === "length")
    invalid("TRUNCATED", "The AI draft reached its size limit. Continue manually.");
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim())
    invalid("EMPTY_RESPONSE", "The AI returned an empty draft. Continue manually.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    invalid("INVALID_JSON", "The AI draft was unreadable. Continue manually.");
  }
  let data;
  try {
    data = options.outputValidator
      ? options.outputValidator(decoded)
      : validateAIOutput(kind, decoded);
  } catch {
    invalid(
      "INVALID_SCHEMA",
      "The AI draft did not match the expected format. Your saved work is unchanged.",
    );
  }
  return { ...metadata, data: data! as T };
}
