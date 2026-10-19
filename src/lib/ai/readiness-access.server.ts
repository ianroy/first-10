import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "@/lib/admin-auth.server";

const presenterId = "f1d00000-0000-4000-8000-000000000001";
const projectId = "f1d00000-0000-4000-8000-000000000010";
const fixture = "first-ten-babson-2026-10-18-v1";
const denied = () => new Error("AI runtime readiness access denied.");

/** A fixed fictional-presenter metadata permission, never a platform role grant. */
export async function requireAIReadinessViewer(
  client: SupabaseClient,
  authorization: string | null,
  selectedProjectId?: string,
): Promise<{ userId: string; kind: "platform_admin" | "fictional_presenter" }> {
  const bearer = /^Bearer ([^\s,]+)$/i.exec(authorization ?? "");
  if (!bearer?.[1] || bearer[1].length > 16384) throw denied();
  const verified = await client.auth.getUser(bearer[1]).catch(() => null);
  const user = verified?.data.user;
  if (!user || verified?.error) throw denied();
  if (user.id === presenterId && selectedProjectId === projectId) {
    if (
      user.app_metadata?.["synthetic"] !== true ||
      user.app_metadata?.["firstten_demo_admin"] !== true ||
      user.app_metadata?.["firstten_demo_fixture"] !== fixture
    )
      throw denied();
    const owned = await client
      .from("projects")
      .select("id,user_id,demo:checklist->demo")
      .eq("id", projectId)
      .eq("user_id", presenterId)
      .is("archived_at", null)
      .abortSignal(AbortSignal.timeout(8000))
      .maybeSingle();
    const marker = owned.data?.demo as Record<string, unknown> | null | undefined;
    if (
      owned.error ||
      owned.data?.id !== projectId ||
      owned.data?.user_id !== presenterId ||
      !marker ||
      marker["fictional"] !== true ||
      marker["fixtureVersion"] !== fixture
    )
      throw denied();
    return { userId: user.id, kind: "fictional_presenter" };
  }
  const admin = await requirePlatformAdmin(client, authorization);
  return { ...admin, kind: "platform_admin" };
}
