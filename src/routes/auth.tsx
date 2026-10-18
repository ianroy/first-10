import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — First Ten" },
      {
        name: "description",
        content:
          "Sign in with email and password, create a private account, or request an email link.",
      },
      { property: "og:title", content: "Sign in — First Ten" },
      { property: "og:description", content: "Sign in, create an account or use an email link." },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "signup" | "link">("password");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && navigate({ to: "/dashboard" }));
    const { data } = supabase.auth.onAuthStateChange(
      (_e, session) => session && navigate({ to: "/dashboard" }),
    );
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-20">
      <div>
        <Link to="/" aria-label="First Ten home">
          <BrandLogo className="h-10 w-auto" />
        </Link>
        <p className="mt-12 text-xs font-semibold uppercase tracking-widest text-primary">
          Conversations → decisions → action
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight lg:text-6xl">
          Your next move starts with a real conversation.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Keep what you hear, question your assumptions and decide what to try. Your project stays
          private to your account.
        </p>
        <Link
          to="/demo"
          className="mt-6 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Explore the example first →
        </Link>
      </div>
      <section aria-label="Sign in" className="rounded-3xl border bg-card p-6 shadow-soft lg:p-10">
        <h2 className="text-2xl font-bold">Continue your learning</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in, create an account, or use an email link.
        </p>
        {sent ? (
          <div
            role="status"
            className="mt-8 rounded-2xl bg-secondary p-5 text-secondary-foreground"
          >
            <p className="font-semibold">Check your inbox</p>
            <p className="mt-1 text-sm">
              Check {email} for a confirmation or sign-in link. If your account is eligible, the
              email will arrive shortly.
            </p>
            <button className="mt-3 min-h-11 text-sm underline" onClick={() => setSent(false)}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setErr("");
              try {
                const address =
                  email.trim().toLowerCase() === "ianroy"
                    ? "workshop-presenter@firstten-demo.invalid"
                    : email.trim();
                if (mode === "link") {
                  const { error } = await supabase.auth.signInWithOtp({
                    email: address,
                    options: { emailRedirectTo: `${window.location.origin}/auth` },
                  });
                  if (error) throw error;
                  setSent(true);
                } else if (mode === "signup") {
                  const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/auth` },
                  });
                  if (error) throw error;
                  if (data.session) navigate({ to: "/dashboard" });
                  else setSent(true);
                } else {
                  const { error } = await supabase.auth.signInWithPassword({
                    email: address,
                    password,
                  });
                  if (error) throw error;
                  navigate({ to: "/dashboard" });
                }
              } catch (error) {
                setErr(
                  error instanceof Error ? error.message : "Could not sign in. Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div
              className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
              aria-label="Account options"
            >
              {(
                [
                  ["password", "Sign in"],
                  ["signup", "Create account"],
                  ["link", "Email link"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={busy}
                  className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${mode === value ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => {
                    setMode(value);
                    setErr("");
                    setPassword("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label htmlFor="signin-email" className="block text-sm font-semibold">
              {mode === "password" ? "Email or demo username" : "Your email"}
            </label>
            <Input
              id="signin-email"
              autoComplete="username"
              type={mode === "password" ? "text" : "email"}
              required
              placeholder={
                mode === "password" ? "you@school.edu or demo username" : "you@school.edu"
              }
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-xl"
            />
            {mode !== "link" && (
              <div className="space-y-2">
                <label htmlFor="signin-password" className="block text-sm font-semibold">
                  Password
                </label>
                <Input
                  id="signin-password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 rounded-xl"
                />
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters. New accounts have a private workspace and no admin
                    access.
                  </p>
                )}
              </div>
            )}
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
            <Button size="xl" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create my account"
                  : mode === "link"
                    ? "Email me a magic link"
                    : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {mode === "link"
                ? "No password. Just a link."
                : "Your password is handled securely by Supabase Auth."}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
