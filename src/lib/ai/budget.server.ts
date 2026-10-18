import { createHash, randomUUID } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIContextManifest } from "../prompts/context-v2";
import type { Database } from "@/integrations/supabase/types";
import {
  budgetKindSchema,
  budgetReceiptSchema,
  reservedMicro,
  trustedUsageSchema,
  type BudgetKind,
  type BudgetReceipt,
  type TrustedUsage,
} from "./budget-contract";

type RpcName =
  | "reserve_ai_usage"
  | "claim_ai_usage_with_context"
  | "claim_ai_usage"
  | "finish_ai_usage"
  | "settle_ai_usage";
/** Internal adapter, never exposed as a browser server-function argument. */
export type BudgetRpcClient = {
  rpc(
    name: RpcName,
    args: Record<string, unknown>,
  ): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
export class AIBudgetError extends Error {
  constructor(
    public readonly operationId: string,
    public readonly code: string,
  ) {
    super("AI allowance could not be confirmed. Your saved work is unchanged.");
    this.name = "AIBudgetError";
  }
}
export type BudgetInput = {
  operationId: string;
  userId: string;
  projectId: string;
  kind: BudgetKind;
  /** Trusted server assembly only, never accepted from a browser request. */
  contextFence?: AIContextManifest;
  /** Exact already-authorized provider prompt, schema and version identities, without credentials. */
  context: {
    system: string;
    user: string;
    schema: object;
    promptId: string;
    promptVersion: number;
    schemaId: string;
    schemaVersion: number;
  };
};
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Budget binding requires literal JSON values.");
}
export function budgetInputBinding(context: BudgetInput["context"]) {
  // Canonical object keys; preserve literal strings and array order. No credentials belong here.
  const serialized = canonicalJson({
    system: context.system,
    user: context.user,
    schema: context.schema,
    promptId: context.promptId,
    promptVersion: context.promptVersion,
    schemaId: context.schemaId,
    schemaVersion: context.schemaVersion,
  });
  return {
    contextSha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
    inputBytes: Buffer.byteLength(serialized, "utf8"),
  };
}

/** Only the server gateway's allowlisted billing fields qualify; missing values remain unknown. */
export function trustedGatewayUsage(metadata: unknown, outputValid: boolean): TrustedUsage | null {
  const m =
    metadata !== null && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const u =
    m["usage"] !== null && typeof m["usage"] === "object"
      ? (m["usage"] as Record<string, unknown>)
      : {};
  const parsed = trustedUsageSchema.safeParse({
    generationId: m["generationId"],
    model: m["actualModel"],
    provider: m["provider"],
    costUsd: u["cost"],
    promptTokens: u["prompt_tokens"],
    completionTokens: u["completion_tokens"],
    outputValid,
  });
  return parsed.success ? parsed.data : null;
}

