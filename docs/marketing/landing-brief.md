# First Ten landing and demo brief

**WEB-001 · 2026-10-17 · implementation handoff.** Based on `aca7e0d5c659989317c6f8fe4cf8a50351533089`. This document specifies copy and interactions; it does not publish a page or establish product outcomes. The founder proposition is the lead, with a distinct educator path. The owner has delegated these presentation decisions.

Read with [marketing claims](claims.md), the [research claim ledger](../../research/claim-ledger.md), [value proposition](../../research/value-prop.md), [company values](../company-values.md), [ProductSpec](../../ProductSpec.md) and [Babson pitch brief](../demo/babson-pitch-brief.md). WEB-002 builds the example, WEB-003 supplies the stack schematic, and WEB-004 composes the page. EDU-001/002 supply the teaching material and route.

## 1. Audience, job and first action

The primary reader is a student founder with a prototype and an unresolved next decision: whom to approach, what to change or what to test. The page should help them recognize that situation, inspect one example and start a project. The candidate benefit is a next move they can explain using customer observations; it is not a promise of customers or faster learning.

The secondary reader is an entrepreneurship educator looking for a practical exercise. Offer a visible route to teaching materials without implying teacher accounts, class management or grading have shipped. Workshop attendance is presentation context, not a customer count or endorsement. Keep the Babson name and the owner's reported audience of 45 out of evergreen social proof.

**Page order:** header → founder hero with example preview → three workflow benefits → interactive StudyLoop example → educator invitation and teaching concepts → planned $0 Marketing Lab preview → practical limits/FAQ → compact stack explainer → final start action. Keep the example reachable from the first screen; do not require the visitor to read the whole page.

## 2. Copy deck for WEB-004

Copy in quotation marks below is ready for implementation, subject to the capability gates in [claims.md](claims.md). IDs map to that file. Use the BR-001/002 brand decisions for typography, colors and components; this brief sets hierarchy and language, not new design tokens.

### Header and hero

| Element          | Exact copy                                                                                                                                                      | Behavior / claim                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Brand            | First Ten                                                                                                                                                       | Home; preserve existing attribution in the footer.                                                                |
| Navigation       | How it works · For educators · Sign in                                                                                                                          | `#how-it-works`, `#for-educators`, `/auth`; the educator label can link to `/teach` after that route is verified. |
| Eyebrow          | For student founders                                                                                                                                            | M01: intended audience.                                                                                           |
| H1               | Real conversations. A clearer next move.                                                                                                                        | M02: candidate aim. Two short lines where space permits; never use an image for this text.                        |
| Supporting copy  | You’ve built something. Now explore who to focus on, what to change and what to try next—with editable questions, conversation notes and AI-assisted summaries. | M02–M04: aim supported by current tools, not a measured outcome.                                                  |
| Primary CTA      | Explore the example                                                                                                                                             | `/demo`, enabled only after WEB-002 and route integration pass.                                                   |
| Primary helper   | Fictional example. No account needed.                                                                                                                           | M10: only after the public example works without login.                                                           |
| Secondary CTA    | Start my project                                                                                                                                                | `/auth`, the current working entry.                                                                               |
| Secondary helper | Sign in by email, then add your project.                                                                                                                        | M08: a returning account continues to its dashboard.                                                              |
| Educator link    | Teaching entrepreneurship? See the lesson.                                                                                                                      | `/teach` after EDU-002 and route integration pass; otherwise use the fallback below.                              |

**Before public routes are ready:** replace the primary CTA with “See how it works” to `#how-it-works`; show a static, clearly fictional StudyLoop preview there. Replace the educator link with “Teaching entrepreneurship? Explore the classroom idea.” to `#for-educators`. In that section use the pre-release copy below. Do not publish dead links, disabled navigation that looks clickable, “no account needed” for an auth-only flow, or a fake waitlist.

