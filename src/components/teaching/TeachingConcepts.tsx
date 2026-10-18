const concepts = [
  {
    title: "Experiential learning",
    action: "Act, observe, decide.",
    description:
      "Rehearse with StudyLoop, then try a permitted action in the field assignment. Use what happened to choose a next step.",
  },
  {
    title: "Generative, student-led thinking before AI",
    action: "Keep the first plan.",
    description:
      "Students create their own notes and headings before seeing the scaffold or choosing AI help. Later revisions stay distinguishable.",
  },
  {
    title: "Scaffolded practice",
    action: "Reveal the next useful prompt.",
    description:
      "After the first plan, use the worksheets to check sources, audience, access, resources and a small test without replacing the student’s structure.",
  },
  {
    title: "Formative peer feedback",
    action: "Watch the attempt, then revise.",
    description:
      "A peer follows the asset → destination → action path. Record an observed misunderstanding or action and one response to it.",
  },
  {
    title: "Metacognition and reflection",
    action: "Explain what changed and why.",
    description:
      "Compare the starting assumption with observations. Explain a changed or retained decision, an uncertainty and what would change your mind.",
  },
  {
    title: "Responsible AI and human judgment",
    action: "Review the draft. Own the choice.",
    description:
      "AI is optional after first thinking. Students check sources, permissions and claims, describe the help received and make the decision themselves.",
  },
] as const;

export function TeachingConcepts() {
  return (
    <div className="grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
      {concepts.map((concept, index) => (
        <article key={concept.title} className="border-t border-border py-6">
          <p className="text-xs font-semibold tracking-widest text-primary" aria-hidden="true">
            0{index + 1}
          </p>
          <h3 className="mt-3 text-xl font-bold leading-snug">{concept.title}</h3>
          <p className="mt-4 font-semibold">{concept.action}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {concept.description}
          </p>
        </article>
      ))}
    </div>
  );
}
