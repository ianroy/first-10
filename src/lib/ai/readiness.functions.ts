import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "@/lib/admin-auth.server";
import { auditPlatformAdminAction } from "@/lib/admin-audit.server";
import { inspectRuntimeAIKey } from "./readiness.server";

/** Operator metadata only; no provider generation, policy change or secret export. */
export const getAIKeyReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({}).strict().parse(value))
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const authorization = getRequest().headers.get("authorization");
    await requirePlatformAdmin(context.supabase, authorization);
    await auditPlatformAdminAction(context.supabase, {
      operation: "ai_usage_snapshot",
      outcome: "partial",
      requestId: crypto.randomUUID(),
    });
    const readiness = await inspectRuntimeAIKey(process.env["OPENROUTER_API_KEY"]);
    await requirePlatformAdmin(context.supabase, authorization);
    await auditPlatformAdminAction(context.supabase, {
      operation: "ai_usage_snapshot",
      outcome: readiness.status === "verified" ? "ready" : "unavailable",
      requestId: crypto.randomUUID(),
    });
    return readiness;
  });
