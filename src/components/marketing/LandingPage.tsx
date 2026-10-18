import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  MessageCircle,
  NotebookPen,
  Sprout,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { StudyLoopDemo } from "@/components/demo/StudyLoopDemo";
import { TeachingConcepts } from "@/components/teaching/TeachingConcepts";
import { StackDiagram } from "./StackDiagram";

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover";
const secondary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 py-3 font-semibold hover:bg-secondary";
const benefits = [
  {
    title: "Ask about what happened.",
    text: "Start with draft questions about recent situations and real workarounds. Edit them before you go.",
    icon: MessageCircle,
  },
  {
    title: "Review what you heard.",
    text: "Capture notes and exact words. Review an editable AI summary, and check it against your conversations.",
    icon: NotebookPen,
  },
  {
    title: "Try one small change.",
    text: "Log an experiment, record what happened and carry reviewed learnings into later outreach.",
    icon: Sprout,
  },
];
const faqs = [
  [
    "Do I need to sign in to explore?",
    "No. The fictional StudyLoop example and teaching resources work without an account or live AI request. Sign in by email to create and save your own private project.",
  ],
  [
    "What do the 10, 50 and 100 mean?",
    "They are a learning scaffold, not proof of demand or a promise of customers. The current app uses conversation counts and checklists to open later stages. A useful decision can also be to narrow the audience, investigate again or stop.",
  ],
  [
    "What does AI do?",
    "It proposes editable questions, summaries and outreach drafts through OpenRouter. You provide the observations, check the draft and decide. The normal summary entry appears after five completed interviews. AI can make mistakes, and the app does not verify that a conversation happened.",
  ],
  [
    "What happens to interview information?",
    "Your workspace is private to its owner. Requested AI processing sends selected project context to OpenRouter and its model provider. Obtain appropriate permission, keep sensitive information out, and distinguish note-taking permission from AI processing or sharing. The app never sends outreach for you.",
  ],
  [
    "Can I use the $0 Marketing Lab now?",
    "The one-week assignment and editable worksheets are available now. Stage 2 accounts can save a manual audience/channel/content/test plan and return to it. New AI channel/content proposals remain in development. Zero cash does not mean unlimited time or free AI usage. There are no automated posting tools.",
  ],
  [
    "Can teachers review a class?",
    "Private educator lesson planning is available now, with clearly labeled fictional cohort examples in the workshop demo. Live class submissions, teacher access to student work, shared projects and event-funnel analytics remain planned. Use your existing private course submission method. The admin view is a protected count-only operational dashboard. No measured learning improvement or institutional endorsement is claimed.",
  ],
] as const;

