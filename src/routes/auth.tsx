import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { selectionStorageKey } from "@/lib/project-selection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Input } from "@/components/ui/input";

type View = "student" | "educator" | "admin";
const destinations = { student: "/dashboard", educator: "/teacher", admin: "/admin" } as const;
const isView = (value: unknown): value is View =>
  value === "student" || value === "educator" || value === "admin";
export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { view?: View; callback?: boolean } => ({
    ...(isView(search["view"]) ? { view: search["view"] } : {}),
    ...(search["callback"] === true || search["callback"] === "true" ? { callback: true } : {}),
  }),
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
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { view?: View; callback?: boolean };
  const [view, setView] = useState<View>(search.view ?? "student");
  const [existingUser, setExistingUser] = useState<{ id: string; demo: boolean } | null>(null);
  const openView = useCallback(
    (target: View, userId?: string) => {
      if (userId === "f1d00000-0000-4000-8000-000000000001") {
        try {
          window.localStorage.setItem(
            selectionStorageKey(userId),
            "f1d00000-0000-4000-8000-000000000010",
          );
        } catch {
          /* Selection remains available through Account. */
        }
      }
      queryClient.clear();
      void navigate({ to: destinations[target] });
    },
    [navigate, queryClient],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "signup" | "link">("password");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let active = true;
    const emailCallback =
      search.callback === true ||
      /(?:access_token|code|token_hash)=/.test(window.location.hash + window.location.search);
    const showSession = (
      session: { user: { id: string; app_metadata?: Record<string, unknown> } } | null,
    ) => {
      if (!active) return;
      setExistingUser(
        session
          ? {
              id: session.user.id,
              demo:
                session.user.id === "f1d00000-0000-4000-8000-000000000001" &&
                session.user.app_metadata?.["synthetic"] === true,
            }
          : null,
      );
      if (emailCallback && session) {
        openView(search.view ?? "student", session.user.id);
      }
    };
    void supabase.auth.getSession().then(({ data }) => showSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      showSession(session);
      if (event === "SIGNED_OUT") setExistingUser(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [openView, search.callback, search.view]);

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
        {existingUser && (
          <div className="mt-5 rounded-xl border bg-secondary/40 p-4">
            <p className="text-sm font-semibold">
              {existingUser.demo
                ? "Workshop demo account is signed in."
                : "An account is already signed in. You can still use a different login below."}
            </p>
            {existingUser.demo ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["student", "Open student demo"],
                    ["educator", "Open educator demo"],
                    ["admin", "Open admin demo"],
                  ] as const
                ).map(([target, label]) => (
                  <button
                    key={target}
                    type="button"
                    className="min-h-11 rounded-lg border bg-card px-2 text-xs font-semibold"
                    onClick={() => openView(target, existingUser.id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 min-h-11 text-sm font-semibold underline"
                onClick={() => openView(view, existingUser.id)}
              >
                Continue my workspace
              </button>
            )}
          </div>
        )}
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
                    options: {
                      emailRedirectTo: `${window.location.origin}/auth?callback=true&view=${view}`,
                    },
                  });
                  if (error) throw error;
                  setSent(true);
                } else if (mode === "signup") {
                  const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                      emailRedirectTo: `${window.location.origin}/auth?callback=true&view=${view === "admin" ? "student" : view}`,
                    },
                  });
                  if (error) throw error;
                  if (data.session) openView(view === "admin" ? "student" : view, data.user?.id);
                  else setSent(true);
                } else {
                  const { data, error } = await supabase.auth.signInWithPassword({
                    email: address,
                    password,
                  });
                  if (error) throw error;
                  openView(view, data.user?.id);
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
            {mode === "password" && (
              <fieldset className="rounded-xl border p-3">
                <legend className="px-1 text-xs font-semibold">Choose the dashboard to open</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["student", "Student"],
                      ["educator", "Educator"],
                      ["admin", "Admin"],
                    ] as const
                  ).map(([target, label]) => (
                    <button
                      key={target}
                      type="button"
                      disabled={busy}
                      aria-pressed={view === target}
                      onClick={() => setView(target)}
                      className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${view === target ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 min-h-11 text-sm font-semibold underline underline-offset-4"
                  onClick={() => {
                    setEmail("ianroy");
                    setPassword("");
                    setMode("password");
                  }}
                >
                  Use workshop demo login
                </button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The presenter account opens all three demo views. New accounts have private
                  student and lesson-planning tools; admin access requires a server-assigned grant.
                </p>
              </fieldset>
            )}
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
