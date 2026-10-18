import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { failureSchema, type PublicContextFailure, type RetrievalInput } from "./contracts";
import { PublicRetrievalError, publicURL, githubPath, githubTarget } from "./url-policy.server";
import { retrieveWebsite, sha256 } from "./extract.server";
import { retrieveGithub } from "./github.server";
export type ContextRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
};
export async function contextRpc(
  client: ContextRpc,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  if (result.error) throw new PublicRetrievalError("UNAVAILABLE");
  return result.data;
}
export async function verifyContextActor(supabase: SupabaseClient, actor: string): Promise<void> {
  const token = getRequest()
    .headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new PublicRetrievalError("NOT_FOUND");
  const user = await supabase.auth.getUser(token);
  if (user.error || user.data.user?.id !== actor) throw new PublicRetrievalError("NOT_FOUND");
}
export async function verifyContextOwner(
  supabase: SupabaseClient,
  actor: string,
  projectId: string,
): Promise<void> {
  await verifyContextActor(supabase, actor);
  const project = await supabase
    .from("projects")
    .select("id,user_id,archived_at")
    .eq("id", projectId)
    .eq("user_id", actor)
    .single();
  if (project.error || !project.data || project.data.user_id !== actor || project.data.archived_at)
    throw new PublicRetrievalError("NOT_FOUND");
}
async function serviceForOwner(
  supabase: SupabaseClient,
  actor: string,
  projectId: string,
): Promise<ContextRpc> {
  await verifyContextOwner(supabase, actor, projectId);
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"])
    throw new PublicRetrievalError("UNAVAILABLE");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as ContextRpc;
}
const begun = z.union([
  failureSchema,
  z
    .object({
      ok: z.literal(true),
      attemptId: z.string().uuid(),
      leaseUntil: z.string().datetime({ offset: true }),
    })
    .strict(),
]);
const completed = z.union([failureSchema, z.object({ ok: z.literal(true) }).strict()]);
export async function retrievePublicSource(
  input: RetrievalInput,
  scope: { supabase: SupabaseClient; userId: string },
): Promise<PublicContextFailure | { ok: true }> {
  let service: ContextRpc | undefined;
  let attemptId: string | undefined;
  try {
    const url = publicURL(input.url).href;
    const paths = input.kind === "github" ? input.paths.map(githubPath) : [];
    if (input.kind === "website" && input.paths.length)
      throw new PublicRetrievalError("INVALID_INPUT");
    if (input.kind === "github") githubTarget(url);
    service = await serviceForOwner(scope.supabase, scope.userId, input.projectId);
    const receipt = begun.parse(
      await contextRpc(service, "begin_public_context_retrieval", {
        p_actor: scope.userId,
        p_project_id: input.projectId,
        p_operation_id: input.operationId,
        p_kind: input.kind,
        p_request_sha256: sha256(
          JSON.stringify({ kind: input.kind, url, paths, previewPermission: true }),
        ),
      }),
    );
    if (!receipt.ok) return receipt;
    attemptId = receipt.attemptId;
    if (Date.parse(receipt.leaseUntil) <= Date.now()) throw new PublicRetrievalError("UNAVAILABLE");
    const sources =
      input.kind === "website" ? await retrieveWebsite(url) : await retrieveGithub(url, paths);
    const saved = completed.parse(
      await contextRpc(service, "complete_public_context_retrieval", {
        p_operation_id: input.operationId,
        p_attempt_id: attemptId,
        p_sources: sources,
      }),
    );
    if (!saved.ok) throw new PublicRetrievalError(saved.code);
    return saved;
  } catch (error) {
    const code = error instanceof PublicRetrievalError ? error.code : "UNAVAILABLE";
    if (service && attemptId) {
      try {
        await contextRpc(service, "fail_public_context_retrieval", {
          p_operation_id: input.operationId,
          p_attempt_id: attemptId,
          p_code: code === "UNSAFE_SOURCE" ? code : "UNAVAILABLE",
        });
      } catch {
        /* A missing acknowledgement never authorizes another fetch or erases prior previews. */
      }
    }
    const parsed = failureSchema.safeParse({ ok: false, code });
    return parsed.success ? parsed.data : { ok: false, code: "UNAVAILABLE" };
  }
}
