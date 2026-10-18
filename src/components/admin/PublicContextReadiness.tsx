import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { probePublicContextCapabilities } from "@/lib/context.functions";

type Receipt = Awaited<ReturnType<typeof probePublicContextCapabilities>>;

/** Availability only; never changes the operator policy or retrieves a URL. */
export function PublicContextReadiness({ projectId }: { projectId: string }) {
  const probe = useServerFn(probePublicContextCapabilities);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const requests = useRef({ epoch: 0 });
  useEffect(() => {
    const state = requests.current;
    state.epoch++;
    setReceipt(null);
    setBusy(false);
    return () => {
      state.epoch++;
    };
  }, [projectId]);
  const check = async () => {
    const current = ++requests.current.epoch;
    setReceipt(null);
    setBusy(true);
    try {
      const result = await probe({ data: { projectId } });
      if (current === requests.current.epoch) setReceipt(result);
    } catch {
      if (current === requests.current.epoch) setReceipt({ ok: false, code: "UNAVAILABLE" });
    } finally {
      if (current === requests.current.epoch) setBusy(false);
    }
  };
  return (
    <Card>
      <h2 className="text-xl font-bold">Public-source import readiness</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        Check the deployed server capabilities for your selected idea before an operator considers
        enabling source imports. This check reads no source, makes no external request and changes
        no access policy.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => void check()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Checking runtime…" : "Check source import runtime"}
      </Button>
      {receipt &&
        (receipt.ok ? (
          <div role="status" className="mt-4 space-y-2 text-sm">
            <p>
              Server Node.js {receipt.nodeVersion} · {receipt.transportContract}
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(receipt.apis).map(([name, available]) => (
                <li key={name}>
                  {name}: {available ? "available" : "unavailable"}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Capability availability is not a network safety test. DNS, TLS and destination pinning
              still require a controlled deployed check. AI processing remains a separate
              permission.
            </p>
          </div>
        ) : (
          <p role="alert" className="mt-4 text-sm">
            Runtime check unavailable. Recheck access to your active idea, then retry. Source import
            policy has not changed.
          </p>
        ))}
    </Card>
  );
}