**Hero preview:** a compact three-part card headed “StudyLoop · Fictional example.” Show the starting assumption “Students need more study partners,” Maya’s fictional quote, then the proposed choice “Test attendance confirmations before building a discovery feed.” Label the last field “Proposed next move.” This is a teaching preview, not a screenshot of a shipped evidence-record feature or a testimonial. Use the same source text and identifiers as §4.

### Three benefits: `#how-it-works`

Section heading: **“From a conversation to something you can try.”**

| Benefit heading          | Exact body                                                                                             | Evidence                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Ask about what happened. | Start with draft questions about recent situations and real workarounds. Edit them before you go.      | M03; prompt intent, not guaranteed question quality.                           |
| Review what you heard.   | Capture notes and exact words. Review an editable AI summary, and check it against your conversations. | M04; explain the five-completed-interview entry point in the FAQ.              |
| Try one small change.    | Log an experiment, record what happened and carry reviewed learnings into later outreach.              | M05–M06; results and outreach actions are entered or performed by the founder. |

Follow with the small boundary line **“AI drafts. You review and decide.”** (M07.) Use observable actions as the evidence; omit customer-logo strips, adoption counts, ratings and fabricated testimonials.

### Example introduction

Eyebrow: **“Explore a fictional case”**

Heading: **“What if the first assumption changes?”**

Body: **“StudyLoop starts as a way to find study partners. Follow four fictional perspectives, inspect what challenges the idea, and choose a next test.”**

Persistent example label: **“Fictional demo data · No customer research or results”**. The five interactive steps are in §4. For an embedded version, keep a visible “Open full example” link to the verified `/demo` route. The example demonstrates a method under development; source-linked review in this example does not imply the signed-in app already supports claim-level citations.

### Educator section: `#for-educators`

Eyebrow: **“For entrepreneurship educators”**

Heading: **“Make the reasoning visible.”**

Aim: **“Help students show what they heard, what challenges their idea and why their next step follows.”** (M12.)

After teaching materials and `/teach` are verified, use: **“Try a 60-minute classroom exercise or a one-week assignment. Students connect an observation, an interpretation and a next test; the rubric focuses on reasoning and revision.”** (M13.) CTA: **“Explore teaching resources”** → `/teach`.

Before those resources ship, use: **“Use the fictional example to discuss observations, interpretations and next tests. Classroom lesson materials are planned.”** CTA: **“Explore the example”** → verified `/demo`, or **“Read the example”** → the on-page static story.

Capability note, separate from the lesson CTA: **“Teacher panels, class submissions and shared project work are planned.”** (M14.) Do not use teacher-dashboard mockups without an adjacent “Concept” label, promise learning gains, or imply attendance at the workshop establishes institutional adoption.

### Teaching built into the workflow

Use this exact heading on the landing page and carry the six named concepts into the pitch deck. These are design principles and visible practices, not proven learning effects. Keep the status labels adjacent to the practice so a planned classroom workflow cannot be mistaken for a shipped feature.

| Named concept                     | Concise public copy                                                             | Visible practice / honest status                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiential learning             | “Learn from a real action, then decide what to try next.”                       | **Current:** conversation notes and experiment results. **Planned:** a complete one-week marketing field test and review.                                                               |
| Generative, student-led thinking  | “Think first. Build your own plan. Then use AI to question and improve it.”     | **Planned:** student-created notes and structure before AI/template help. The current question-list setup starts with AI; do not claim this sequencing already exists there.            |
| Scaffolded practice               | “Move through a manageable sequence of questions, actions and checks.”          | **Current:** interview prompts and stage checklists. **Planned:** support that follows the student’s initial plan and helps identify missing pieces without forcing identical headings. |
| Formative peer feedback           | “Let a peer try the path, then revise what gets in the way.”                    | **Planned exercise:** asset → destination → first useful action walkthrough; record what the peer understood and did. This does not imply shared accounts or a peer-review feature.     |
| Metacognition and reflection      | “Explain what changed in your thinking—and what remains uncertain.”             | **Current:** editable learnings and manually entered experiment results. **Planned:** structured reflection on evidence and a repeat/revise/stop decision.                              |
| Responsible AI and human judgment | “Use AI for drafts. Check the claims, respect the people and own the decision.” | **Current:** editable drafts and founder-controlled sending. **Planned:** student-first drafting, explicit resource limits and stronger processing/sharing controls.                    |

