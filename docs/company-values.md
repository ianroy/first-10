# First Ten company values

Defined for the Iteration 5 execution plan on 2026-10-17. These are operating commitments for product, teaching, brand and customer communication; they are not claims that every safeguard or feature already exists. The implementation status is in [ProductSpec](../ProductSpec.md) and the [roadmap](../FEATUREROADMAP_workplan.md).

**Purpose:** help people turn real conversations into a useful next decision, and learn how to do it themselves.

**Founder promise to test:** “Turn real customer conversations into a clearer next move.”

**Educator promise to test:** “Provision a private learning space, let students start without personal accounts, and take their evidence and decisions back out as PDFs.”

**FERPA-first commitment:** minimize student identity data, keep private notes separate from intentionally submitted work, make institution-controlled processing explicit, and support portable PDF records of every activity. Guest classroom and universal export capabilities are new roadmap work; this is not a certification claim. [Design and execution requirements](privacy/ferpa-first-product-direction.md).

| Value                         | What we do                                                                                                          | What we avoid                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Learn honestly                | Preserve disagreement, uncertainty and changes of mind; link claims to observations                                 | Invented testimonials, guaranteed customers, treating completion counts as proof                  |
| Keep people in charge         | Make AI suggestions editable; explain their sources and limits; let learners decide                                 | Automated outreach, automatic grades, disguising AI text as participant evidence                  |
| Respect participants          | Minimize personal data; explain processing and sharing; keep private notes private by default                       | Treating class enrollment, a login or note-taking consent as permission for every use             |
| Make the next step useful     | Offer one manageable action tied to the learner's actual question                                                   | More dashboards, scores or AI output without a decision they help make                            |
| Make participation accessible | Design for keyboard, mobile, readable contrast, different levels of confidence and non-AI alternatives              | Rewarding wealth, large networks, customer popularity or compulsory public disclosure             |
| Carry learning forward        | Keep reviewed evidence, decisions and revisions connected; make returning to work reliable                          | Losing drafts, replacing evidence with generic advice, silently overwriting collaborators         |
| Use resources responsibly     | Prefer deterministic computation for facts and permissions; use the least costly model that passes the task's evals | Unbounded AI calls, expensive silent fallbacks, spending more without evidence of better outcomes |

## Brand and voice brief

Aim for a calm, curious field notebook: practical, respectful and optimistic about learning. Use clear hierarchy, generous touch targets, readable type and a limited semantic palette. Color communicates meaning with text/icons as well; avoid presenting learning as a sales leaderboard. BR-001 explores and checks specific colors before adopting tokens.

Speak to the next action and the reason for it. Celebrate useful learning, including stopping or changing an idea. Explain errors without blaming the founder. Separate sample demonstrations, proposed features, recorded activity and verified facts.

| Context      | Preferred wording                                                                                             | Avoid                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Next step    | “Ask about the last time this happened.”                                                                      | “Validate your idea instantly.”           |
| Uncertainty  | “Two people described this; find out whether it repeats.”                                                     | “Your market is proven.”                  |
| Disagreement | “This challenges your starting assumption. What will you try next?”                                           | “You failed validation.”                  |
| AI           | “Draft based on these notes. Check the quotes before accepting.”                                              | “AI knows what customers want.”           |
| Teaching     | “Show what changed in your reasoning and why.”                                                                | “More interviews means a better grade.”   |
| Progress     | “Saved at 2:14. You can return to this draft.” (only when implemented and confirmed)                          | “Saved” before persistence succeeds       |
| Cost limit   | “You have reached this workspace's AI allowance. Your saved work is still available.” (only when implemented) | Silent fallback to a more expensive model |

## Using these values

Each feature's task should name the value it advances and its tradeoff. Review demos, prompts, classroom rubrics, empty/error states, access decisions and analytics against the same commitments. Values do not excuse hiding limits: the current app has no stored consent audit trail, autosave, shared workspace, teacher panel or admin analytics. The roadmap schedules those improvements without representing them as delivered.

Record a deliberate change to these commitments in the roadmap's decision log. Public claims about learning effectiveness, customer acquisition or willingness to pay require actual evidence; these commitments alone do not establish any of those outcomes.
