import { validateAIOutput, type AIKind } from "./contracts";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const AI_TOTAL_DEADLINE_MS = 60_000;
export const AI_ATTEMPT_TIMEOUT_MS = 25_000;
export const AI_MAX_ATTEMPTS = 2;
export const AI_MAX_OUTPUT_TOKENS = 2500;
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export function resolveAIModel(value?: string) {
  return value?.trim() || DEFAULT_MODEL;
}

export class AIGatewayError extends Error {
  constructor(
    public code: string,
    message: string,
    public attempts: number,
  ) {
    super(message);
    this.name = "AIGatewayError";
  }
}

type Options = {
  key: string;
  model?: string | undefined;
  referer?: string | undefined;
  kind: AIKind;
  schema: object;
  system: string;
  user: string;
  policy?: "synthetic-marketing-v1";
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

function retryDelay(header: string | null, attempt: number, now: number, random: () => number) {
  if (header) {
    const seconds = Number(header);
    const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return Math.min(milliseconds, 5000);
  }
  return Math.min(5000, 800 * 2 ** attempt + Math.floor(random() * 200));
}

/** Returns draft plus non-content metadata; the public server function returns only data. */
export async function requestStructuredDraft(options: Options) {
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
  if (system.length + user.length > (synthetic ? 12_000 : 40_000))
    throw new AIGatewayError(
      "CONTEXT_LIMIT",
      "There is too much context for this draft. Narrow the material and try again.",
      0,
    );
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const deadline = now() + AI_TOTAL_DEADLINE_MS;
  const model = synthetic ? "google/gemini-2.5-flash-lite" : resolveAIModel(options.model);
  const maxAttempts = synthetic ? 1 : AI_MAX_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new AIGatewayError(
        "DEADLINE",
        "The AI request timed out. Your saved work is unchanged.",
        attempt,
      );
    const signal = AbortSignal.timeout(Math.max(1, Math.min(AI_ATTEMPT_TIMEOUT_MS, remaining)));
    let response: Response;
    try {
      response = await fetcher(ENDPOINT, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": options.referer || "https://first-10-three.vercel.app",
          "X-Title": "First Ten",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: synthetic ? 1200 : AI_MAX_OUTPUT_TOKENS,
          response_format: {
            type: "json_schema",
            json_schema: { name: kind, strict: true, schema },
          },
          provider: synthetic
            ? {
                require_parameters: true,
                only: ["google-vertex"],
                order: ["google-vertex"],
                allow_fallbacks: false,
                data_collection: "deny",
                zdr: true,
                max_price: { prompt: 0.1, completion: 0.4 },
              }
            : { require_parameters: true },
        }),
      });
    } catch {
      // A disconnected request may have been processed upstream. Do not automatically pay twice.
      throw new AIGatewayError(
        "OUTCOME_UNKNOWN",
        "The AI response could not be confirmed. Your saved work is unchanged; retry only if you want a new request.",
        attempt + 1,
      );
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt + 1 < maxAttempts) {
        const delay = retryDelay(response.headers.get("retry-after"), attempt, now(), random);
        if (now() + delay >= deadline)
          throw new AIGatewayError(
            "DEADLINE",
            "The AI request timed out. Your saved work is unchanged.",
            attempt + 1,
          );
        await sleep(delay);
        continue;
      }
      const message =
        response.status === 401
          ? "AI authentication failed. Your saved work is still available."
          : response.status === 402
            ? "The AI allowance is unavailable. Your saved work is still available."
            : response.status === 429
              ? "The AI is busy. Wait a moment before requesting another draft."
              : "The AI could not respond. Your saved work is unchanged.";
      throw new AIGatewayError(`HTTP_${response.status}`, message, attempt + 1);
    }
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new AIGatewayError(
        "INVALID_RESPONSE",
        "The AI returned an unreadable response. Your saved work is unchanged.",
        attempt + 1,
      );
    }
    const choice = envelope?.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter")
      throw new AIGatewayError(
        "REFUSAL",
        "The provider could not make this draft. Review the material or continue manually.",
        attempt + 1,
      );
    if (choice?.finish_reason === "length")
      throw new AIGatewayError(
        "TRUNCATED",
        "The AI draft reached its size limit. Narrow the request and try again.",
        attempt + 1,
      );
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim())
      throw new AIGatewayError(
        "EMPTY_RESPONSE",
        "The AI returned an empty draft. Your saved work is unchanged.",
        attempt + 1,
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AIGatewayError(
        "INVALID_JSON",
        "The AI draft was unreadable. Your saved work is unchanged.",
        attempt + 1,
      );
    }
    const data = validateAIOutput(kind, parsed);
    return {
      data,
      generationId: typeof envelope.id === "string" ? envelope.id : null,
      model: typeof envelope.model === "string" ? envelope.model : model,
      usage: envelope.usage ?? null,
      provider: typeof envelope.provider === "string" ? envelope.provider : null,
      attempts: attempt + 1,
    };
  }
  throw new AIGatewayError(
    "UNAVAILABLE",
    "The AI is unavailable. Your saved work is unchanged.",
    AI_MAX_ATTEMPTS,
  );
}