Source: owner-supplied **BUS131 · Fail Faster, Fail Smarter / Week 6**, especially pages 4–7, 12–14, 17 and 19–24. The named concepts interpret the activity design; the deck is evidence of the owner’s teaching approach, not an effectiveness study. Marketing mappings: M21–M26.

### Planned Next 50: the $0 Marketing Lab

Eyebrow: **“Coming next · Next 50”**

Heading: **“A $0 marketing plan you can actually run.”**

Body: **“Start with your own thinking. Choose a specific audience, investigate where to reach them, and build a one-week test. Use AI to help adapt an asset to the channel; review what people actually do, then repeat, revise or stop.”**

Show the proposed sequence as five short labeled beats:

1. **Audience:** choose a beachhead, a useful first action and a sourced observation; keep assumptions and unknowns visible.
2. **Channel map:** investigate physical and digital places. Select two reachable routes, checking audience fit, access and rules.
3. **Content:** draft a channel-specific asset; connect its truthful promise to the destination and the first action. Use AI after the student’s initial plan, with review before any publication.
4. **One-week test:** set owners, deadlines, time and resource limits; walk through the full path with a peer before outreach.
5. **Measure and reflect:** distinguish relevant reach, visits/starts, useful action and return/referral. Record dates and sources, then decide what to repeat, revise or stop.

Boundary line: **“Planned capability. $0 means no new cash spending; time, access and existing AI allowances still have limits.”** (M27.) Do not present platform funding, free printing/travel, automated publishing, verified channel access, unlimited AI or automatic attribution as included. Current Stage 2 offers editable channel/message/survey drafts and a manual pipeline; this richer lab is not yet implemented.

Before implementation, this is an informational preview with no “Open marketing lab” CTA. The educator link may lead to a real lesson once shipped; it must not imply the planned in-app lab exists. Do not equate views with users, shares with adoption or a generated asset with a completed marketing test.

### Practical questions

Use a short, readable disclosure list. Answers must remain available in the text alternative and work with keyboard controls.

| Question                         | Exact answer                                                                                                                                                                                                                                                      | Claim                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| What happens when I start?       | Sign in by email, describe your project and add someone whose experience could help you learn. Draft and edit questions before the conversation.                                                                                                                  | M03, M08. No promise that signup finds a participant.                                   |
| When can I review an AI summary? | The current app offers a summary after five completed interviews. Review the draft and check quotes against your notes before accepting it.                                                                                                                       | M04. Five completed records, not five verified customers.                               |
| What does AI do with my notes?   | AI helps draft questions, summaries and outreach. When you generate, selected project details and relevant notes are sent through OpenRouter to a model provider. Avoid sensitive information, and make sure you have permission for how you use and share notes. | M07, M09. Do not call the current checkbox provider-processing consent.                 |
| What do 10, 50 and 100 mean?     | They are workflow goals. Early progress counts completed interviews; later progress uses contact statuses you enter. Counts alone do not establish demand or returning customers.                                                                                 | M15. Keep the ladder out of the hero; do not suggest the targets are unlock thresholds. |
| Can a class collaborate here?    | The current app supports an individual founder’s project. Teacher panels, class submissions and shared project work are planned.                                                                                                                                  | M14. Recheck after verified integration.                                                |

The current interview flow saves at wrap-up, not continuously. Keep that limit visible at capture/onboarding rather than claiming autosave in marketing. No “free forever,” unlimited allowance, institutional pricing or production privacy certification is specified by this brief.

