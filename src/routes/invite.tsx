import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/invitations.functions";
import {
  invitationMessage,
  takeScopedInvitationFragment,
} from "@/components/invitations/contracts";
import { ClassInvitationAcceptance } from "@/components/invitations/ClassInvitationAcceptance";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/invite")({
  headers: () => ({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  }),
  head: () => ({
    meta: [
      { title: "Private invitation — First Ten" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: InvitationPage,
});
export function InvitationPage() {
  const [capability, setCapability] =
    useState<ReturnType<typeof takeScopedInvitationFragment>>(null);
  const token = capability?.token ?? null;
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const initialized = useRef(false);
  const verifiedUser = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      setCapability(takeScopedInvitationFragment(window.location, window.history));
    }
    const replaceCapability = () => {
      generation.current++;
      setCapability(takeScopedInvitationFragment(window.location, window.history));
      setBusy(false);
      setMessage("");
    };
    window.addEventListener("hashchange", replaceCapability);
    let active = true;
    const attempt = generation.current;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active && attempt === generation.current) {
          verifiedUser.current = data.user?.id ?? null;
          setUser(data.user?.id ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (
        event !== "SIGNED_OUT" &&
        (!verifiedUser.current || session?.user.id === verifiedUser.current)
      )
        return;
      if (active) {
        generation.current++;
        setUser(null);
        setMessage("Your account changed. Reopen the original invitation after signing in.");
        setCapability(null);
      }
    });
    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener("hashchange", replaceCapability);
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <Link to="/" aria-label="First Ten home">
        <BrandLogo className="h-10 w-auto" />
      </Link>
      <h1 className="text-3xl font-bold">
        {capability?.targetType === "class" ? "A class invitation" : "A project invitation"}
      </h1>
      <p>
        Invitations apply only to the intended account and the named space. They never open private
        interviews, contacts or other owner notes. Project collaboration remains disabled until its
        shared tools are ready; class membership shares published instructions only.
      </p>
      {!ready ? (
        <p role="status">Checking your account…</p>
      ) : !user ? (
        <div>
          <p>
            Sign in with the intended account, then reopen the original invitation link. The private
            link has been removed from this address bar and is not saved here.
          </p>
          <Link to="/auth" className="inline-flex min-h-11 items-center font-semibold underline">
            Sign in
          </Link>
        </div>
      ) : !token ? (
        <p>This invitation is unavailable. Reopen the complete link the project owner gave you.</p>
      ) : capability?.targetType === "class" ? (
        <ClassInvitationAcceptance key={`${user}:${token}`} token={token} />
      ) : (
        <button
          disabled={busy}
          className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          onClick={async () => {
            if (!token || busy) return;
            setBusy(true);
            setMessage("");
            const current = generation.current;
            const result = await acceptInvitation({ data: { targetType: "project", token } });
            if (!mounted.current || current !== generation.current) return;
            setMessage(
              result.ok
                ? `Invitation accepted as ${result.data.role}. Private owner notes remain private.`
                : invitationMessage(result.code),
            );
            if (result.ok) setCapability(null);
            setBusy(false);
          }}
        >
          Accept project invitation
        </button>
      )}
      {message && (
        <p role="status" className="rounded-xl border p-4">
          {message}
        </p>
      )}
      <Link to="/account" className="inline-flex min-h-11 items-center font-semibold underline">
        Account &amp; saved work
      </Link>
    </main>
  );
}
