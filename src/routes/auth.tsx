import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — First Ten" },
      {
        name: "description",
        content: "Sign in to First Ten with a magic link. No password needed.",
      },
      { property: "og:title", content: "Sign in — First Ten" },
      { property: "og:description", content: "Sign in to First Ten with a magic link." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && navigate({ to: "/dashboard" }));
    const { data } = supabase.auth.onAuthStateChange(
      (_e, s) => s && navigate({ to: "/dashboard" }),
    );
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">First Ten</p>
      <h1 className="mt-2 text-4xl font-bold">Let’s find your first customers.</h1>
      {sent ? (
        <div className="mt-8 rounded-2xl bg-secondary p-5 text-secondary-foreground">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-1 text-sm">We sent a sign-in link to {email}. Open it on this device.</p>
          <button className="mt-3 text-sm underline" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form
          className="mt-8 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: `${window.location.origin}/auth` },
            });
            setBusy(false);
            if (error) setErr(error.message);
            else setSent(true);
          }}
        >
          <Input
            type="email"
            required
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-2xl text-base"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button size="xl" disabled={busy}>
            {busy ? "Sending…" : "Email me a magic link"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">No password. Just a link.</p>
        </form>
      )}
    </div>
  );
}
