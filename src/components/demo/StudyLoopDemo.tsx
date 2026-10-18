import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  FlaskConical,
  RotateCcw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  alternative,
  choices,
  interpretation,
  sources,
  startingAssumption,
  startingIdea,
  steps,
  uncertainty,
  type ChoiceId,
  type SourceId,
} from "@/lib/demo/studyloop";

function SourceText({
  source,
  large = false,
}: {
  source: (typeof sources)[number];
  large?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">
        {source.name} · {source.kind}
      </p>
      {source.id === "studyloop-maya" ? (
        <blockquote
          className={`mt-3 font-display font-bold leading-tight ${large ? "text-2xl sm:text-3xl" : "text-xl"}`}
        >
          “{source.text}”
        </blockquote>
      ) : (
        <p className={`mt-3 leading-relaxed ${large ? "text-xl sm:text-2xl" : "text-lg"}`}>
          {source.text}
        </p>
      )}
    </div>
  );
}

function SourceReview() {
  return (
    <details className="mt-6 rounded-xl border border-input bg-card p-4">
      <summary className="min-h-11 cursor-pointer content-center rounded-sm font-semibold text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-4">
        Review all four sources
      </summary>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {sources.map((source) => (
          <div key={source.id} className="border-l-2 border-border pl-4">
            <SourceText source={source} />
          </div>
        ))}
      </div>
    </details>
  );
}

