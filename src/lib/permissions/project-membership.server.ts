import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { projectRoleSchema, type ProjectRole } from "./project-membership";
type MembershipRpc =
  | "get_member_project_summary"
  | "list_project_members"
  | "set_project_member"
  | "revoke_project_member"
  | "current_project_role";
// Temporary narrow adapter until the coordinator regenerates Database from this migration.
// Runtime response validation remains mandatory. No privileged/service client is used.
export async function membershipRpc(
  client: SupabaseClient<Database>,
  name: MembershipRpc,
  args: Record<string, string | number | null>,
) {
  const rpc = client as unknown as Pick<SupabaseClient, "rpc">;
  return await rpc.rpc(name, args).abortSignal(AbortSignal.timeout(8000));
}
/** Fresh authentication plus the current database grant. Never accepts a caller-supplied actor or role. */
export async function resolveProjectRole(
  context: { supabase: SupabaseClient<Database>; userId: string },
  projectId: string,
  bearerToken: string,
): Promise<ProjectRole | null> {
  const client = context.supabase;
  const verified = await client.auth.getUser(bearerToken);
  if (verified.error || verified.data.user?.id !== context.userId) return null;
  const result = await membershipRpc(client, "current_project_role", { p_project_id: projectId });
  if (result.error) return null;
  const parsed = projectRoleSchema.safeParse(result.data);
  return parsed.success ? parsed.data : null;
}
