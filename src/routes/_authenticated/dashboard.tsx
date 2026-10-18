import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Pencil } from "lucide-react";
import { AppShell, Card, Empty } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import {
  PIPELINE,
  stageProgress,
  useContacts,
  useExperiments,
  useInterviews,
  useLearnings,
  type Project,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your ladder — First Ten" },
      { name: "description", content: "Track your climb from 10 to 50 to 100 customers." },
    ],
  }),
  component: () => <RequireProject>{(p) => <Dashboard p={p} />}</RequireProject>,
});

function Dashboard({ p }: { p: Project }) {
  const { data: contacts = [] } = useContacts(p.id);
  const { data: interviews = [] } = useInterviews(p.id);
  const { data: learnings = [] } = useLearnings(p.id);
  const { data: experiments = [] } = useExperiments(p.id);
  const prog = stageProgress(contacts, interviews);
  const rungs = [
    { stage: 3, goal: 100, val: prog.s3, label: "Next 100", sub: "Scalable channels" },
    { stage: 2, goal: 50, val: prog.s2, label: "Next 50", sub: "Referrals & communities" },
    { stage: 1, goal: 10, val: prog.s1, label: "First 10", sub: "In-person interviews" },
  ];
  const next =
    p.stage === 1
      ? contacts.length < 3
        ? { t: "Add 10 people you know", to: "/contacts" as const }
        : prog.s1 < 5
          ? { t: `Do interview #${prog.s1 + 1}`, to: "/interview" as const }
          : { t: "Review what you learned", to: "/learnings" as const }
      : { t: "Work your outreach plan", to: "/outreach" as const };
  const pipeContacts = contacts.filter((c) => c.stage >= 2);
  const timeline = [
    ...learnings
      .filter((l) => l.accepted)
      .map((l) => ({
        id: l.id,
        at: l.created_at,
        stage: l.stage,
        t: l.title || "Learning",
        b: l.body,
        k: "Learning",
      })),
    ...experiments.map((e) => ({
      id: e.id,
      at: e.created_at,
      stage: e.stage,
      t: e.hypothesis,
      b: e.result ? `Result: ${e.result}` : `Trying: ${e.change}`,
      k: "Experiment",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <AppShell title={p.name || "Your ladder"}>
      <Card className="bg-warm text-primary-foreground">
        <p className="text-sm opacity-90">Your next step</p>
        <p className="mt-1 font-display text-2xl font-bold">{next.t}</p>
        <Button asChild variant="secondary" size="lg" className="mt-4 w-full rounded-xl">
          <Link to={next.to}>Let’s go →</Link>
        </Button>
      </Card>

      <div className="space-y-3">
        {rungs.map((r) => {
          const locked = p.stage < r.stage;
          const pct = Math.min(100, (r.val / r.goal) * 100);
          return (
            <div
              key={r.stage}
              className={`rounded-2xl border bg-card p-4 shadow-soft ${locked ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-lg font-bold">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.sub}</p>
                </div>
                {locked ? (
                  <Lock className="size-5 text-muted-foreground" />
                ) : (
                  <p className="font-display text-2xl font-bold">
                    {r.val}
                    <span className="text-base text-muted-foreground">/{r.goal}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <h2 className="text-lg font-bold">Pipeline</h2>
        {pipeContacts.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Unlocks at Stage 2. People you reach out to will show up here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {PIPELINE.map((s) => (
              <div key={s.key} className="rounded-xl bg-muted p-2">
                <p className="font-display text-xl font-bold">
                  {pipeContacts.filter((c) => c.status === s.key).length}
                </p>
                <p className="text-[10px] leading-tight text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-bold">Learnings timeline</h2>
        {timeline.length === 0 ? (
          <Empty
            title="Nothing yet — that’s normal!"
            body="After a few interviews, your learnings and experiments will appear here."
          />
        ) : (
          <ol className="space-y-3 border-l-2 border-primary/30 pl-4">
            {timeline.map((t) => (
              <li key={t.id}>
                <p className="text-[11px] font-semibold uppercase text-primary">
                  {t.k} · Stage {t.stage}
                </p>
                <p className="font-semibold">{t.t}</p>
                {t.b && <p className="line-clamp-2 text-sm text-muted-foreground">{t.b}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <Link
        to="/setup"
        className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
      >
        <Pencil className="size-4" /> Edit app details
      </Link>
    </AppShell>
  );
}
