import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jsonBytes } from "./marketing-plan";
import {
  DISCOVERY_LIMITS,
  loadDiscoverySchema,
  saveDiscoverySchema,
  adoptDiscoverySchema,
  discoveryRecordSchema,
  discoveryFailureSchema,
  type LoadDiscoveryResult,
  type SaveDiscoveryResult,
  type SaveDiscoveryInput,
  type AdoptDiscoveryInput,
  type AdoptDiscoveryResult,
} from "./discovery";
const unavailable = { ok: false, code: "UNAVAILABLE" } as const;
const invalid = { ok: false, code: "INVALID_DOCUMENT" } as const;
function bounded<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (jsonBytes(value) > DISCOVERY_LIMITS.requestBytes) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function oversized() {
  const n = getRequest().headers.get("content-length");
  return n !== null && (!/^\d+$/.test(n) || Number(n) > DISCOVERY_LIMITS.requestBytes);
}
// Narrow transport until the coordinator regenerates official Database types. Runtime response
// schemas and the authenticated RPCs remain authoritative; no service client or supplied owner.
type Rpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
const loadResult = z.union([
  discoveryFailureSchema,
  z.object({ ok: z.literal(true), workspace: discoveryRecordSchema.nullable() }).strict(),
]);
const saveResult = z.union([
  discoveryFailureSchema,
  discoveryRecordSchema.extend({ ok: z.literal(true) }).strict(),
]);
const adoptResult = z.union([
  discoveryFailureSchema,
  z.object({ ok: z.literal(true), questions: z.array(z.string().max(1000)).max(20) }).strict(),
]);
const loadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => bounded(loadDiscoverySchema, value))
  .handler(async ({ data, context }): Promise<LoadDiscoveryResult> => {
    if (!data || oversized()) return invalid;
    const result = await (context.supabase as unknown as Rpc).rpc("load_discovery_workspace", {
      p_project_id: data.projectId,
    });
    if (result.error) return unavailable;
    const parsed = loadResult.safeParse(result.data);
    return parsed.success ? parsed.data : unavailable;
  });
const saveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => bounded(saveDiscoverySchema, value))
  .handler(async ({ data, context }): Promise<SaveDiscoveryResult> => {
    if (!data || oversized()) return invalid;
    const result = await (context.supabase as unknown as Rpc).rpc("save_discovery_workspace", {
      p_project_id: data.projectId,
      p_expected_revision: data.expectedRevision,
      p_mutation_id: data.mutationId,
      p_document: data.document,
    });
    if (result.error) return unavailable;
    const parsed = saveResult.safeParse(result.data);
    return parsed.success ? parsed.data : unavailable;
  });
const adoptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => bounded(adoptDiscoverySchema, value))
  .handler(async ({ data, context }): Promise<AdoptDiscoveryResult> => {
    if (!data || oversized()) return invalid;
    const result = await (context.supabase as unknown as Rpc).rpc("adopt_discovery_script", {
      p_project_id: data.projectId,
      p_expected_revision: data.expectedRevision,
      p_script_id: data.scriptId,
      p_expected_questions: data.expectedQuestions,
      p_expected_origin_id: data.expectedOriginId,
    });
    if (result.error) return unavailable;
    const parsed = adoptResult.safeParse(result.data);
    return parsed.success ? parsed.data : unavailable;
  });
function failure(error: unknown) {
  return error instanceof Error && error.message.startsWith("Unauthorized:")
    ? ({ ok: false, code: "UNAUTHENTICATED" } as const)
    : unavailable;
}
export async function loadDiscovery(input: {
  data: { projectId: string };
}): Promise<LoadDiscoveryResult> {
  try {
    return await loadFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function saveDiscovery(input: {
  data: SaveDiscoveryInput;
}): Promise<SaveDiscoveryResult> {
  try {
    return await saveFn(input);
  } catch (e) {
    return failure(e);
  }
}
export async function adoptDiscoveryScript(input: {
  data: AdoptDiscoveryInput;
}): Promise<AdoptDiscoveryResult> {
  try {
    return await adoptFn(input);
  } catch (e) {
    return failure(e);
  }
}
