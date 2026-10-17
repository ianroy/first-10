import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BookOpen, Home, Megaphone, MessageCircle, Users, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/dashboard", label: "Ladder", icon: Home },
  { to: "/contacts", label: "People", icon: Users },
  { to: "/interview", label: "Interview", icon: MessageCircle },
  { to: "/learnings", label: "Learnings", icon: BookOpen },
  { to: "/outreach", label: "Outreach", icon: Megaphone },
] as const;

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">First Ten</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <button
          aria-label="Sign out"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-5" />
        </button>
      </header>
      <main className="flex-1 space-y-4 px-5 pb-28">{children}</main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-6" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-card p-5 shadow-soft ${className}`}>{children}</section>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
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
      First names only — no phone numbers or emails needed. Always ask “Mind if I take a few notes?” before writing anything down.
    </p>
  );
}
