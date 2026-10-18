import { ActivityExportLauncher } from "@/components/export/ActivityExportLauncher";
import { livePracticeActivities } from "@/lib/export/demo-adapters";
import { useEffect, useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { generateAI } from "@/lib/ai.functions";
import { aiOutputSchemas } from "@/lib/ai/contracts";
import { Card } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
const responseSchema = z
  .object({
    draft: aiOutputSchemas.marketing_demo,
    metadata: z
      .object({
        requestId: z.string().uuid(),
        promptVersion: z.string(),
        model: z.literal("google/gemini-2.5-flash-lite"),
        provider: z.string(),
        costUsd: z.number().nonnegative().max(0.02).nullable(),
        reservedCents: z.literal(2),
        remainingCents: z.number().int().nonnegative().nullable(),
        latencyMs: z.number().nonnegative(),
        fictional: z.literal(true),
      })
      .strict(),
  })
  .strict();
export function LiveMarketingPractice({
  projectId,
  onStateChange,
}: {
  projectId: string;
  onStateChange?: (state: { busy: boolean; hasDraft: boolean }) => void;
}) {
  const generate = useServerFn(generateAI);
  const id = useId();
  const [result, setResult] = useState<z.infer<typeof responseSchema> | null>(null);
  const [body, setBody] = useState("");
  const [previousDrafts, setPreviousDrafts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onStateChange?.({ busy, hasDraft: result !== null });
  }, [busy, result, onStateChange]);
  return (
    <Card className="border-primary/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
            Optional live AI practice · fictional case only
          </p>
          <h3 className="mt-3 text-2xl font-bold">
            A draft to question, improve and make your own
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Try an economical AI model on the prepared StudyLoop case. It sees no private notes or
            text from your plan. You decide whether the invitation is truthful, useful and
            appropriate.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const response = await generate({ data: { kind: "marketing_demo", projectId } });
              const parsed = responseSchema.safeParse(response);
              if (!parsed.success)
                throw new Error(
                  "The practice response could not be checked. Use the prepared example.",
                );
              if (result) setPreviousDrafts((previous) => [...previous, body]);
              setResult(parsed.data);
              setBody(parsed.data.draft.body);
            } catch {
              setError(
                "The live practice draft is unavailable. Your saved plan and previous draft are unchanged. Use the prepared example or keep writing your own invitation.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing a practice draft…" : "Draft a $0 invitation with AI"}
        </Button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Presenter practice only. Each request reserves at most 2¢ from a fixed $1 workshop
        allowance. This route has no automatic retries or provider fallback. No content is posted or
        added to your saved plan.
      </p>
      {busy && (
        <p role="status" className="mt-4 text-sm">
          Preparing a fictional draft. Your saved plan remains available.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-destructive-soft p-4 text-sm">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-6 space-y-5 border-t pt-5">
          <p
            role="status"
            className="rounded-xl bg-draft p-3 text-sm font-semibold text-draft-foreground"
          >
            AI practice proposal · fictional, untested and unsent
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              ["Proposed channel", result.draft.channel],
              ["Hook", result.draft.hook],
              ["Access to investigate", result.draft.accessCheck],
              ["Peer check", result.draft.peerCheck],
              ["What to measure", result.draft.measurement],
              ["What remains uncertain", result.draft.uncertainty],
            ].map(([label, value]) => (
              <div key={label}>
                <h4 className="text-sm font-bold">{label}</h4>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
          <label className="block">
            <span id={`${id}-label`} className="text-sm font-bold">
              Edit the AI practice draft
            </span>
            <Textarea
              aria-labelledby={`${id}-label`}
              disabled={busy}
              className="mt-2"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <span className="mt-2 block text-xs text-muted-foreground">
              Temporary practice text. Review permissions, claims and the useful action before using
              any part of it.
            </span>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setBody("");
              setPreviousDrafts([]);
              setError("");
            }}
          >
            Discard temporary AI practice draft
          </Button>
          <p className="text-sm">
            <strong>Suggested next action: </strong>
            {result.draft.cta}
          </p>
          {previousDrafts.length > 0 && (
            <details className="rounded-xl border p-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                Previous practice drafts ({previousDrafts.length}) · temporary
              </summary>
              <ol className="mt-4 space-y-4">
                {previousDrafts.map((draft, index) => (
                  <li key={index} className="whitespace-pre-wrap border-t pt-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Earlier review text {index + 1}
                    </p>
                    {draft}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <ActivityExportLauncher
            activities={livePracticeActivities(result, body, previousDrafts)}
          />
          <dl className="grid gap-2 rounded-xl bg-muted p-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Model and provider</dt>
              <dd>
                {result.metadata.model} · {result.metadata.provider}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Reported request cost</dt>
              <dd>
                {result.metadata.costUsd === null
                  ? "Unavailable; 2¢ reservation retained"
                  : `$${result.metadata.costUsd.toFixed(6)}`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Prompt version</dt>
              <dd>{result.metadata.promptVersion}</dd>
            </div>
            <div>
              <dt className="font-semibold">Workshop allowance remaining</dt>
              <dd>
                {result.metadata.remainingCents === null
                  ? "Unavailable"
                  : `$${(result.metadata.remainingCents / 100).toFixed(2)} reserved-budget balance`}
              </dd>
            </div>
          </dl>
        </div>
      )}
      <a
        href="/demo?view=marketing#marketing-lab"
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
      >
        Use the prepared marketing example
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </Card>
  );
}