export function LandingPage() {
  return (
    <div className="overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:inline-block focus:px-5 focus:py-3"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border py-5">
          <Link
            to="/"
            aria-label="First Ten home"
            className="inline-flex min-h-11 items-center rounded-md"
          >
            <BrandLogo className="h-9 w-auto" />
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex flex-wrap items-center gap-x-5 text-sm font-semibold"
          >
            <a href="#how-it-works" className="inline-flex min-h-11 items-center rounded-md">
              How it works
            </a>
            <Link to="/teach" className="inline-flex min-h-11 items-center rounded-md">
              For educators
            </Link>
            <Link
              to="/auth"
              className="inline-flex min-h-11 items-center gap-1 rounded-md text-primary"
            >
              Sign in <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>
          <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:py-20">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                For student founders
              </p>
              <h1 className="mt-5 max-w-2xl text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.4rem]">
                Real conversations.
                <br />
                <span className="text-primary">A clearer next move.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                You’ve built something. Now explore who to focus on, what to change and what to try
                next—with editable questions, conversation notes and AI-assisted summaries.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/demo" className={button}>
                  Explore the example <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
                <Link to="/auth" className={secondary}>
                  Start my project
                </Link>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Fictional example. No account needed.
              </p>
              <Link
                to="/teach"
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
              >
                Teaching entrepreneurship? See the lesson.{" "}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <aside
              aria-label="StudyLoop fictional preview"
              className="rounded-3xl border border-primary/20 bg-secondary p-5 sm:p-7"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-xl font-bold">StudyLoop</p>
                <span className="rounded-full border border-primary/20 bg-background px-3 py-1 text-xs font-semibold">
                  Fictional example
                </span>
              </div>
              <div className="mt-6 border-l-2 border-primary/30 pl-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  01 · Starting assumption
                </p>
                <p className="mt-2 text-lg font-semibold">Students need more study partners.</p>
              </div>
              <div className="mt-5 rounded-2xl bg-card p-5 shadow-soft">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  02 · Listen to a different possibility
                </p>
                <blockquote className="mt-4 font-display text-2xl font-bold leading-snug">
                  “I don’t need more people. I need to know who’s actually showing up.”
                </blockquote>
                <p className="mt-3 text-sm text-muted-foreground">Maya · fictional quote</p>
              </div>
              <ArrowDown className="mx-auto my-4 size-5 text-primary" aria-hidden="true" />
              <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
                <p className="text-xs font-semibold uppercase tracking-widest">
                  03 · Proposed next move
                </p>
                <p className="mt-3 text-xl font-bold">
                  Test attendance confirmations before building a discovery feed.
                </p>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                A teaching preview, not a real interview or tested result. Nora’s reliable group
                challenges the idea.
              </p>
            </aside>
          </section>
          <section
            id="how-it-works"
            aria-labelledby="workflow-title"
            className="scroll-mt-6 border-t border-border py-12 sm:py-16"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              A useful learning loop
            </p>
            <h2
              id="workflow-title"
              className="mt-4 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl"
            >
              From a conversation to something you can try.
            </h2>
            <div className="mt-9 grid gap-8 md:grid-cols-3">
              {benefits.map(({ title, text, icon: Icon }, i) => (
                <article key={title} className="border-t border-border pt-5">
                  <div className="flex items-center justify-between text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                    <span className="text-xs font-bold">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-bold">{title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold">
              <Check className="size-4" aria-hidden="true" /> AI drafts. You review and decide.
            </p>
          </section>
          <section
            aria-labelledby="example-title"
            className="border-t border-border py-12 sm:py-16"
          >
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Explore a fictional case
                </p>
                <h2 id="example-title" className="mt-4 text-3xl font-bold sm:text-4xl">
                  What if the first assumption changes?
                </h2>
                <p className="mt-4 max-w-3xl text-muted-foreground">
                  Follow four fictional perspectives, inspect what challenges the idea, and choose a
                  next test.
                </p>
              </div>
              <Link
                to="/demo"
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"
              >
                Open full example <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <StudyLoopDemo />
            <p className="mt-4 text-sm text-muted-foreground">
              The example teaches a method. Source-linked review here does not mean the signed-in
              app supports every demonstrated evidence feature.
            </p>
          </section>
          <section
            id="for-educators"
            aria-labelledby="educator-title"
            className="scroll-mt-6 rounded-3xl bg-primary p-6 text-primary-foreground sm:p-10"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              For entrepreneurship educators
            </p>
            <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
              <h2
                id="educator-title"
                className="max-w-lg text-4xl font-bold leading-tight sm:text-5xl"
              >
                Make the reasoning visible.
              </h2>
              <div>
                <p className="text-lg leading-relaxed">
                  Help students show what they heard, what challenges their idea and why their next
                  step follows.
                </p>
                <p className="mt-4 leading-relaxed">
                  Try a 60-minute classroom exercise or a one-week assignment. The rubric focuses on
                  reasoning and revision.
                </p>
                <Link
                  to="/teach"
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-background px-5 py-3 font-semibold text-foreground"
                >
                  Explore teaching resources <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
                <p className="mt-4 text-sm">
                  Printable PDF · Editable worksheets · No account or AI required
                </p>
              </div>
            </div>
          </section>
          <section aria-labelledby="pedagogy-title" className="py-12 sm:py-16">
            <h2 id="pedagogy-title" className="text-3xl font-bold sm:text-4xl">
              Teaching built into the workflow
            </h2>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Six teaching concepts, each connected to something a student does in the lesson or
              assignment. These are design commitments; learning gains have not been measured.
            </p>
            <div className="mt-8">
              <TeachingConcepts />
            </div>
          </section>
          <section
            aria-labelledby="marketing-title"
            className="grid gap-8 rounded-3xl border border-primary/25 bg-secondary p-6 sm:p-10 lg:grid-cols-2"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Next 50 · The $0 Marketing Lab
              </p>
              <h2 id="marketing-title" className="mt-4 text-3xl font-bold sm:text-4xl">
                A plan you can actually try.
              </h2>
              <p className="mt-5 leading-relaxed text-muted-foreground">
                Start with an audience. Investigate physical and digital channels. Make useful
                content for one route, set a small test, then decide what to repeat, revise or stop.
              </p>
              <Link
                to="/teach"
                className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
              >
                Get the one-week assignment <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-bold">Think first. Then build the plan.</p>
              <ol className="mt-5 space-y-4">
                {[
                  "Audience + evidence + unknowns",
                  "One primary channel + one alternative",
                  "A truthful hook + a useful next action",
                  "One week + a resource limit + a measure",
                  "Peer check + repeat, revise or stop",
                ].map((item, i) => (
                  <li key={item} className="flex gap-3 text-sm">
                    <span className="font-bold text-primary">0{i + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
                Assignment and saved manual Stage 2 lab available now. New AI proposals are in
                development. AI is optional after initial thinking. No automatic posting; $0 cash
                does not mean zero effort or free AI.
              </p>
            </div>
          </section>
          <section aria-labelledby="faq-title" className="py-12 sm:py-16">
            <h2 id="faq-title" className="text-3xl font-bold">
              A few practical questions
            </h2>
            <div className="mt-7 max-w-4xl divide-y divide-border border-y border-border">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="cursor-pointer text-lg font-semibold">{question}</summary>
                  <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section aria-label="Product technology" className="pb-12 sm:pb-16">
            <StackDiagram />
            <div className="mt-5 flex flex-wrap gap-6 text-sm font-semibold text-primary">
              <a
                href="/diagrams/current-stack.svg"
                className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
              >
                Open the stack schematic <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
              <a
                href="/pitch/index.html"
                className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
              >
                View the workshop pitch <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </section>
          <section className="rounded-3xl border border-border bg-card p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Build. Reach. Learn.
            </p>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              Start with one useful conversation.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Find a person with experience of the problem. Listen, review the evidence, and decide
              what to try next.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth" className={button}>
                Start my project <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link to="/demo" className={secondary}>
                Explore first
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign in by email, then add your project.
            </p>
          </section>
        </main>
        <footer className="mt-12 flex flex-wrap justify-between gap-5 border-t border-border py-8 text-sm text-muted-foreground">
          <p>First Ten · Honest learning. Useful action.</p>
          <div className="flex flex-wrap gap-5">
            <Link to="/teach" className="underline underline-offset-4">
              Teaching resources
            </Link>
            <a href="/pitch/index.html" className="underline underline-offset-4">
              Pitch
            </a>
            <Link to="/auth" className="underline underline-offset-4">
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
