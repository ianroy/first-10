import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceIdentity } from "@/lib/project-selection";
import { aiOriginSchema } from "@/lib/ai/saved-output";

/** Metadata only, owner-authorized in SQL. A receipt is not verification of edited wording. */
export function AIOrigin({
  projectId,
  originId,
}: {
  projectId: string;
  originId: string | null | undefined;
}) {
  const scope = useWorkspaceIdentity();
  const query = useQuery({
    queryKey: ["ai-origin", scope.userId, projectId, originId],
    enabled: !!scope.userId && !!originId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ai_generation_origin", {
        p_project_id: projectId,
        p_origin_id: originId!,
      });
      if (error) throw new Error("Origin unavailable");
      return aiOriginSchema.parse(data);
    },
  });
  if (!originId)
    return (
      <p className="my-3 text-xs text-muted-foreground">
        No recorded AI origin. This may be earlier or manually written work.
      </p>
    );
  if (query.isPending)
    return (
      <p className="my-3 text-xs text-muted-foreground" role="status">
        Loading AI origin…
      </p>
    );
  if (query.isError || !query.data)
    return (
      <p className="my-3 text-xs text-muted-foreground">
        AI origin could not be loaded. Your saved text is still available.
      </p>
    );
  const origin = query.data;
  return (
    <details className="my-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-semibold">AI draft origin</summary>
      <p className="mt-2">
        Based on a recorded AI draft. Current wording may include your edits; check claims against
        the original evidence.
      </p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 break-words">
        <dt>Model reported</dt>
        <dd>{origin.actualModel ?? "Not reported"}</dd>
        <dt>Model requested</dt>
        <dd>{origin.requestedModel}</dd>
        <dt>Provider reported</dt>
        <dd>{origin.provider ?? "Not reported"}</dd>
        <dt>Prompt</dt>
        <dd>
          {origin.promptId} · version {origin.promptVersion}
        </dd>
        <dt>Output schema</dt>
        <dd>
          {origin.schemaId} · version {origin.schemaVersion}
        </dd>
        <dt>Generated</dt>
        <dd>
          <time dateTime={origin.createdAt}>{new Date(origin.createdAt).toLocaleString()}</time>
        </dd>
        <dt>Reported cost</dt>
        <dd>{origin.costUsd === null ? "Not reported" : `$${origin.costUsd.toFixed(6)}`}</dd>
      </dl>
    </details>
  );
}
