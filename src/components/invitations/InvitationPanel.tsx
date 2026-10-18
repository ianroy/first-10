import { useEffect, useRef, useState } from "react";
import { createInvitation, listInvitations, revokeInvitation } from "@/lib/invitations.functions";
import { invitationMessage, type Invitation } from "./contracts";

/** Mount with key=userId:projectId. Owner authorization is enforced again by
 * every server/RPC call; this panel never sends mail or looks up other users. */
export function InvitationPanel({ projectId }: { projectId: string }) {
  return <InvitationPanelBody key={projectId} projectId={projectId} />;
}
function InvitationPanelBody({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const pending = useRef<{ requestId: string; payload: string } | null>(null);
  const refresh = async () => {
    const result = await listInvitations({ data: { projectId } });
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
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Project invitations">
      <h2 className="text-xl font-bold">Invite to a shared project</h2>
      <p className="text-sm">
        Collaboration remains disabled until shared tools are ready. Creating an invitation does not
        publish private notes. Ask the intended person to share their account ID; this tool never
        searches emails or sends messages.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          setLink("");
          const payload = JSON.stringify({ recipientId, role, days });
          if (!pending.current || pending.current.payload !== payload)
            pending.current = { requestId: crypto.randomUUID(), payload };
          const result = await createInvitation({
            data: {
              targetType: "project",
              targetId: projectId,
              recipientId,
              role,
              expiresInDays: days,
              requestId: pending.current.requestId,
            },
          });
          if (!alive.current) return;
          if (result.ok) {
            pending.current = null;
            if (result.token) {
              const url = new URL("/invite", window.location.origin);
              url.hash = `invite=${result.token}`;
              setLink(url.toString());
              setMessage(
                "Copy this private link now. Its secret is shown only once and cannot be recovered.",
              );
            } else
              setMessage(
                "This invitation was created earlier. Its secret cannot be recovered. Revoke it below, then create a new link.",
              );
            await refresh();
          } else setMessage(invitationMessage(result.code));
          if (alive.current) setBusy(false);
        }}
      >
        <label className="block text-sm font-semibold">
          Recipient account ID
          <input
            required
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value.trim())}
            className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3"
          />
        </label>
        <label className="block text-sm font-semibold">
          Shared-space role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            className="mt-1 block min-h-11 rounded-xl border px-3"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Expires in days
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
          Create private invite link
        </button>
      </form>
      {link && (
        <div>
          <label className="block text-sm font-semibold">
            Private invitation link
            <input
              readOnly
              value={link}
              className="mt-1 block min-h-11 w-full rounded-xl border px-3"
            />
          </label>
          <button
            className="min-h-11 font-semibold underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setMessage("Private link copied. Share it only with the intended recipient.");
              } catch {
                setMessage("Copy the selected link manually.");
              }
            }}
          >
            Copy private link
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <p className="text-xs">
        Revoking a link blocks further acceptance. It does not remove a membership already accepted;
        membership revocation is a separate owner action.
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border p-3 text-sm">
            <p>
              {item.role} · recipient {item.recipientId}
            </p>
            <p>
              Expires {new Date(item.expiresAt).toLocaleDateString()} ·{" "}
              {item.revokedAt ? "Revoked" : item.acceptedAt ? "Accepted" : "Pending"}
            </p>
            {!item.revokedAt && (
              <button
                disabled={busy}
                className="min-h-11 font-semibold underline"
                onClick={async () => {
                  setBusy(true);
                  setLink("");
                  const result = await revokeInvitation({
                    data: { projectId, invitationId: item.id, requestId: crypto.randomUUID() },
                  });
                  if (!alive.current) return;
                  setMessage(
                    result.ok ? "Invitation link revoked." : invitationMessage(result.code),
                  );
                  await refresh();
                  if (alive.current) setBusy(false);
                }}
              >
                Revoke invitation
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
            const result = await listInvitations({ data: { projectId, cursor } });
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
          Load more invitations
        </button>
      )}
    </section>
  );
}
