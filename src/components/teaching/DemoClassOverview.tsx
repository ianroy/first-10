import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, MessageSquare, Users } from "lucide-react";
import { classroomExamples, type ClassroomExampleId } from "@/lib/demo/classroom";
import { Textarea } from "@/components/ui/textarea";

export function DemoClassOverview({ onDraftChange }: { onDraftChange?: (dirty: boolean) => void }) {
  const [selected, setSelected] = useState<ClassroomExampleId>("studyloop");
  const [comments, setComments] = useState<Partial<Record<ClassroomExampleId, string>>>({});
  const commentId = useId();
  const team = classroomExamples.find((item) => item.id === selected)!;
  const hasDraft = Object.values(comments).some((value) => Boolean(value?.trim()));
  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);
  return (
    <section
      aria-labelledby="class-overview-title"
      className="space-y-6 border-b border-border pb-9"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Educator dashboard · workshop rehearsal
          </p>
          <h2
            id="class-overview-title"
            className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl"
          >
            See the thinking.
            <br />
            Coach the next move.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Explore four authored team examples. Look for the source, the assumption and the
            decision that changed — then practice a useful feedback question.
          </p>
        </div>
        <a
          href="#private-lesson-plan"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-primary hover:bg-accent"
        >
          Your private lesson plan <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>
      <div className="rounded-xl border border-primary/25 bg-secondary p-5">
        <p className="font-bold">
          Fictional class preview — authored examples, not enrolled students or live activity
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          These examples illustrate what an educator might review. There are no submitted
          assignments, attendance records, grades or learner accounts behind these cards.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Users className="size-4 text-primary" aria-hidden="true" />4 authored team examples
        </span>
        <span className="inline-flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden="true" />
          Evidence → decision → next test
        </span>
        <span className="inline-flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" aria-hidden="true" />
          Practice feedback · not sent
        </span>
      </div>
      <nav
        aria-label="Fictional team examples"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {classroomExamples.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            aria-controls="classroom-work-example"
            onClick={() => setSelected(item.id)}
            className={`rounded-2xl border p-5 text-left transition-colors ${selected === item.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card hover:border-primary/50 hover:bg-accent"}`}
          >
            <span className="flex items-center justify-between gap-3">
              <span
                className={`flex size-10 items-center justify-center rounded-xl border text-sm font-bold ${selected === item.id ? "border-primary-foreground/30" : "border-border text-primary"}`}
              >
                {item.initials}
              </span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
            <span className="mt-4 block text-xl font-bold">{item.name}</span>
            <span className="mt-1 block text-sm">{item.idea}</span>
            <span
              className={`mt-5 block border-t pt-3 text-xs font-semibold ${selected === item.id ? "border-primary-foreground/25" : "border-border"}`}
            >
              Example focus: {item.focus}
            </span>
          </button>
        ))}
      </nav>
      <div
        id="classroom-work-example"
        className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,1fr)]"
      >
        <article
          aria-label={`${team.name} authored work`}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <header className="border-b border-border bg-muted/50 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Authored work sample · fictional
            </p>
            <h3 className="mt-2 text-2xl font-bold">Inside {team.name}’s thinking</h3>
            <p className="mt-2 text-sm text-muted-foreground">{team.principle}</p>
          </header>
          <div className="space-y-6 p-6">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                First thinking, before the scaffold
              </h4>
              <p className="mt-2 text-base leading-relaxed">{team.firstThinking}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Observation in the example", team.observation],
                ["Assumption to investigate", team.assumption],
              ].map(([title, body]) => (
                <section className="rounded-xl border border-border p-4" key={title}>
                  <h4 className="text-sm font-bold text-primary">{title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </section>
              ))}
            </div>
            <section className="rounded-xl border-l-4 border-primary bg-secondary p-5">
              <h4 className="font-bold">The counterexample matters</h4>
              <p className="mt-2 text-sm leading-relaxed">{team.counterexample}</p>
            </section>
            <div>
              <h4 className="font-bold">Reviewed decision in this example</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{team.decision}</p>
            </div>
            <div>
              <h4 className="font-bold">Proposed next step · not carried out</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{team.nextStep}</p>
            </div>
          </div>
        </article>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Authored reflection excerpt
            </p>
            <blockquote className="mt-4 border-l-2 border-primary pl-4 text-lg font-medium leading-relaxed">
              “{team.workExcerpt}”
            </blockquote>
            <p className="mt-3 text-xs text-muted-foreground">
              Written for this demonstration; not a student quotation.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-xl font-bold">A question that moves learning forward</h3>
            <ul className="mt-4 space-y-3">
              {team.prompts.map((prompt) => (
                <li key={prompt} className="flex gap-3 text-sm leading-relaxed">
                  <MessageSquare
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>
            <label htmlFor={commentId} className="mt-6 block text-sm font-bold">
              Local feedback draft for {team.name}
            </label>
            <Textarea
              id={commentId}
              className="mt-2"
              rows={5}
              maxLength={2000}
              value={comments[selected] ?? ""}
              onChange={(event) =>
                setComments((previous) => ({ ...previous, [selected]: event.target.value }))
              }
              aria-describedby={`${commentId}-help`}
              placeholder="Name one supported observation, one uncertainty and one next action the learner could choose."
            />
            <p
              id={`${commentId}-help`}
              className="mt-3 text-xs leading-relaxed text-muted-foreground"
            >
              Local practice only — not saved or sent. Drafts stay while switching examples; leaving
              or reloading this page discards them. Saving your lesson plan does not save these
              comments.
            </p>
          </section>
        </aside>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Use the six teaching principles below to discuss the work: experiential learning, student
        thinking before AI, scaffolding, peer feedback, reflection and responsible AI. These
        examples do not establish measured learning gains.
      </p>
    </section>
  );
}
