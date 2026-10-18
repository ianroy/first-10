import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const uuid = z.string().uuid();
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const text = (max: number) => z.string().trim().min(1).max(max);
/** Generate projectId and requestId once per intended create, retaining both on retry. */
export const createOwnedProjectSchema = z
  .object({
    projectId: uuid,
    requestId: uuid,
    name: text(200),
    description: text(4000),
    audience: text(2000),
    problem: text(4000),
    link: z.string().trim().max(2048).default(""),
  })
  .strict();
export const setOwnedProjectArchivedSchema = z
  .object({
    projectId: uuid,
    requestId: uuid,
    archived: z.boolean(),
    expectedRevision: revision,
  })
  .strict();
export const projectLifecycleSchema = z
  .object({
    id: uuid,
    name: z.string(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    lifecycleRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const errorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "INVALID_INPUT",
  "NOT_FOUND",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "UNAVAILABLE",
]);
export type ProjectLifecycle = z.infer<typeof projectLifecycleSchema>;
export type ProjectLifecycleCode = z.infer<typeof errorCodeSchema>;
export type ProjectLifecycleResult =
  | { ok: true; data: ProjectLifecycle }
  | { ok: false; code: ProjectLifecycleCode; currentRevision?: number | undefined };
const responseSchema = z.union([
  z.object({ ok: z.literal(true), data: projectLifecycleSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      code: errorCodeSchema,
      currentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    })
    .strict(),
]);
type Client = SupabaseClient<Database>;
type Operation = "create_owned_project" | "set_owned_project_archived";
async function execute<I>(
  client: Client,
  value: unknown,
  schema: z.ZodType<I, z.ZodTypeDef, unknown>,
  operation: Operation,
  args: (input: I) => Record<string, string | boolean | number | null>,
): Promise<ProjectLifecycleResult> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  try {
    // No service key, supplied owner id or claimed role. The database rechecks
    // auth.uid() and current ownership under a row lock before every replay.
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user?.id) return { ok: false, code: "AUTH_REQUIRED" };
    // Narrow adapter until the coordinator regenerates the official DB types.
    const rpc = client as unknown as Pick<SupabaseClient, "rpc">;
    const result = await rpc
      .rpc(operation, args(parsed.data))
      .abortSignal(AbortSignal.timeout(8000));
    if (result.error) return { ok: false, code: "UNAVAILABLE" };
    const output = responseSchema.safeParse(result.data);
    return output.success ? output.data : { ok: false, code: "UNAVAILABLE" };
  } catch {
    // Network/provider/database details never become user-facing messages.
    return { ok: false, code: "UNAVAILABLE" };
  }
}
export function createOwnedProject(
  client: Client,
  value: unknown,
): Promise<ProjectLifecycleResult> {
  return execute(client, value, createOwnedProjectSchema, "create_owned_project", (input) => ({
    p_project_id: input.projectId,
    p_request_id: input.requestId,
    p_name: input.name,
    p_description: input.description,
    p_audience: input.audience,
    p_problem: input.problem,
    p_link: input.link,
  }));
}
/** Archive/restore changes no content or selection. Refresh project caches on success;
 * on conflict refetch the owner row and require a new explicit user action. */
export function setOwnedProjectArchived(
  client: Client,
  value: unknown,
): Promise<ProjectLifecycleResult> {
  return execute(
    client,
    value,
    setOwnedProjectArchivedSchema,
    "set_owned_project_archived",
    (input) => ({
      p_project_id: input.projectId,
      p_request_id: input.requestId,
      p_archived: input.archived,
      p_expected_revision: input.expectedRevision,
    }),
  );
}