### Stack and final action

Heading: **“How it works behind the scenes.”**

Plain-language text: **“The signed-in app stores your work in Supabase. AI requests go through a server function to OpenRouter and a model provider. You review the returned draft.”** (M16.) Use WEB-003’s diagram and text equivalent; do not imply that a diagram proves security or model accuracy. Add **“The fictional example runs without a live AI call.”** only after M11 is verified.

Final heading: **“Start with one useful conversation.”**

Body: **“Choose someone with experience of the problem. Ask what happened. Decide what to try next.”**

CTA: **“Start my project”** → `/auth`. Secondary, after verification: **“Explore the example”** → `/demo`. No countdown, guaranteed result or pricing promise.

Metadata title: **“First Ten — Conversations into next steps”**. Description and share text: **“A customer-discovery workspace for student founders: prepare questions, capture notes, review AI drafts and plan a small experiment.”** The share image may show the fictional StudyLoop preview only with its sample label; never add endorsement logos or outcome counters.

## 3. Design and interaction intent

Use a calm field-notebook character with a confident opening: spacious type, a clear primary action and a tangible example visible immediately. The landing page should feel like a useful product, with copy the reader can scan on a phone and an example readable on a projected screen. Do not fill the first screen with architecture, model names, caveats or feature inventory.

Each visible item earns its place: a quote is evidence inside the fictional story; an interpretation has a different label; a proposed experiment has no result. Keep labels textual, not color-only. Use BR-002 tokens, strong visible focus, accessible contrast and reduced-motion support. Prefer restrained transitions; no autoplay, essential hover-only content or timed progression. Desktop can pair source and reasoning panels; mobile stacks source before interpretation and action.

A reader should be able to identify the audience, the next-decision job and the first action from the hero alone. Verify this as a copy/readability inspection now; later comprehension sessions may test it, but no comprehension result is claimed here.

## 4. WEB-002: five-step StudyLoop storyboard

The example is a **deterministic educational illustration**. It contains fictional perspectives, local choices and proposed tests. It is not a live AI result, an interview study, saved founder work or an implemented teacher submission. Display the persistent fictional label across all five steps. Keep source and reasoning labels visible when panels change.

### Fixed source material

The following IDs identify fixture excerpts only. They are not production interview IDs. Only Maya has a direct quote in the owner’s story; preserve the other entries as paraphrased fictional notes.

| Fixture ID        | Visible source                  | Content                                                                              |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `studyloop-maya`  | Maya · fictional quote          | “I don’t need more people. I need to know who’s actually showing up.”                |
| `studyloop-owen`  | Owen · fictional note           | Describes repeated last-minute messages to work out who will attend a study session. |
| `studyloop-priya` | Priya · fictional note          | Describes an existing group that works well when attendance is clear.                |
| `studyloop-nora`  | Nora · fictional counterexample | Already has a reliable study group and does not want another app.                    |

Starting idea: **“Help students find study partners.”** Starting assumption: **“Students struggle to find enough people to study with.”** These belong to the fictional founder. Four perspectives are selected for the illustration; this does not bypass the real app’s five-record synthesis threshold or represent a complete research dataset.

