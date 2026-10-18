import { BrandLogo } from "@/components/BrandLogo";
import { Link } from "@tanstack/react-router";
import { useContext, useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Home,
  Megaphone,
  MessageCircle,
  Users,
  LogOut,
  ArrowUpRight,
  Map,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CurrentProjectContext } from "@/lib/current-project";

const tabs = [
  { to: "/dashboard", label: "Ladder", icon: Home },
  { to: "/contacts", label: "People", icon: Users },
  { to: "/interview", label: "Interview", icon: MessageCircle },
  { to: "/learnings", label: "Learnings", icon: BookOpen },
  { to: "/outreach", label: "Outreach", icon: Megaphone },
  { to: "/marketing", label: "Marketing Lab", icon: Map },
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [admin, setAdmin] = useState(false);
  const [signoutError, setSignoutError] = useState("");
  useEffect(() => {
    let active = true;
    const request = supabase.auth.getUser?.();
    request
      ?.then(({ data }) => {
        if (active) setAdmin(data.user?.app_metadata?.["firstten_demo_admin"] === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const project = useContext(CurrentProjectContext);
  const checklist = project?.checklist;
  const marker =
    checklist && typeof checklist === "object" && !Array.isArray(checklist)
      ? checklist["demo"]
      : null;
  const fictional =
    project?.user_id === "f1d00000-0000-4000-8000-000000000001" ||
    (marker &&
      typeof marker === "object" &&
      !Array.isArray(marker) &&
      marker["fictional"] === true);
  return (
    <div className="mx-auto min-h-screen max-w-[1600px] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <a
        href="#workspace-content"
        className="sr-only z-50 rounded-lg bg-card p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to workspace
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r bg-card/70 px-5 py-5 lg:flex">
        <Link
          to="/dashboard"
          aria-label="First Ten workspace"
          className="mb-5 inline-flex min-h-11 items-center px-2"
        >
          <BrandLogo className="h-9 w-auto" />
        </Link>
        <div className="mb-4 rounded-2xl border bg-background p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-muted-foreground">
            Your project
          </p>
          <p className="mt-2 line-clamp-2 break-words font-display text-base font-bold">
            {project?.name || "Your next idea"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Stage {project?.stage || 1} · Learn, decide, try
          </p>
        </div>
        <nav aria-label="Workspace" className="space-y-1.5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:hover:bg-primary"
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-4">
          <Link
            to="/account"
            className="flex min-h-11 items-center justify-between rounded-xl border bg-card px-4 text-sm font-semibold"
          >
            Account & saved work
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          {admin && (
            <Link
              to="/admin"
              className="flex min-h-11 items-center justify-between rounded-xl border bg-card px-4 text-sm font-semibold"
            >
              Admin dashboard
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          )}
          <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs font-medium leading-relaxed">
            Evidence → decision → one small next test
          </p>
          <Link
            to="/teacher"
            className="flex min-h-11 items-center justify-between px-2 text-sm font-medium"
          >
            Educator dashboard
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <a
            href="/pitch/index.html"
            className="flex min-h-11 items-center justify-between px-2 text-sm font-medium"
          >
            Workshop pitch
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b px-5 py-5 lg:px-10 lg:py-7">
          <div className="min-w-0">
            <Link
              to="/"
              aria-label="First Ten home"
              className="mb-2 inline-flex min-h-11 items-center lg:hidden"
            >
              <BrandLogo className="h-8 w-auto" />
            </Link>
            <p className="mb-1 hidden text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground lg:block">
              Your learning workspace
            </p>
            <h1 className="break-words text-2xl font-bold lg:text-3xl">{title}</h1>
          </div>
          <button
            aria-label="Sign out"
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm text-muted-foreground hover:bg-muted"
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (!error) window.location.assign("/auth");
              else setSignoutError("Sign-out could not be confirmed. Please try again.");
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main
          id="workspace-content"
          className="mx-auto max-w-[1200px] space-y-5 px-5 pt-6 pb-28 lg:px-10 lg:py-8"
        >
          {signoutError && (
            <p role="alert" className="rounded-xl border border-destructive p-4 text-sm">
              {signoutError}
            </p>
          )}
          {fictional && (
            <aside
              role="note"
              aria-label="Fictional demo workspace"
              className="rounded-xl border border-accent bg-accent/30 px-4 py-3 text-sm text-foreground"
            >
              <p className="font-semibold">Fictional demo workspace</p>
              <p>
                These people, conversations and drafts are examples, not customer research or
                adoption.
              </p>
            </aside>
          )}
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile workspace"
        className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-6">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-soft ${className}`}>
      {children}
    </section>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed bg-card/50 p-6 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DraftBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-draft px-2.5 py-0.5 text-[11px] font-semibold text-draft-foreground">
      AI draft — edit freely
    </span>
  );
}

export function PrivacyNote() {
  return (
    <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
      First names only — no phone numbers or emails needed. Always ask “Mind if I take a few notes?”
      before writing anything down.
    </p>
  );
}
