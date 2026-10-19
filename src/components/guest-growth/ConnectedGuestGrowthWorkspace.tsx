import { useCallback, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import { createGuestGrowthPorts } from "@/lib/guest-growth/client";
import { GuestGrowthWorkspace } from "./GuestGrowthWorkspace";

type Props = { view: GuestView; csrf: string; onDirtyChange?: (dirty: boolean) => void };
export function ConnectedGuestGrowthWorkspace(props: Props) {
  return (
    <Connected
      key={`${props.view.classId}:${props.view.teamId}:${props.view.principalId}:${props.csrf}:${props.view.accessExpiresAt}`}
      {...props}
    />
  );
}
function Connected({ view, csrf, onDirtyChange }: Props) {
  const ports = useMemo(createGuestGrowthPorts, []);
  const [guard, setGuard] = useState(false);
  const report = useCallback(
    (value: boolean) => {
      setGuard(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  const blocker = useBlocker({
    shouldBlockFn: () => guard,
    enableBeforeUnload: guard,
    withResolver: true,
  });
  return (
    <>
      <GuestGrowthWorkspace view={view} csrf={csrf} ports={ports} onDirtyChange={report} />
      {blocker.status === "blocked" && (
        <div role="alert" className="rounded-xl border bg-card p-4">
          <p>Your learning and growth activities have unsaved or unconfirmed work.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => blocker.reset()}>
              Keep editing growth activities
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed()}>
              Leave growth activities
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
