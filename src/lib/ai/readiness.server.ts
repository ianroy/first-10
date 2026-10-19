import { z } from "zod";

const dollars = z.number().finite().nonnegative().max(1_000_000).nullable();
const keyMetadata = z.object({
  limit: dollars,
  limit_remaining: dollars,
  limit_reset: z.string().max(40).nullable(),
  include_byok_in_limit: z.boolean(),
  is_management_key: z.boolean(),
  is_provisioning_key: z.boolean(),
  usage: z.number().finite().nonnegative().max(1_000_000),
  workspace_id: z.string().uuid().nullable().optional(),
});
export type AIKeyReadiness =
  | { status: "unconfigured" | "unavailable" }
  | {
      status: "verified";
      limitUsd: number | null;
      remainingUsd: number | null;
      usageUsd: number;
      resetting: boolean;
      includesByok: boolean;
      managementKey: boolean;
      withinRunKeyCeiling: boolean;
      workspaceId: string | null;
    };

/** Free metadata request only. Never returns credentials, labels or upstream bodies. */
export async function inspectRuntimeAIKey(
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AIKeyReadiness> {
  const credential = key?.trim();
  if (!credential || credential === "[SENSITIVE]") return { status: "unconfigured" };
  try {
    const response = await fetcher("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || !response.body) return { status: "unavailable" };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return { status: "unavailable" };
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = z
      .object({ data: keyMetadata })
      .safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!parsed.success) return { status: "unavailable" };
    const data = parsed.data.data;
    return {
      status: "verified",
      limitUsd: data.limit,
      remainingUsd: data.limit_remaining,
      usageUsd: data.usage,
      resetting: data.limit_reset !== null,
      includesByok: data.include_byok_in_limit,
      managementKey: data.is_management_key || data.is_provisioning_key,
      workspaceId: data.workspace_id ?? null,
      withinRunKeyCeiling:
        data.limit !== null &&
        data.limit > 0 &&
        data.limit <= 25 &&
        data.limit_reset === null &&
        data.include_byok_in_limit &&
        !data.is_management_key &&
        !data.is_provisioning_key,
    };
  } catch {
    return { status: "unavailable" };
  }
}
