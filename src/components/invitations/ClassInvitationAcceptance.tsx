import { useEffect, useRef, useState } from "react";
import { acceptInvitation } from "@/lib/invitations.functions";
import { invitationMessage } from "./contracts";
/** Parent has freshly verified auth and stripped #class-invite from /invite.
 * Remount on account/token change; no token is persisted or placed in queries. */
export function ClassInvitationAcceptance({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted?: (classId: string) => void;
}) {
  return <Acceptance key={token} token={token} {...(onAccepted ? { onAccepted } : {})} />;
}
function Acceptance({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted?: (classId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <section
      aria-label="Join an invited class"
      className="space-y-4 rounded-2xl border bg-card p-5"
    >
      <h2 className="text-xl font-bold">Join as a student</h2>
      <p className="text-sm">
        Use a chosen classroom alias. Joining reveals class instructions and published assignments;
        it shares no private project, interview notes or AI permission. Guest participation without
        a personal account is not available yet.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !label.trim()) return;
          setBusy(true);
          setMessage("");
          const result = await acceptInvitation({
            data: { targetType: "class", token, displayLabel: label.trim() },
          });
          if (!alive.current) return;
          if (result.ok && "classId" in result.data) {
            setMessage("Class joined. Your private projects remain private.");
            onAccepted?.(result.data.classId);
          } else
            setMessage(
              result.ok ? "This class invitation is unavailable." : invitationMessage(result.code),
            );
          setBusy(false);
        }}
      >
        <label className="block text-sm font-semibold">
          Your classroom alias
          <input
            required
            maxLength={80}
            autoComplete="off"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-2 block min-h-11 w-full rounded-xl border px-3"
          />
        </label>
        <button
          disabled={busy || !label.trim()}
          className="mt-4 min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
        >
          Accept class invitation
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