| Step                | Exact panel title                      | Show and let the visitor do                                                                                                                                   | Reasoning / transition                                                                                                                                                                                     |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Evidence        | What did people describe?              | Open Maya, Owen and Priya source cards. Start with Maya expanded; source text remains inspectable later.                                                      | Prompt: “What happened, and what are we adding to it?” Continue: “Consider an interpretation.”                                                                                                             |
| 2 · Interpretation  | A different problem may be emerging.   | Show a labeled interpretation linked to the three fixture cards: “Attendance coordination may matter more than finding more people for some existing groups.” | Alternative explanation: “These groups may need a clearer agreement, not another app.” Uncertainty: “We don’t know how common this is or whether a tool would help.” Continue: “Check what challenges it.” |
| 3 · Counterevidence | Nora already has a system that works.  | Reveal Nora’s note beside the starting assumption. Let the visitor reopen it and compare with Maya.                                                           | “This challenges a broad audience of all students. Ask what differs between reliable groups and groups with uncertain attendance.” Continue: “Choose a next move.”                                         |
| 4 · Choice          | What would you try next?               | Offer three explicit local choices with the feedback below; no correct-answer score. Include a “Review sources” control.                                      | The canonical pitch path selects “Test attendance confirmations.” Label any selection “Your choice in this example.” Continue: “Preview the next test.”                                                    |
| 5 · Experiment      | Make the next test small and specific. | Show the deterministic proposed plan for the selected choice. Keep its source references and uncertainty visible.                                             | Status: “Proposed · Not run.” Result: “No outcome recorded.” End actions: “Start my project,” “Reset example,” and the verified teaching link.                                                             |

### Choice feedback and proposed plans

| Choice at step 4                 | Immediate feedback                                                                                                                                          | Step 5 fixture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test attendance confirmations    | “Focus on existing groups with uncertain attendance. This tests the coordination interpretation without assuming that every student needs another app.”     | **Question:** Would a simple confirmation flow be useful for these groups? **Action:** Invite five consenting groups with this problem to try it for one week; compare each group’s own attendance records with its prior routine. **Observe:** Whether groups use it, missed confirmations, attendance and workarounds. **What might change the decision:** Groups ignore it, their existing chat works as well, or coordination improves without a new app. **Unknown:** Whether any change would persist or result from the confirmation flow. |
| Ask another group                | “You can investigate the disagreement before building. Look for how a reliable group organizes itself and how an uncertain group differs.”                  | **Question:** What explains the contrast? **Action:** Speak with one group with reliable attendance and one with uncertainty about their most recent session. **Observe:** Their existing agreements, reminders and actual attendance. **What might change the decision:** The problem is not recurring or has a simpler non-product solution. **Unknown:** How widespread either situation is.                                                                                                                                                   |
| Keep exploring partner discovery | “You can retain the original direction, but these excerpts do not yet support it. Look for people who recently tried and failed to find suitable partners.” | **Question:** Who has an unmet partner-finding problem? **Action:** Seek recent concrete attempts and current workarounds before building the feed. **Observe:** What was tried, who was available and what blocked a useful match. **What might change the decision:** Existing ways of finding partners already meet the need. **Unknown:** Whether a discovery feed would be used.                                                                                                                                                             |

No plan has a fabricated result, success percentage, payment, completed recruitment or future guaranteed date. Use a sensible “not yet selected” state at step 4: “Choose a next move to preview its test.” Do not force a positive conclusion. Let Back and source inspection work at every step; choosing an option is a local demonstration choice, never market evidence.

### Determinism, accessibility and fallback

- Initial state: step 1, Maya open, no decision selected. “Reset example” restores exactly that state, clears the local selection and announces “Example reset.” Refresh returns to the known start. Do not claim cloud saving or durable continuation.
- Use ordinary keyboard-operable controls, a visible current-step indicator such as “Step 2 of 5,” named source buttons and announced panel/selection changes. Move focus predictably on step changes and preserve access to the Back control. Reduced motion must preserve all meaning.
- Keep all source data bundled with the app. The example must not call `generateAI`, Supabase auth/CRUD, contact anyone or load real projects. Its fixtures must never enter production/research metrics. Page assets are normal network requests; “no live AI call” does not promise the whole website works offline.
- Provide “Read the example” as a static text alternative containing all four sources and the canonical interpretation, counterexample, decision, proposed test and no-result status. This is also the stage fallback if the interaction fails.
- `/demo` is the intended public route, but route registration belongs to the coordinator/integration task. WEB-002 exports reusable components and fixtures within its scope. An embedded and full-page version must use the same material and state rules.

