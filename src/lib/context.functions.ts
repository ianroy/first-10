import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  retrievalInputSchema,
  reviewInputSchema,
  withdrawInputSchema,
  listResultSchema,
  failureSchema,
  reviewedSourceSchema,
  type PublicContextList,
} from "./context/contracts";
import {
  contextRpc,
  retrievePublicSource,
  verifyContextActor,
  verifyContextOwner,
  type ContextRpc,
} from "./context/retrieval.server";
import { publicContextRuntimeCapabilities } from "./context/runtime.server";
const projectSchema = z.object({ projectId: z.string().uuid() }).strict();
const unavailable = { ok: false, code: "UNAVAILABLE" } as const;
const resultSchema = z.union([
  failureSchema,
  z.object({ ok: z.literal(true), source: reviewedSourceSchema }).strict(),
]);
function input<T>(schema: z.ZodType<T>, value: unknown): T | null {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32768) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function oversized() {
  const length = getRequest().headers.get("content-length");
  return length !== null && (!/^\d+$/.test(length) || Number(length) > 32768);
}
const capabilitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input(projectSchema, v))
  .handler(async ({ data, context }) => {
    if (!data || oversized()) return { ok: false, code: "INVALID_INPUT" } as const;
    try {
      await verifyContextOwner(context.supabase, context.userId, data.projectId);
      return publicContextRuntimeCapabilities();
    } catch {
      return unavailable;
    }
  });
const loadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input(projectSchema, v))
  .handler(async ({ data, context }): Promise<PublicContextList> => {
    if (!data || oversized()) return { ok: false, code: "INVALID_INPUT" };
    try {
      await verifyContextActor(context.supabase, context.userId);
      const result = listResultSchema.safeParse(
        await contextRpc(context.supabase as unknown as ContextRpc, "list_public_context", {
          p_project_id: data.projectId,
        }),
      );
      return result.success ? result.data : unavailable;
    } catch {
      return unavailable;
    }
  });
const retrieveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input(retrievalInputSchema, v))
  .handler(async ({ data, context }) => {
    if (!data || oversized()) return { ok: false, code: "INVALID_INPUT" } as const;
    return retrievePublicSource(data, { supabase: context.supabase, userId: context.userId });
  });
const reviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input(reviewInputSchema, v))
  .handler(async ({ data, context }) => {
    if (!data || oversized()) return { ok: false, code: "INVALID_INPUT" } as const;
    try {
      await verifyContextActor(context.supabase, context.userId);
      const parsed = resultSchema.safeParse(
        await contextRpc(context.supabase as unknown as ContextRpc, "review_public_context", {
          p_project_id: data.projectId,
          p_preview_id: data.previewId,
          p_expected_hash: data.expectedHash,
          p_label: data.label,
          p_excerpt: data.excerpt,
          p_storage_permission: data.storagePermission,
        }),
      );
      return parsed.success ? parsed.data : unavailable;
    } catch {
      return unavailable;
    }
  });
const withdrawFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input(withdrawInputSchema, v))
  .handler(async ({ data, context }) => {
    if (!data || oversized()) return { ok: false, code: "INVALID_INPUT" } as const;
    try {
      await verifyContextActor(context.supabase, context.userId);
      const parsed = resultSchema.safeParse(
        await contextRpc(context.supabase as unknown as ContextRpc, "withdraw_public_context", {
          p_project_id: data.projectId,
          p_source_id: data.sourceId,
          p_expected_revision: data.expectedRevision,
        }),
      );
      return parsed.success ? parsed.data : unavailable;
    } catch {
      return unavailable;
    }
  });
export async function loadPublicContext(args: {
  data: z.infer<typeof projectSchema>;
}): Promise<PublicContextList> {
  try {
    return await loadFn(args);
  } catch {
    return unavailable;
  }
}
export async function retrievePublicContext(args: { data: z.infer<typeof retrievalInputSchema> }) {
  try {
    return await retrieveFn(args);
  } catch {
    return unavailable;
  }
}
export async function reviewPublicContext(args: { data: z.infer<typeof reviewInputSchema> }) {
  try {
    return await reviewFn(args);
  } catch {
    return unavailable;
  }
}
export async function withdrawPublicContext(args: { data: z.infer<typeof withdrawInputSchema> }) {
  try {
    return await withdrawFn(args);
  } catch {
    return unavailable;
  }
}
export async function probePublicContextCapabilities(args: {
  data: z.infer<typeof projectSchema>;
}) {
  try {
    return await capabilitiesFn(args);
  } catch {
    return unavailable;
  }
}
