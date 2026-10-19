import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAI } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import {
  runtimeCaseIdSchema,
  runtimeCaseOperationId,
  runtimeEvaluationReceiptSchema,
  type RuntimeCaseId,
} from "@/lib/ai/runtime-evaluation-contract";
import type { z } from "zod";

export function RuntimeAIEvaluation({ projectId }: { projectId: string }) {
  const generate = useServerFn(generateAI);
  const [caseId, setCaseId] = useState<RuntimeCaseId>(runtimeCaseIdSchema.options[0]);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [message, setMessage] = useState("");
  const [receipts, setReceipts] = useState<z.infer<typeof runtimeEvaluationReceiptSchema>[]>([]);
  const sent = useRef(new Set<string>());
  const eligible = projectId === "f1d00000-0000-4000-8000-000000000010";
  const run = async () => {
    if (!eligible || busy || stopped || sent.current.has(caseId)) return;
    const selected = caseId;
    sent.current.add(selected);
    setBusy(true);
    setMessage("");
    try {
      const raw = await generate({
        data: {
          kind: "runtime_evaluation",
          projectId,
          evaluationCaseId: selected,
          operationId: runtimeCaseOperationId(selected),
        },
      });
      const result = runtimeEvaluationReceiptSchema.parse(raw);
      if (result.caseId !== selected || result.operationId !== runtimeCaseOperationId(selected))
        throw new Error("Mismatched fixed case");
      setReceipts((old) => [...old, result]);
      setMessage(
        "Fictional draft received and its reported charge recorded. Review its claims before considering a live route.",
      );
    } catch {
      setStopped(true);
      setMessage(
        "Model checks stopped. The policy may still be closed, or the outcome needs reconciliation. No new request or automatic retry will be started here.",
      );
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ version: "first-ten-runtime-evaluation-v7", receipts }, null, 2)],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "first-ten-fictional-model-checks-v7.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-label="Fixed fictional model checks" className="mt-6 space-y-4 border-t pt-5">
      <h3 className="font-semibold">Fixed fictional model checks</h3>
      <p className="text-sm text-muted-foreground">
        Eight prepared cases cover questions, synthesis and growth drafts. No editable project text
        or student notes are sent. These checks require a separately approved evaluation allowance
        within the existing $25 total; they do not enable ordinary generation.
      </p>
      <label className="block text-sm font-semibold">
        Prepared case
        <select
          className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3"
          value={caseId}
          disabled={busy || stopped}
          onChange={(event) => setCaseId(runtimeCaseIdSchema.parse(event.target.value))}
        >
          {runtimeCaseIdSchema.options.map((id) => (
            <option key={id} value={id}>
              {id.replaceAll("-", " ")}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={!eligible || busy || stopped || sent.current.has(caseId)}
        onClick={() => void run()}
      >
        {busy ? "Checking the fixed case…" : "Run this fictional model check"}
      </Button>
      {!eligible && (
        <p className="text-sm">
          Available only in the exact authorized fictional presenter workspace.
        </p>
      )}
      {message && (
        <p role={stopped ? "alert" : "status"} className="text-sm">
          {message}
        </p>
      )}
      {receipts.length > 0 && (
        <>
          <Button variant="outline" onClick={download}>
            Download model-check receipts
          </Button>
          {receipts.map((result) => (
            <details key={result.operationId} className="rounded-xl border p-4">
              <summary className="font-semibold">
                {result.caseId} · ${result.costUsd.toFixed(6)} · fictional
              </summary>
              <p className="mt-3 text-xs">
                {result.model} · {result.provider} · {Math.round(result.latencyMs)}ms
              </p>
              <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify({ draft: result.draft, grounding: result.grounding }, null, 2)}
              </pre>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