### Static narrative / stage fallback

> **StudyLoop · Fictional demo data.** A student starts with an app for finding study partners. Maya says, “I don’t need more people. I need to know who’s actually showing up.” Owen describes last-minute scheduling messages; Priya describes a group that works when attendance is clear. One interpretation is that coordination matters for some existing groups. Nora already has a reliable group and does not want another app, so “all students” is too broad a working audience. The proposed next move is to explore existing groups with uncertain attendance and test simple confirmations before building a discovery feed. The proposed experiment would invite five consenting groups to try it for a week and compare their own attendance records. It has not run. There is no outcome to report.

### Planned marketing continuation: channel → content → measurement

Extend the StudyLoop teaching story with these three compact beats under the proposed experiment, or a separately labeled preview after the core five steps. They are a design handoff for the requested Next 50 direction; until implemented, keep them static and explicitly “Planned marketing lab.” The founder supplies the first structure before any AI help. Do not simulate a paid generation or claim the fictional communities were researched.

| Beat        | StudyLoop illustration                                                                                                                                      | What a visitor should be able to inspect                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel     | Compare an organizer introduction to an existing study group with a relevant digital study-group space. Choose one primary route and one small alternative. | Audience fit, exact venue/link **to be researched**, permission/rules **unknown**, time/access limits and a no-cost fallback. Never invent a real group URL or say posting is allowed.                                                                                                    |
| Content     | Begin with the student’s own hook and first ask; preview a clearly fictional, editable organizer-request draft appropriate to the selected route.           | “I’m testing a simple way for existing study groups to confirm attendance. Does your group have this problem? If appropriate, may I show the idea?” Trace asset → destination → first action. Label destination/demo links as placeholders unless they actually work; no sending control. |
| Measurement | Define the intended useful action, the data source and the review date before any outreach.                                                                 | Relevant reach → visits/starts → useful action → return/referral, all **not measured**. Separate peer tests, classmates and outside participants; name numerator/denominator for any future rate. End with “Repeat, revise or stop—and why?” No synthetic performance numbers.            |

This continuation demonstrates how the same reasoning loop reaches marketing execution: audience → channel → content → test → observed behavior → reflection. It cannot establish real acquisition or a causal effect from a tiny comparison.

## 5. Three-minute pitch handoff

Use the [pitch brief](../demo/babson-pitch-brief.md) for the full run of show. The page supplies: **0:00–0:20** founder hero; **0:20–0:40** StudyLoop assumption and fictional label; **0:40–1:25** Maya → tentative interpretation → Nora → choice; **1:25–1:55** proposed experiment and unanswered question; **1:55–2:25** verified teaching resources plus “Teaching built into the workflow” (name experiential learning, student-led thinking before AI, scaffolded practice, formative peer feedback, reflection and responsible AI); **2:25–2:45** WEB-003 stack; **2:45–3:00** invitation to try the exercise and critique the reasoning it reveals.

90-second fallback: hero → Maya/Nora contrast → next test → verified lesson link. For a five-minute expansion, inspect another source, discuss an alternative decision and show the planned channel → content → measurement continuation. The slide deck must name the same six pedagogical concepts and distinguish current practices from planned support; the $0 lab is an upcoming capability until verified. Add live-account persistence or teacher submission only after those specific paths pass release checks. No paid AI call is necessary to complete the core presentation.

## 6. Acceptance handoff

Before enabling each public CTA, check its destination in a signed-out browser and preserve the working `/auth` entry. Inspect the hero at mobile and projected desktop sizes; check keyboard focus, readable diagram/text equivalents, static fallback and reset. Verify that each selected decision gives the matching proposed plan and never records an outcome. Record actual checks in the implementation task, then update [claims.md](claims.md) with the deployed revision for any newly current capability. Documentation review does not substitute for those checks.
