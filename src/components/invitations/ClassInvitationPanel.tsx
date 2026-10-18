import { useEffect, useRef, useState } from "react";
import {
  createInvitation,
  listClassInvitations,
  revokeClassInvitation,
} from "@/lib/invitations.functions";
import { invitationMessage, type ClassInvitation } from "./contracts";
/** Class-owner management only; server/database independently recheck authority. */
export function ClassInvitationPanel({ classId }: { classId: string }) {
  return <Panel key={classId} classId={classId} />;
}
function Panel({ classId }: { classId: string }) {
  const [recipient, setRecipient] = useState("");
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<ClassInvitation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const refresh = async () => {
    const result = await listClassInvitations({ data: { classId } });
    if (!alive.current) return;
    if (result.ok) {
      setItems(result.data.items);
      setCursor(result.data.nextCursor);
    } else setMessage(invitationMessage(result.code));
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section
      aria-label="Class student invitations"
      className="space-y-4 rounded-2xl border bg-card p-5"
    >
      <h2 className="text-xl font-bold">Invite a student account</h2>
      <p className="text-sm">
        This link admits only the named account as a student. It grants no teacher authority or
        private-project access. Account-free class entry is a later feature. Share the link
        yourself; First Ten sends no message.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          setLink("");
          const payload = JSON.stringify({ recipient, days });
          if (!request.current || request.current.payload !== payload)
            request.current = { payload, id: crypto.randomUUID() };
          const result = await createInvitation({
            data: {
              targetType: "class",
              targetId: classId,
              recipientId: recipient.trim(),
              role: "student",
              expiresInDays: days,
              requestId: request.current.id,
            },
          });
          if (!alive.current) return;
          if (result.ok) {
            request.current = null;
            if (result.token) {
              const url = new URL("/invite", window.location.origin);
              url.hash = `class-invite=${result.token}`;
              setLink(url.toString());
              setMessage(
                "Copy the private link now. The secret is shown once and cannot be recovered.",
              );
            } else
              setMessage(
                "This invitation was created earlier. Revoke it below and create another link; its secret cannot be recovered.",
              );
            await refresh();
          } else setMessage(invitationMessage(result.code));
          if (alive.current) setBusy(false);
        }}
      >
        <label className="block text-sm font-semibold">
          Student account ID
          <input
            required
            autoComplete="off"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-xl border px-3"
          />
        </label>
        <label className="block text-sm font-semibold">
          Class invitation expiry in days
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 block min-h-11 rounded-xl border px-3"
          />
        </label>
        <button
          disabled={busy}
          className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
        >
          Create student invitation
        </button>
      </form>
      {link && (
        <div>
          <label className="block text-sm font-semibold">
            Private class invitation
            <input
              readOnly
              autoComplete="off"
              value={link}
              className="mt-1 block min-h-11 w-full rounded-xl border px-3"
            />
          </label>
          <button
            className="min-h-11 font-semibold underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setMessage("Class invitation copied. Share it only with the named student.");
              } catch {
                setMessage("Copy the visible link manually.");
              }
            }}
          >
            Copy class invitation
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <p className="text-xs">
        Revoking an invitation blocks future acceptance. Remove an already enrolled student
        separately.
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="mb-3 rounded-xl border p-3 text-sm">
            <p>
              Student account {item.recipientId} ·{" "}
              {item.revokedAt ? "Revoked" : item.acceptedAt ? "Accepted" : "Pending"}
            </p>
            <p>Expires {new Date(item.expiresAt).toLocaleDateString()}</p>
            {!item.revokedAt && (
              <button
                disabled={busy}
                className="min-h-11 font-semibold underline"
                onClick={async () => {
                  setBusy(true);
                  setLink("");
                  const result = await revokeClassInvitation({
                    data: { classId, invitationId: item.id, requestId: crypto.randomUUID() },
                  });
                  if (!alive.current) return;
                  setMessage(
                    result.ok ? "Class invitation revoked." : invitationMessage(result.code),
                  );
                  await refresh();
                  if (alive.current) setBusy(false);
                }}
              >
                Revoke class invitation
              </button>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          disabled={busy}
          className="min-h-11 font-semibold underline"
          onClick={async () => {
            if (!cursor) return;
            setBusy(true);
            const result = await listClassInvitations({ data: { classId, cursor } });
            if (!alive.current) return;
            if (result.ok) {
              setItems((previous) => [
                ...previous,
                ...result.data.items.filter(
                  (item) => !previous.some((saved) => saved.id === item.id),
                ),
              ]);
              setCursor(result.data.nextCursor);
            } else setMessage(invitationMessage(result.code));
            setBusy(false);
          }}
        >
          Load more class invitations
        </button>
      )}
    </section>
  );
}
