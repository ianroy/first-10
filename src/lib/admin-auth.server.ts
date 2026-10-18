import type { SupabaseClient } from "@supabase/supabase-js";

/** Request-local client using the caller bearer; never pass the service-role client. */
export type PlatformAdminClient = Pick<SupabaseClient, "auth" | "rpc">;
export class PlatformAdminAccessError extends Error {
  constructor() {
    super("Admin access denied.");
    this.name = "PlatformAdminAccessError";
  }
}

/** Both identity and the authoritative DB role are refreshed on every invocation.
 * Client/user/app metadata are deliberately ignored, including the separate demo marker.
 * No result is cached; callers must recheck immediately before privileged operations.
 */
export async function requirePlatformAdmin(
  client: PlatformAdminClient,
  authorization: string | null,
): Promise<{ userId: string }> {
  const bearer = /^Bearer ([^\s,]+)$/i.exec(authorization ?? "");
  if (!bearer?.[1] || bearer[1].length > 16384) throw new PlatformAdminAccessError();
  try {
    const verified = await client.auth.getUser(bearer[1]);
    const userId = verified.data.user?.id;
    if (
      verified.error ||
      !userId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    )
      throw new PlatformAdminAccessError();
    // The client must be request-scoped: auth.uid() in this RPC is the bearer actor.
    const checked = await client
      .rpc("get_platform_admin_authorization")
      .abortSignal(AbortSignal.timeout(8000));
    const grant = checked.data as { userId?: unknown } | null;
    if (
      checked.error ||
      !grant ||
      typeof grant !== "object" ||
      Array.isArray(grant) ||
      Object.keys(grant).length !== 1 ||
      grant.userId !== userId
    )
      throw new PlatformAdminAccessError();
    return { userId };
  } catch {
    throw new PlatformAdminAccessError();
  }
}