/** No network generation here. A lost claim acknowledgement must NEVER lead to dispatch/retry. */
export async function createBudgetSession(client: BudgetRpcClient, input: BudgetInput) {
  const { contextSha256, inputBytes } = budgetInputBinding(input.context);
  budgetKindSchema.parse(input.kind);
  if (input.contextFence && input.contextFence.contextHash !== contextSha256)
    throw new AIBudgetError(input.operationId, "CONTEXT_BINDING_MISMATCH");
  let claimStarted = false;
  let attemptId: string | null = null;
  let last: BudgetReceipt;
  async function call(name: RpcName, args: Record<string, unknown>) {
    try {
      const response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
      if (response.error) throw new Error("RPC unavailable");
      const receipt = budgetReceiptSchema.parse(response.data);
      if (
        receipt.operationId !== input.operationId ||
        receipt.route.kind !== input.kind ||
        receipt.reservedMicro !== reservedMicro(receipt.route)
      )
        throw new Error("Receipt mismatch");
      return receipt;
    } catch {
      // A timeout may follow a committed transaction. Never invent success, refund, or a second call.
      throw new AIBudgetError(input.operationId, "ACCOUNTING_UNCONFIRMED");
    }
  }
  last = await call("reserve_ai_usage", {
    p_user_id: input.userId,
    p_project_id: input.projectId,
    p_kind: input.kind,
    p_operation_id: input.operationId,
    p_context_sha256: contextSha256,
    p_input_bytes: inputBytes,
  });
  const route = last.route;
  if (inputBytes > route.input_byte_ceiling || last.state !== "reserved")
    throw new AIBudgetError(input.operationId, "NOT_DISPATCHABLE");
  if (
    route.purpose === "eval_only" &&
    (route.eval_user_id !== input.userId ||
      route.eval_project_id !== input.projectId ||
      !route.eval_context_sha256?.includes(contextSha256))
  )
    throw new AIBudgetError(input.operationId, "EVALUATION_SCOPE_DENIED");
  return {
    operationId: input.operationId,
    route,
    async claim() {
      if (claimStarted) throw new AIBudgetError(input.operationId, "ALREADY_CLAIMED");
      claimStarted = true;
      attemptId = randomUUID();
      last = await call(input.contextFence ? "claim_ai_usage_with_context" : "claim_ai_usage", {
        p_operation_id: input.operationId,
        p_attempt_id: attemptId,
        ...(input.contextFence ? { p_manifest: input.contextFence } : {}),
      });
      if (
        !last.dispatch ||
        last.state !== "in_flight" ||
        JSON.stringify(last.route) !== JSON.stringify(route)
      )
        throw new AIBudgetError(input.operationId, "NOT_DISPATCHABLE");
      return { attemptId, route };
    },
    async cancelBeforeDispatch() {
      if (claimStarted) throw new AIBudgetError(input.operationId, "CANNOT_CANCEL");
      last = await call("finish_ai_usage", {
        p_operation_id: input.operationId,
        p_attempt_id: null,
        p_action: "cancel",
        p_generation_id: null,
      });
      if (last.state !== "cancelled" || last.chargeMicro !== 0)
        throw new AIBudgetError(input.operationId, "ACCOUNTING_UNCONFIRMED");
      return last;
    },
    async markUnknown(generationId: string | null = null) {
      if (!attemptId) throw new AIBudgetError(input.operationId, "NOT_CLAIMED");
      last = await call("finish_ai_usage", {
        p_operation_id: input.operationId,
        p_attempt_id: attemptId,
        p_action: "unknown",
        // Missing/malformed upstream metadata remains unknown, never a zero-cost settlement.
        p_generation_id:
          generationId && /^gen-[0-9A-Za-z-]{1,123}$/.test(generationId) ? generationId : null,
      });
      if (last.state !== "unknown" || last.chargeMicro !== last.reservedMicro)
        throw new AIBudgetError(input.operationId, "ACCOUNTING_UNCONFIRMED");
      return last;
    },
    async settle(trustedProviderUsage: TrustedUsage) {
      if (!attemptId) throw new AIBudgetError(input.operationId, "NOT_CLAIMED");
      const parsed = trustedUsageSchema.safeParse(trustedProviderUsage);
      if (!parsed.success) throw new AIBudgetError(input.operationId, "USAGE_UNKNOWN");
      const u = parsed.data;
      last = await call("settle_ai_usage", {
        p_operation_id: input.operationId,
        p_attempt_id: attemptId,
        p_generation_id: u["generationId"],
        p_model: u["model"],
        p_provider: u["provider"],
        p_cost_usd: u.costUsd,
        p_prompt_tokens: u.promptTokens,
        p_completion_tokens: u.completionTokens,
        p_output_valid: u.outputValid,
      });
      if (last.state !== "settled" || !last.resultAllowed)
        throw new AIBudgetError(input.operationId, "RESULT_WITHHELD");
      return last;
    },
  };
}

/** Fresh request identity BEFORE importing service credentials; RPC rechecks current DB ownership. */
export async function prepareAIBudget(scope: {
  supabase: SupabaseClient<Database>;
  operationId: string;
  userId: string;
  projectId: string;
  projectOwnerId: string;
  kind: BudgetKind;
  context: BudgetInput["context"];
  contextFence?: AIContextManifest;
}) {
  const operationId = scope.operationId;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  )
    throw new AIBudgetError(operationId, "INVALID_INTENT");
  const token = getRequest()
    .headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || scope.userId !== scope.projectOwnerId)
    throw new AIBudgetError(operationId, "UNVERIFIED_OWNER");
  try {
    const { data, error } = await scope.supabase.auth.getUser(token);
    if (error || data.user?.id !== scope.userId) throw new Error("Identity unverified");
  } catch {
    throw new AIBudgetError(operationId, "UNVERIFIED_OWNER");
  }
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new AIBudgetError(operationId, "NOT_CONFIGURED");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return createBudgetSession(supabaseAdmin as unknown as BudgetRpcClient, {
    ...scope,
    operationId,
  });
}