/** Pure in-memory example. No auth, persistence, analytics, product hooks or network calls. */
export function StudyLoopDemo({
  continuation,
  initialChoiceId,
  onReset,
  focusOnMount = false,
}: {
  continuation?: ReactNode | ((context: { choiceId: ChoiceId; reset: () => void }) => ReactNode);
  initialChoiceId?: ChoiceId | undefined;
  onReset?: () => void;
  focusOnMount?: boolean;
}) {
  const instanceId = useId();
  const [step, setStep] = useState(initialChoiceId ? 4 : 0);
  const [sourceId, setSourceId] = useState<SourceId>("studyloop-maya");
  const [choiceId, setChoiceId] = useState<ChoiceId | null>(initialChoiceId ?? null);
  const [notice, setNotice] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(focusOnMount);
  const activeSource = sources.find((source) => source.id === sourceId) ?? sources[0];
  const selectedChoice = choices.find((choice) => choice.id === choiceId);
  const currentStep = steps[step]!;
  const panelId = `${instanceId}-panel`;

  useEffect(() => {
    if (shouldFocus.current) {
      headingRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [step, resetKey]);

  function goTo(nextStep: number) {
    shouldFocus.current = true;
    setStep(nextStep);
    setNotice(`Step ${nextStep + 1} of 5: ${steps[nextStep]!.short}.`);
  }
  function reset() {
    shouldFocus.current = true;
    setStep(0);
    setSourceId("studyloop-maya");
    setChoiceId(null);
    setResetKey((value) => value + 1);
    setNotice("Example reset. Step 1 of 5. Maya is open; no decision selected.");
    onReset?.();
  }
  function selectSource(id: SourceId) {
    setSourceId(id);
    setNotice(`${sources.find((source) => source.id === id)!.name} source selected.`);
  }

  return (
    <section
      aria-label="StudyLoop interactive example"
      className="rounded-2xl border border-border bg-card shadow-soft sm:rounded-3xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-3">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground sm:flex">
            <BookOpen aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold">StudyLoop</h2>
            <p className="text-sm text-muted-foreground">A study-group idea</p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label="Reset example" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          Reset<span className="hidden sm:inline">example</span>
        </Button>
      </div>
      <p className="border-b border-border bg-draft px-5 py-3 text-sm font-semibold text-draft-foreground sm:px-8">
        Fictional demo data · No customer research or results
      </p>
      <nav aria-label="Example steps" className="px-4 py-5 sm:px-8">
        <ol className="grid grid-cols-5 gap-1 sm:gap-3">
          {steps.map((item, index) => (
            <li key={item.short}>
              <button
                type="button"
                onClick={() => goTo(index)}
                disabled={index === 4 && !selectedChoice}
                aria-current={step === index ? "step" : undefined}
                aria-controls={panelId}
                aria-label={`${index + 1}. ${item.short}${index === 4 && !selectedChoice ? ". Choose a next move first" : ""}`}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-colors sm:flex-row sm:gap-2 sm:text-base ${step === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"} disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:text-muted-foreground`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${step === index ? "bg-primary-foreground text-primary" : "border border-current"}`}
                >
                  {index + 1}
                </span>
                {item.short}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid border-t border-border lg:grid-cols-[minmax(0,0.68fr)_minmax(0,1.7fr)]">
        <aside className="border-b border-border bg-background px-5 py-4 sm:px-8 lg:rounded-bl-3xl lg:border-r lg:border-b-0 lg:py-8">
          <p className="hidden text-xs font-bold uppercase tracking-widest text-muted-foreground lg:block">
            The starting idea
          </p>
          <p className="mt-3 hidden font-display text-xl font-bold sm:text-2xl lg:block">
            {startingIdea}
          </p>
          <div className="lg:mt-5 lg:border-t lg:border-border lg:pt-5">
            <p className="text-sm font-semibold text-muted-foreground">Assumption to investigate</p>
            <p className="mt-2 text-base leading-relaxed">{startingAssumption}</p>
          </div>
          <div className="mt-6 hidden items-start gap-2 text-sm text-muted-foreground lg:flex">
            <ArrowDownRight aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>Listen for what changes your thinking—not just what supports it.</p>
          </div>
        </aside>
        <div
          id={panelId}
          aria-labelledby={`${instanceId}-heading`}
          className="min-w-0 px-5 py-6 sm:px-8 sm:py-8"
        >
          <p className="text-sm font-semibold text-primary">
            Step {step + 1} of 5 · {currentStep.short}
          </p>
          <h3
            id={`${instanceId}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 scroll-mt-6 rounded-sm font-display text-2xl font-bold leading-tight sm:text-3xl"
          >
            {currentStep.title}
          </h3>
          <div key={resetKey} className="mt-6">
            {step === 0 && (
              <>
                <p className="mb-5 text-muted-foreground">
                  Open a perspective. Separate what happened from what we add to it.
                </p>
                <div
                  role="group"
                  aria-label="Fictional perspectives"
                  className="grid grid-cols-3 gap-2"
                >
                  {sources.slice(0, 3).map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      aria-pressed={sourceId === source.id}
                      onClick={() => selectSource(source.id)}
                      className={`min-h-12 rounded-xl border px-2 py-3 font-semibold ${sourceId === source.id ? "border-primary bg-secondary text-secondary-foreground" : "border-input bg-card text-foreground hover:bg-muted"}`}
                    >
                      {source.name}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-background p-5 sm:p-6" aria-live="polite">
                  <SourceText source={activeSource} large />
                  <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                    {activeSource.lens} · An authored example, not a participant record.
                  </p>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div className="rounded-2xl bg-secondary p-5 text-secondary-foreground sm:p-6">
                  <p className="text-sm font-semibold">Example interpretation · For human review</p>
                  <p className="mt-3 font-display text-2xl font-bold leading-tight">
                    {interpretation}
                  </p>
                  <p className="mt-4 text-sm">
                    Based on the fictional Maya, Owen and Priya excerpts.
                  </p>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <h4 className="flex items-center gap-2 font-semibold">
                      <CircleHelp aria-hidden="true" className="size-4" />
                      Another explanation
                    </h4>
                    <p className="mt-2 text-muted-foreground">{alternative}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">Still unknown</h4>
                    <p className="mt-2 text-muted-foreground">{uncertainty}</p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  This is a prepared example draft. No AI call is running.
                </p>
                <SourceReview />
              </>
            )}
            {step === 2 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-background p-5">
                    <SourceText source={sources[0]} />
                  </div>
                  <div className="rounded-2xl border-2 border-primary bg-secondary p-5">
                    <SourceText source={sources[3]} />
                  </div>
                </div>
                <div className="mt-5 border-l-4 border-primary pl-5">
                  <p className="text-lg font-semibold">
                    “All students” is too broad a working audience.
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Ask what differs between reliable groups and groups with uncertain attendance.
                    Keep the disagreement in the story.
                  </p>
                </div>
                <SourceReview />
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-muted-foreground">
                  Choose a direction to see its proposed test. There is no score; the reason
                  matters.
                </p>
                <fieldset className="mt-5 space-y-3">
                  <legend className="sr-only">Your choice in this example</legend>
                  {choices.map((choice) => (
                    <label
                      key={choice.id}
                      className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-4 ${choiceId === choice.id ? "border-primary bg-secondary" : "border-input bg-card hover:bg-muted"}`}
                    >
                      <input
                        type="radio"
                        name={`${instanceId}-choice`}
                        value={choice.id}
                        checked={choiceId === choice.id}
                        onChange={() => {
                          setChoiceId(choice.id);
                          setNotice(`Your choice in this example: ${choice.title}.`);
                        }}
                        className="mt-1 size-5 shrink-0 accent-primary"
                      />
                      <span>
                        <span className="block font-semibold">{choice.title}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {choice.summary}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="mt-5 rounded-xl bg-background p-4" aria-live="polite">
                  {selectedChoice ? (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <Check aria-hidden="true" className="size-4" />
                        Your choice in this example
                      </p>
                      <p className="mt-2">{selectedChoice.feedback}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Choose a next move to preview its test.</p>
                  )}
                </div>
                <SourceReview />
              </>
            )}
            {step === 4 && selectedChoice && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-draft px-3 py-1 text-sm font-semibold text-draft-foreground">
                    Proposed · Not run
                  </span>
                  <span className="text-sm text-muted-foreground">No outcome recorded</span>
                </div>
                <div className="mt-4 rounded-2xl bg-secondary p-5 text-secondary-foreground">
                  <p className="text-sm font-semibold">Your choice in this example</p>
                  <p className="mt-1 font-display text-xl font-bold">{selectedChoice.title}</p>
                  <p className="mt-4 text-lg font-semibold">{selectedChoice.question}</p>
                </div>
                <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="flex items-center gap-2 font-semibold">
                      <FlaskConical aria-hidden="true" className="size-4 text-primary" />
                      Small next action
                    </dt>
                    <dd className="mt-2 text-muted-foreground">{selectedChoice.action}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">What to observe</dt>
                    <dd className="mt-2 text-muted-foreground">{selectedChoice.observe}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">What could change the decision</dt>
                    <dd className="mt-2 text-muted-foreground">{selectedChoice.reconsider}</dd>
                  </div>
                </dl>
                <p className="mt-5 rounded-xl bg-background p-4">
                  <strong className="block text-sm">Still unknown</strong>
                  <span className="mt-1 block text-muted-foreground">{selectedChoice.unknown}</span>
                </p>
                <SourceReview />
              </>
            )}
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            {step < 4 ? (
              <Button onClick={() => goTo(step + 1)} disabled={step === 3 && !selectedChoice}>
                {currentStep.next}
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild>
                <a href="/auth">
                  Start my project
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
          {step === 4 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Sign in to start your own work. This fictional example is never copied into a project.
            </p>
          )}
        </div>
      </div>
      {step === 4 && choiceId && (
        <div className="border-t border-border px-5 py-6 sm:px-8">
          {(typeof continuation === "function"
            ? continuation({ choiceId, reset })
            : continuation) ?? (
            <div className="flex items-start gap-3">
              <Search aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Coming next · Planned marketing lab
                </p>
                <p className="mt-1 font-display text-xl font-bold">
                  Carry the decision into a $0 field test.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Start with your own audience and channel ideas. Then connect a truthful message to
                  a useful action, and decide what to measure. The richer in-app lab is planned.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="sr-only" role="status">
        {notice}
      </p>
    </section>
  );
}
