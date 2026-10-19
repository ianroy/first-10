import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAIReadinessViewer } from "./readiness-access.server";
import { auditPlatformAdminAction } from "@/lib/admin-audit.server";
import { inspectRuntimeAIKey } from "./readiness.server";

/** Bounded runtime metadata only; no generation, role grant, policy change or secret export. */
export const getAIKeyReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ projectId: z.string().uuid().optional() }).strict().parse(value),
  )
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const authorization = getRequest().headers.get("authorization");
    const viewer = await requireAIReadinessViewer(context.supabase, authorization, data.projectId);
    if (viewer.kind === "platform_admin")
      await auditPlatformAdminAction(context.supabase, {
        operation: "ai_usage_snapshot",
        outcome: "partial",
        requestId: crypto.randomUUID(),
      });
    const readiness = await inspectRuntimeAIKey(process.env["OPENROUTER_API_KEY"]);
    const fresh = await requireAIReadinessViewer(context.supabase, authorization, data.projectId);
    if (fresh.userId !== viewer.userId || fresh.kind !== viewer.kind)
      throw new Error("AI runtime readiness access changed.");
    if (viewer.kind === "platform_admin")
      await auditPlatformAdminAction(context.supabase, {
        operation: "ai_usage_snapshot",
        outcome: readiness.status === "verified" ? "ready" : "unavailable",
        requestId: crypto.randomUUID(),
      });
    return readiness;
  });
