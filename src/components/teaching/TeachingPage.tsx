import { FoundingPartnerInvite } from "@/components/partners/FoundingPartnerInvite";
import { BrandLogo } from "@/components/BrandLogo";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Check, Download, NotebookPen } from "lucide-react";
import { LessonSequence } from "./LessonSequence";
import { TeachingConcepts } from "./TeachingConcepts";
import { DiscoveryCycleOverview } from "./DiscoveryCycleOverview";
import { TeachingResources } from "./TeachingResources";
import { teachingKit } from "./resources";

const objectives = [
  "Separate what a source says from what you infer.",
  "Ask about a recent situation, not a hypothetical purchase.",
  "Use disagreement to explain a next decision.",
  "Connect an audience, a channel and a useful action.",
  "Revise after feedback and keep uncertainty visible.",
];
const week = [
  ["Day 1", "Audience", "Own thinking, sources and unknowns."],
  ["Day 2", "Two routes", "One primary channel and one alternative; check access."],
  ["Day 3", "One asset", "Truthful content, a working destination and a peer check."],
  ["Days 4–6", "Small test", "Permitted manual action; date and source each observation."],
  ["Day 7", "Reflect", "Repeat, revise or stop. Explain the evidence and limits."],
] as const;

export function TeachingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
      <a href="#teaching-main" className="sr-only focus:not-sr-only focus:inline-block focus:py-3">
        Skip to teaching resources
      </a>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border py-5">
        <Link
          to="/"
          aria-label="First Ten home"
          className="inline-flex min-h-11 items-center rounded-md"
        >
          <BrandLogo className="h-9 w-auto" />
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold"
        >
          <Link to="/demo" className="inline-flex min-h-11 items-center rounded-md">
            Explore the example
          </Link>
          <Link to="/teacher" className="inline-flex min-h-11 items-center rounded-md">
            Plan my class
          </Link>
          <a href="/pitch/index.html" className="inline-flex min-h-11 items-center rounded-md">
            The short pitch
          </a>
          <Link
            to="/auth"
            className="inline-flex min-h-11 items-center gap-1 rounded-md text-primary"
          >
            Start a project <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main id="teaching-main" tabIndex={-1}>
        <section
          aria-labelledby="teaching-title"
          className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.12fr_1fr] lg:items-center lg:gap-14"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.19em] text-primary">
              For entrepreneurship educators
            </p>
            <h1
              id="teaching-title"
              className="mt-5 max-w-xl text-[2.8rem] font-extrabold leading-[1.04] sm:text-6xl"
            >
              Make the next decision teachable.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              One classroom hour. One week in the field. Help students show what they heard, what
              they think it means and what they will try next.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={teachingKit.printablePdf}
                download
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                <Download aria-hidden="true" className="size-5" /> Get the teaching kit{" "}
                <span className="text-sm font-normal">· PDF</span>
              </a>
              <a
                href="#downloads"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 py-3 font-semibold text-primary"
              >
                Explore the resources <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No account, AI subscription or outside contact needed for the lesson.
            </p>
          </div>
          <aside
            aria-label="StudyLoop fictional classroom case"
            className="rounded-3xl border border-primary/25 bg-primary p-5 shadow-soft sm:p-7"
          >
            <div className="flex items-center justify-between gap-3 text-primary-foreground">
              <p className="font-display text-xl font-bold">StudyLoop</p>
              <span className="rounded-full bg-draft px-3 py-1 text-xs font-semibold text-draft-foreground">
                Fictional classroom case
              </span>
            </div>
            <div className="mt-5 rounded-xl bg-card p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                01 / A source
              </p>
              <blockquote className="mt-3 font-display text-xl font-bold leading-snug sm:text-2xl">
                “I don’t need more people. I need to know who’s actually showing up.”
              </blockquote>
              <p className="mt-3 text-xs text-muted-foreground">Maya · fictional direct quote</p>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  02 / A counterexample
                </p>
                <p className="mt-2 text-sm leading-relaxed">
                  Nora already has a reliable study group and does not want another app.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Fictional paraphrased note</p>
              </div>
              <div className="mt-5 rounded-lg bg-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  03 / A student’s choice
                </p>
                <p className="mt-2 font-semibold">
                  What would you change, keep or investigate next—and why?
                </p>
              </div>
            </div>
            <Link
              to="/demo"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-primary-foreground"
            >
              Walk through the example <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </section>

        <nav
          aria-label="On this page"
          className="flex flex-wrap gap-x-6 gap-y-1 border-y border-border py-3 text-sm font-semibold"
        >
          <a href="#lesson" className="inline-flex min-h-11 items-center rounded-md">
            The 60-minute lesson
          </a>
          <a href="#approach" className="inline-flex min-h-11 items-center rounded-md">
            Teaching approach
          </a>
          <a href="#downloads" className="inline-flex min-h-11 items-center rounded-md">
            Downloads
          </a>
          <a href="#in-class" className="inline-flex min-h-11 items-center rounded-md">
            Using it in class
          </a>
        </nav>

        <section aria-labelledby="discovery-method-title" className="border-b py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            The student framework
          </p>
          <h2 id="discovery-method-title" className="mt-3 text-3xl font-bold sm:text-4xl">
            Teach a decision, not a polished guess.
          </h2>
          <p className="mt-4 mb-8 max-w-3xl leading-relaxed text-muted-foreground">
            Ask students to keep their first hypothesis, explain who could challenge it, and show
            how an observation changes the next test. Use the sequence manually today; the saved
            guided workspace and adjacent-hypothesis AI are being developed.
          </p>
          <DiscoveryCycleOverview />
          <p className="mt-5 text-sm text-muted-foreground">
            Five people is a planning scaffold, not a quota to fabricate. Assess the reasoning,
            participant respect and willingness to revise—not positive responses or AI use.
          </p>
        </section>

        <section id="lesson" aria-labelledby="lesson-title" className="scroll-mt-6 py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            01 / The classroom hour
          </p>
          <h2 id="lesson-title" className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">
            A lesson with something to show at every step.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Start with a fictional case. Finish with a decision, a small test and a reason to
            revise.
          </p>
          <div className="mt-9 grid items-start gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
            <LessonSequence />
            <aside
              aria-label="Lesson objectives and preparation"
              className="rounded-2xl border border-border bg-card p-6 sm:p-7"
            >
              <NotebookPen className="size-7 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-bold">What students practice</h3>
              <ul className="mt-5 space-y-4">
                {objectives.map((objective) => (
                  <li key={objective} className="flex items-start gap-3 text-sm leading-relaxed">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {objective}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
                <h3 className="text-base font-bold text-foreground">Plan for your room</h3>
                <p className="mt-3">
                  Pairs or trios; a solo self-check also works. A 45-person session can be planned
                  as 15 trios with a whole-room debrief. This is a planning example, not a tested
                  class-size limit.
                </p>
                <p className="mt-3">
                  Bring paper or an accessible document. Give worksheet A first. Reveal the source
                  cards at minute 10 and the facilitator reasoning after students choose.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section
          aria-labelledby="week-title"
          className="rounded-3xl bg-primary p-6 text-primary-foreground sm:p-9"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em]">
            Then / One week in the field
          </p>
          <h2 id="week-title" className="mt-3 text-3xl font-bold sm:text-4xl">
            The $0 Marketing Lab assignment
          </h2>
          <p className="mt-4 max-w-3xl leading-relaxed">
            Turn an audience choice into two reachable channels, one reviewed asset and a small
            test. Measure a useful action, then decide what to repeat, revise or stop.
          </p>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {week.map(([day, title, description]) => (
              <li key={day} className="border-t border-primary-foreground/40 pt-4">
                <p className="text-xs font-semibold uppercase tracking-widest">{day}</p>
                <h3 className="mt-2 text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed">{description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-primary-foreground/40 pt-5">
            <p className="max-w-2xl text-sm leading-relaxed">
              $0 means no new cash spending. Time, access, printing and existing AI allowances still
              have limits. The private or simulated alternative has the same rubric opportunities.
            </p>
            <a
              href="/teaching/first-ten-teaching-kit.html#one-week-assignment-1"
              className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold underline underline-offset-4"
            >
              Read the assignment <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 text-xs">
            Assignment and manual saved Marketing Lab available now. Dedicated channel/content AI
            for private student work remains planned.
          </p>
        </section>

        <section
          id="approach"
          aria-labelledby="approach-title"
          className="scroll-mt-6 py-12 sm:py-16"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            02 / The teaching approach
          </p>
          <h2 id="approach-title" className="mt-3 text-3xl font-bold sm:text-4xl">
            Teaching built into the workflow
          </h2>
          <p className="mb-8 mt-4 max-w-2xl text-lg text-muted-foreground">
            Six concepts, each tied to something a student actually does in the lesson or
            assignment.
          </p>
          <TeachingConcepts />
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            These are activity-design choices, not demonstrated learning gains. The kit’s{" "}
            <a
              href="/teaching/first-ten-teaching-kit.html#assessment-rubric-1"
              className="rounded-sm font-semibold text-primary underline underline-offset-4"
            >
              source notes and rubric
            </a>{" "}
            explain the curriculum basis and limits of the Babson and EEF sources. No institutional
            endorsement is claimed.
          </p>
        </section>

        <section
          id="downloads"
          aria-labelledby="downloads-title"
          className="scroll-mt-6 border-t border-border py-12 sm:py-16"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            03 / Ready to adapt
          </p>
          <h2 id="downloads-title" className="mt-3 text-3xl font-bold sm:text-4xl">
            Take the lesson into your classroom.
          </h2>
          <p className="mb-8 mt-4 max-w-2xl text-lg text-muted-foreground">
            Six resources. A complete plan. Use them on paper, in an accessible document or
            alongside the optional app.
          </p>
          <TeachingResources />
        </section>

        <section
          id="in-class"
          aria-labelledby="in-class-title"
          className="scroll-mt-6 border-t border-border py-12 sm:py-16"
        >
          <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                04 / Make room for everyone
              </p>
              <h2 id="in-class-title" className="mt-3 text-3xl font-bold sm:text-4xl">
                Review the reasoning. Respect the learner.
              </h2>
              <p className="mt-4 text-muted-foreground">
                A well-explained decision to stop—or an honestly unrun test—can earn full credit.
                Customers, network size, spending and AI usage are not the grade.
              </p>
            </div>
            <div className="divide-y divide-border border-y border-border">
              <details className="py-1" open>
                <summary className="cursor-pointer rounded-md py-4 text-lg font-semibold">
                  Can students do this without AI or a network?
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Yes. The lesson uses fictional sources and needs no account, AI or outside
                    contact. For the week, students may use StudyLoop, inspect a public source and
                    rehearse privately with a consenting peer or alone. Label rehearsal as
                    rehearsal; leave field outcomes unknown.
                  </p>
                  <p className="mt-3">
                    Offer typing, handwriting, dictation, oral explanation or an accessible
                    document. Adjust pacing without changing the reasoning criteria. A self-check is
                    a valid alternative; label it as such.
                  </p>
                </div>
              </details>
              <details className="py-1">
                <summary className="cursor-pointer rounded-md py-4 text-lg font-semibold">
                  What is available in the app today?
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Individual work, available now:</strong>{" "}
                    interview preparation, notes, editable learning drafts, experiments, a saved
                    manual Stage 2 Marketing Lab and private educator lesson planning. The workshop
                    demo includes clearly labeled authored cohort examples. Initial question setup
                    starts with AI; keep the lesson’s first thinking on paper or in a document.
                    Interview notes save at wrap-up, so finish and save before leaving.
                  </p>
                  <p className="mt-3">
                    <strong className="text-foreground">Planned:</strong> live class submissions,
                    teacher access to student work, shared projects and dedicated marketing AI for
                    private student plans. Use your existing private course submission process for
                    this assignment.
                  </p>
                  <Link
                    to="/auth"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary"
                  >
                    Try an individual project <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </details>
              <details className="py-1">
                <summary className="cursor-pointer rounded-md py-4 text-lg font-semibold">
                  How should we handle people and AI?
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Ask before taking notes. Permission for external AI processing and sharing an
                    excerpt are separate choices for the actual material and audience. Class
                    enrollment does not grant them. Use non-sensitive context; keep personal and
                    contact details out of submitted artifacts.
                  </p>
                  <p className="mt-3">
                    The app sends selected content through OpenRouter to a model provider when
                    generating drafts. Its note-taking checkbox is not a stored permission record.
                    Use the manual route when permission is missing. Nothing in this kit contacts
                    people or automatically publishes an asset.
                  </p>
                </div>
              </details>
              <details className="py-1">
                <summary className="cursor-pointer rounded-md py-4 text-lg font-semibold">
                  What should I assess and collect?
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    The 12-point rubric covers question quality, source versus interpretation,
                    revision and decision, and participant respect. Collect original thinking,
                    sources and unknowns, a small plan, observed feedback and a reflection through
                    your private course channel.
                  </p>
                  <p className="mt-3">
                    Score the explanation and honest limits. A polished draft, a high user count or
                    a positive conclusion does not establish good reasoning. Classroom participation
                    is not automatically First Ten research or voluntary product retention.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </section>
        <FoundingPartnerInvite />
        <section
          aria-label="Next step"
          className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <div>
            <h2 className="text-2xl font-bold">Try the case before you teach it.</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Inspect the fictional sources, choose a direction and see a proposed next test.
            </p>
          </div>
          <Link
            to="/demo"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Explore StudyLoop <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>First Ten · Build. Reach. Learn.</p>
        <div className="flex flex-wrap gap-5">
          <Link to="/" className="inline-flex min-h-11 items-center rounded-md">
            Back to First Ten
          </Link>
          <a
            href={teachingKit.printableHtml}
            className="inline-flex min-h-11 items-center rounded-md"
          >
            Readable teaching kit
          </a>
        </div>
      </footer>
    </div>
  );
}
