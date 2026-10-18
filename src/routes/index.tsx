import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "First Ten — Find your first customers" },
      {
        name: "description",
        content:
          "A friendly ladder for student founders: talk to 10 people you know, then reach 50, then 100.",
      },
      { property: "og:title", content: "First Ten — Find your first customers" },
      {
        property: "og:description",
        content: "Talk to 10 people you know, then reach 50, then 100. Learn at every step.",
      },
    ],
  }),
  component: Index,
});

const problems = [
  {
    t: "You don’t know who to ask",
    d: "Your app is live, but “post it everywhere” gets crickets.",
  },
  { t: "Friends just say “cool!”", d: "Polite praise feels good and teaches you nothing." },
  { t: "No idea what to fix", d: "Without real conversations, you guess — and guess wrong." },
];

const rungs = [
  {
    n: "10",
    t: "First 10 — people you know",
    d: "AI writes honest interview questions. Talk in person, one question per screen, tag what you hear.",
  },
  {
    n: "50",
    t: "Next 50 — their friends & communities",
    d: "Your learnings become an outreach plan and messages written in your customers’ own words.",
  },
  {
    n: "100",
    t: "Next 100 — channels that scale",
    d: "Referral asks, onboarding questions, and simple numbers to see who sticks.",
  },
];

function Index() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-lg font-bold">First Ten</span>
        <Link to="/auth" className="text-sm font-semibold text-primary">
          Sign in
        </Link>
      </header>

      <section className="py-10 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          For student founders
        </p>
        <h1 className="mt-3 text-5xl font-extrabold leading-[1.05] md:text-6xl">
          You built it.
          <br />
          Now meet the people it’s for.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          First Ten walks you from your first 10 conversations to 100 real users — one small, doable
          step at a time.
        </p>
        <div className="mt-8 max-w-sm">
          <Button asChild size="xl">
            <Link to="/auth">Start climbing — it’s free</Link>
          </Button>
        </div>
      </section>

      <section className="py-10">
        <h2 className="text-3xl font-bold">The problem</h2>
        <p className="mt-2 text-muted-foreground">
          Building is the easy part. Finding your first customers is where most student projects
          stall.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {problems.map((p) => (
            <div key={p.t} className="border-t-2 border-foreground pt-4">
              <p className="font-display text-sm font-bold text-primary">
                0{problems.indexOf(p) + 1}
              </p>
              <p className="mt-2 font-semibold">{p.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10">
        <h2 className="text-3xl font-bold">The solution: a ladder</h2>
        <p className="mt-2 text-muted-foreground">
          Each rung teaches you something that shapes the next.
        </p>
        <ol className="mt-6 space-y-3">
          {rungs.map((r, i) => (
            <li key={r.n} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-soft">
              <span
                className={`flex size-14 shrink-0 items-center justify-center rounded-xl font-display text-xl font-bold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {r.n}
              </span>
              <div>
                <p className="font-semibold">{r.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 py-10 md:grid-cols-3">
        {[
          ["AI drafts, you decide", "Questions, summaries and messages are drafts you can edit."],
          ["Made for your phone", "Big buttons, one hand, right in the conversation."],
          ["Respectful by design", "First names only, and a reminder to ask before taking notes."],
        ].map(([t, d]) => (
          <div key={t} className="border-l-2 border-primary pl-4">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl bg-foreground p-8 text-left text-background">
        <h2 className="text-3xl font-bold">Your first 10 are closer than you think.</h2>
        <p className="mt-2 opacity-90">Classmates, family, clubs — start with who you know.</p>
        <div className="mt-6 max-w-sm">
          <Button asChild size="xl">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
