const steps = [
  ["Frame the idea", "Describe a problem space or a possible solution in your own words."],
  [
    "Make it falsifiable",
    "Write a prediction and what would weaken it before asking AI for adjacent hypotheses.",
  ],
  [
    "Map five people",
    "Choose reachable people and explain why their experience fits the question.",
  ],
  [
    "Challenge the sample",
    "Consider politeness, missing perspectives, false positives and false negatives.",
  ],
  [
    "Prepare the script",
    "Connect questions to the hypothesis. Edit, pivot and keep earlier versions.",
  ],
  [
    "Go and interview",
    "Save or print the script. Ask about recent behavior and record what actually happened.",
  ],
  [
    "Choose the next move",
    "Separate observations from interpretations, weigh counterevidence and decide what to test or change.",
  ],
] as const;

/** Public method overview; availability belongs in the surrounding page. */
export function DiscoveryCycleOverview() {
  return (
    <div>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map(([title, description], index) => (
          <li key={title} className="rounded-2xl border bg-card p-5">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">
              {index + 1}
            </span>
            <h3 className="mt-4 text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </li>
        ))}
      </ol>
      <aside className="mt-4 rounded-2xl border border-primary/25 bg-secondary p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Across every step
        </p>
        <h3 className="mt-4 text-lg font-bold">Bring the product context.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Use a live-site or repository link, product text or pasted prompt output. Review what may
          inform advice. A link is not a retrieved source; AI text is not customer evidence.
        </p>
      </aside>
    </div>
  );
}
