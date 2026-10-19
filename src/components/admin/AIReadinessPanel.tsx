import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getAIKeyReadiness } from "@/lib/ai/readiness.functions";
import type { AIKeyReadiness } from "@/lib/ai/readiness.server";
import { RuntimeAIEvaluation } from "./RuntimeAIEvaluation";

export function AIReadinessPanel({ projectId }: { projectId: string }) {
  const inspect = useServerFn(getAIKeyReadiness);
  const [result, setResult] = useState<AIKeyReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const requests = useRef({ epoch: 0 });
  useEffect(() => {
    const state = requests.current;
    return () => {
      state.epoch++;
    };
  }, []);
  const check = async () => {
    const epoch = ++requests.current.epoch;
    setBusy(true);
    setDenied(false);
    setResult(null);
    try {
      const value = await inspect({ data: { projectId } });
      if (requests.current.epoch === epoch) setResult(value);
    } catch {
      if (requests.current.epoch === epoch) setDenied(true);
    } finally {
      if (requests.current.epoch === epoch) setBusy(false);
    }
  };
  return (
    <Card>
      <h2 className="text-xl font-bold">Live AI readiness</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        Verify the deployed OpenRouter credential and its spending limit. This free check sends no
        student work, generates no draft and changes no settings. Access requires a platform
        administrator or the exact authorized fictional presenter workspace. This grants no admin
        role.
      </p>
      <Button className="mt-4" variant="outline" onClick={() => void check()} disabled={busy}>
        {busy ? "Checking OpenRouter…" : "Check deployed AI credential"}
      </Button>
      {denied && (
        <p role="alert" className="mt-4 text-sm">
          This check could not be authorized or verified. It is limited to platform administrators
          and the exact authorized fictional presenter workspace.
        </p>
      )}
      {result && (
        <div role="status" className="mt-4 space-y-2 text-sm">
          {result.status === "verified" ? (
            <>
              <p>The deployed credential was accepted by OpenRouter.</p>
              <p>
                Key limit: {result.limitUsd === null ? "unlimited" : `$${result.limitUsd}`} ·
                Remaining: {result.remainingUsd === null ? "unknown" : `$${result.remainingUsd}`}
              </p>
              <p>
                Non-resetting $25 key ceiling with BYOK included:{" "}
                {result.withinRunKeyCeiling ? "verified" : "not verified"}.
              </p>
              <p>
                Reported key usage: ${result.usageUsd} · Resets: {result.resetting ? "yes" : "no"} ·
                BYOK spend included: {result.includesByok ? "yes" : "no"}.
              </p>
              <p>OpenRouter workspace: {result.workspaceId ?? "unavailable"}.</p>
              <p className="text-muted-foreground">
                A working key does not enable generation. Application allowances, provider privacy,
                model evaluation and the generation stop remain separate checks.
              </p>
            </>
          ) : (
            <p>
              {result.status === "unconfigured"
                ? "The deployed server has no configured OpenRouter credential."
                : "OpenRouter credential metadata could not be verified. No generation was attempted."}
            </p>
          )}
        </div>
      )}
      <RuntimeAIEvaluation key={projectId} projectId={projectId} />
    </Card>
  );
}
