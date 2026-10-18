const steps = [
  {
    minutes: "10",
    period: "0–10 min",
    title: "Think before the template",
    description:
      "Students make and organize their own first plan. Keep it visible as the lesson develops.",
    artifact: "Original notes · Worksheet A",
  },
  {
    minutes: "20",
    period: "10–30 min",
    title: "Read the evidence. Find the tension.",
    description:
      "Compare four fictional perspectives. Separate source from interpretation, consider Nora’s counterexample and choose a next move.",
    artifact: "Question + explained decision · Worksheet B",
  },
  {
    minutes: "20",
    period: "30–50 min",
    title: "Design a small marketing test",
    description:
      "Choose an audience, two routes and one truthful asset. Connect it to a useful action, a resource limit and a measurement plan.",
    artifact: "Channel → asset → proposed test · Worksheet C",
  },
  {
    minutes: "10",
    period: "50–60 min",
    title: "Let a peer try the path",
    description:
      "Observe what a peer understands without an explanation. Revise, then name what changed and what remains unknown.",
    artifact: "One revision + exit reflection · Self-check available",
  },
] as const;

export function LessonSequence() {
  return (
    <ol className="divide-y divide-border">
      {steps.map((step, index) => (
        <li
          key={step.period}
          className="grid grid-cols-[3.25rem_1fr] gap-4 py-6 first:pt-0 sm:grid-cols-[4.5rem_1fr] sm:gap-6"
        >
          <div aria-hidden="true" className="pt-1">
            <p className="font-display text-3xl font-bold text-primary sm:text-4xl">
              {step.minutes}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              minutes
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {String(index + 1).padStart(2, "0")} / {step.period}
            </p>
            <h3 className="mt-2 text-xl font-bold sm:text-2xl">{step.title}</h3>
            <p className="mt-3 max-w-xl text-muted-foreground">{step.description}</p>
            <p className="mt-3 text-sm font-semibold">{step.artifact}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
