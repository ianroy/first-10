# First Ten

**Turn real customer conversations into a clearer next move: who to focus on, what to change, and what to try next.**

First Ten is a responsive web app for student founders with a live prototype or app and few or no recurring users. It brings a people list, interview questions, notes, AI-assisted synthesis, experiments and outreach drafts into one guided workflow. The founder talks to people, checks the evidence and decides what to do.

This is the **candidate value proposition** being tested. The existing app implements a three-stage ladder; research is now focused on whether that ladder helps founders make better decisions and take useful action. There are no founder interviews or pilot outcomes recorded in the research workspace yet, so improved acquisition, retention and willingness to pay remain unproven. The public page explains this provisional proposition; no acquisition or learning-effect claim has been validated.

- [Open First Ten](https://first-10-three.vercel.app) · [Explore the fictional demo](https://first-10-three.vercel.app/demo) · [Teaching resources](https://first-10-three.vercel.app/teach) · [Workshop pitch](https://first-10-three.vercel.app/pitch/index.html) · [GitHub repository](https://github.com/ianroy/first-10)
- Built for the Babson AI Academy by the [First Ten team](#team). First scaffolded in Lovable, then moved to GitHub, Vercel and Supabase.
- [ProductSpec.md](ProductSpec.md) describes the current product and its boundaries. [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md) is the source of truth for research, delivery gates and the next task.

## The decision First Ten aims to help with

“I launched, got little useful response, and don't know whether to change the product, change who I'm approaching, or keep trying.”

The initial audience to test is a student founder who has recently tried to find users. A course participant and a self-directed founder may have different reasons to return; research will examine them separately. Instructors are possible reviewers or champions, and a budget owner may be someone else. The current app has private instructor planning, but no cohort workspace or student-review access.

The immediate outcome to test is a founder who can say: **“I know whom I'm learning from, can point to something they did or described, understand what is still uncertain, and have chosen my next move.”** Finding users who return is the longer-term aspiration. Narrowing an audience, retaining a decision for a clearer reason, or stopping a weak idea can also be a useful result.

The owner-defined student framework is:

1. Describe a problem space or solution idea in your own words.
2. Write a first **falsifiable hypothesis**: what observation would support it, and what would weaken it? Then consider feedback and several adjacent hypotheses.
3. Map **five reachable people**, their relevant experience and your relationship to them.
4. Consider possible false positives and false negatives, missing perspectives and ways to reduce sampling bias.
5. Build an interview script from that map; edit questions or pivot the hypothesis.
6. Save or print the script, then conduct the interviews with permission.
7. Enter observations and use optional AI help to choose an actionable product change, another test or a pivot.

Attach a live-site/GitHub link or paste relevant prompts, outputs and product context throughout the cycle. A stored link must be distinguished from actually retrieved contents; generated text is not customer evidence. The [framework contract](docs/pedagogy/student-discovery-framework.md) records this new core direction. The private **Discovery cycle** at `/discovery` now saves the manual seven-step journey, first and later hypothesis versions, five-person sampling/bias map, editable script versions, reviewed links/pastes and results/next decisions. Every step exports as a PDF, including the selected script and a blank interview worksheet; saved work also appears in the dashboard/Account portfolio. Saved manual links are not fetched or sent to AI. A separate bounded public-site/GitHub preview and exact-excerpt review interface is implemented, with bounded retrieval enabled after controlled deployed public-site and commit-pinned GitHub checks. Preview, reviewed excerpt and withdrawal receipt PDFs retain their permission and evidence limits. Retrieved text is not sent to AI in this slice. Adjacent-hypothesis/sampling feedback and generated scripts remain in DISC-002/003; reviewed-source AI inclusion remains in CTX-001.

For example, a founder building a study planner might hear that a student already plans carefully but loses track when assignments change. A useful next move could be to test a change-notification flow with students who have that problem. The conversation does not establish that they will use or pay for it. This is an illustrative example, not a customer result.

The proposed advantage is continuity from conversation to decision to follow-through. It still needs to earn its place alongside a founder's existing AI chat, documents, mentor and course tools. The app supports pieces of this loop today; general claim-level evidence links and a source-linked decision record remain research concepts.

## FERPA-first classroom direction

**A private learning space students can join without creating a personal account, with every activity exportable as a PDF.** Teachers can provision spaces for classes and hackathons at `/classes`; students enter through a bounded link or QR using optional aliases. The full direction adds reviewed submissions and portable copies of classroom work. Teacher visibility follows explicit class/team permissions and submitted versions. Private notes stay separate, and external AI remains a distinct, optional processing choice.

This is a core product requirement now staged in the roadmap. Owner-private activity PDFs and selected saved-work portfolios are now implemented. Teacher provisioning, published assignments and account-free entry are implemented. The manual seven-step guest studio now saves private-principal or explicitly shared-team work, with preserved hypotheses/scripts, five-person bias mapping, private interview notes, reviewed teacher/team submissions and individual or selected-portfolio PDFs. Broader guest Marketing Lab/outreach parity, account transfer and teacher-authorized full student-team bundles remain in development. Class-entry links, team invitations and private recovery keys have separate authority; a class QR never opens another team’s private notes. FERPA-first describes the design and operating commitment; institutional review and applicable agreements remain separate from engineering. See the [privacy and export direction](docs/privacy/ferpa-first-product-direction.md).

## A classroom process you can inspect

The login-free **StudyLoop** example follows fictional perspectives through an interpretation, a counterexample, a choice and a proposed next test. Its resettable, deterministic flow needs no live model response and writes no product data. The example demonstrates a method; it does not claim that every source-linked interaction exists in the private app.

The [teaching kit](public/teaching/resources.json) provides a complete 60-minute lesson (10 minutes own thinking, 20 evidence, 20 marketing-test design, 10 peer review), a one-week $0 marketing assignment, six editable handouts and a nine-page printable PDF. Students map an audience to a primary channel and an alternative, develop truthful content, define an observable useful action and reflect on whether to repeat, revise or stop. The saved in-app Marketing Lab now supports a manual five-step plan at Stage 2. Its dedicated channel/content AI kinds remain planned; the teaching kit works without an account or AI.

The signed-in **Instructor planner** at `/teacher` saves one private lesson plan per selected project. Start with the 60-minute StudyLoop lesson, adapt its objectives and assignment, consult the reference agenda and reasoning rubric, and preview the student task. The preview excludes private facilitator notes and does not publish or assign anything. Planned learner capacity is an estimate, not enrollment or attendance. Use **Save plan** and wait for its confirmed revision; conflicting edits require review.

Six teaching concepts connect to visible activities: **experiential learning; generative, student-led thinking before AI; scaffolded practice; formative peer feedback; metacognition and reflection; responsible AI and human judgment**. Students keep their initial thinking, inspect disagreement and explain their decision. AI is optional; the rubric assesses reasoning and revision rather than customers, network size or AI usage. These are teaching design commitments, not measured learning gains. See the [pedagogy map](docs/teaching/pedagogy-map.md) for primary sources and limits.

The original First Ten identity uses a conversation-shaped **10**, Field notebook colors and scalable light/dark assets. The [company values](docs/company-values.md) connect honest learning, human judgment, participant respect, accessibility, useful action, continuity and responsible resources to product decisions.

## What you can do today

1. **Sign in and describe your app.** Use email and password, create an email/password account, or request an email sign-in link. Password sign-in offers **Student**, **Educator** and **Admin** destinations; choosing a destination grants no new permissions. Setup collects name, description, audience, problem and optional app link. Each account can keep multiple private ideas, with one selected at a time.
2. **First 10 — learn from relevant people.** Add first names and why each person fits. Generate and edit interview questions about past behavior, save them, select a contact and confirm permission to take notes. Interview mode keeps an exact saved script and shows one question per screen with notes and an optional quote. Explicitly save and resume private drafts across visits; drafts never count as completed interviews or AI evidence. Review the saved revision and deliberately complete it after a real conversation. Repeat interviews may link a person from any stage without resetting their existing pipeline state.
3. **Review learnings and try a change.** After five saved, completed interviews, generate an editable synthesis of problems, objections, best-fit users, quotes and suggested changes. Review it against your notes before accepting it. Log an experiment with a hypothesis, change and result; the result can be updated later.
4. **Next 50 — reach beyond the first group.** Once unlocked, generate suggested channels, editable outreach bodies and feedback-survey questions using your project, completed interviews, accepted learnings and contact-source notes. Copy drafts to send yourself and manually update contacts through Contacted → Replied → Tried it → Active → Paying. Channel suggestions are AI-generated, not verified community research; the survey is text to copy, not a hosted response-collection form.
5. **Next 100 — try broader outreach.** Once unlocked, generate channel ideas, referral asks and onboarding questions. Enter your own sign-up, active and returning-user counts. These metrics are not connected to your app's analytics.

The dashboard brings together the next-step suggestion, stage progress, contact pipeline and a timeline of learnings and experiments. A desktop sidebar and responsive panels support classroom projection; mobile keeps bottom navigation. **Account & saved work** lists your ideas, opens a selected project, shows its record counts and links to edit its details. Choose **New idea** to start a separate project without replacing existing work. Recoverable archive/restore and reviewed activity PDF exports are available. Archived ideas reject ordinary content edits, new generation and new grants while retaining owner read/export/restore and permission-reducing actions; already dispatched requests cannot be recalled. Permanent account deletion remains planned. All AI outputs need human review; the app never sends outreach to interviewees or customers.

**AI availability:** general private-project drafting currently stays disabled until model eligibility/quality checks, an operator-reviewed opening balance and explicit allowances are in place. Bounded source selection, exact quotation checks and an atomic permission/version check before dispatch are implemented; these software checks do not establish model quality. The existing fixed fictional workshop practice keeps its original capped allowance. Manual Discovery cycle, questions, notes, plans and PDFs remain available. The new ledger prevents automatic duplicate dispatch and holds uncertain charges; no paid model evaluation is claimed.

### Take activity work with you

Use **Export activity PDF** beside current work to select an activity, redact details, review a frozen copy and download it. Exports include idea briefs, editable interview scripts, in-progress/saved interviews, synthesis, experiments, outreach/surveys/metrics, each Marketing Lab step and private instructor planning. Public fictional exercises also export without login. Current-screen exports include local edits; exporting never saves, submits, sends or grants access.

On the dashboard or Account, open **Your activity portfolio** for saved records and saved marketing/teacher plans from the selected idea, including recoverable archived work and private saved interview drafts. Choose explicit batches rather than silently omitting large activities. Draft, fictional and unknown labels remain visible. PDFs are generated locally using bundled fonts; no AI call or paid renderer is involved. Latin/Greek/Cyrillic are supported; unsupported scripts fail visibly. Teacher access to real student-team bundles remains a separate classroom feature. See the [coverage and limits](docs/export-coverage.md).

### Choose a workspace at sign-in

`/auth` remains available when an account is already signed in. Continue the current workspace or use another login; opening the page alone does not send an existing session away. Student opens the private project dashboard, Educator opens the private lesson planner, and Admin requires the trusted server-assigned aggregate permission. New accounts receive private project and lesson-planning tools, not admin access. The public `/demo` remains available without signing in.

The known fictional presenter gets explicit **Open student demo**, **Open educator demo** and **Open admin demo** buttons. These launches select the reserved StudyLoop project and clear cached query results; they do not reset or overwrite saved project content. The password remains private. The educator demo includes four authored fictional team examples alongside private lesson planning. These examples are not enrolled teams, live student progress or permission to inspect another account; planned class capacity remains an estimate.

### Save another idea and return later

Open **Account & saved work** to choose an existing idea or create a new one. Each keeps its own people, interviews, learnings, experiments, outreach, Marketing Lab plan and private lesson plan. **New idea** opens `/setup?new=true` and creates a separate project; **Edit this idea** changes only the selected project.

This browser remembers your selected idea separately for each signed-in account. Your projects are saved in Supabase and available on another device, where you can choose one from the account list. With no remembered choice, the app opens your earliest project. If a remembered project is missing or no longer accessible, it reports that problem instead of silently opening another; use Account & saved work to choose an available idea. Save your edits before leaving a workflow.

### The saved $0 Marketing Lab

At `/marketing`, Stage 2 opens **Think first → Map channels → Make content → Plan the test → Review learning**. Preserve your initial observations, audience, useful action and channel ideas before using the structured steps. Map physical or digital channels, choose a primary route and an alternative, draft truthful content, plan a one-week test and record a repeat/revise/stop reflection. The planner adds owners, due dates, prerequisite checks, completion definitions and manual test states. Optional attribution tags have an explicit preview/adopt step that strips credentials, query parameters and fragments; inspect the retained path and destination yourself. Tags do not enable tracking. The review step records manual counts with channel, date window, source, units and separate peer/classmate/outside cohorts. Unknown counts stay blank. Comparable rates require matching populations, a positive denominator and an explicit subset check; edits clear that confirmation. These are reported observations, not an automatically tracked funnel. There is no automatic publication, audience verification or analytics collection. $0 refers to new cash spend, not unlimited time, printing, travel or free AI.

Use **Save draft** and wait for confirmation. Saves check the current revision and reject conflicting updates instead of overwriting another save. The database retains three previous snapshots; the page currently offers reloading the latest saved version, not a history-restore interface. Once completed, the initial thinking is preserved. In Review learning, **Review Markdown export** shows a local snapshot—including unsaved plan edits and adopted source notes—before you download it. The download does not save or share the plan, and temporary AI practice text is excluded.

### Restricted fictional AI practice

**Implemented and verified with a live fictional practice draft on 2026-10-18.** The dedicated fictional presenter can request a temporary marketing invitation draft after preserving its initial Marketing Lab thinking. This practice sends only the fixed authored StudyLoop case to OpenRouter, not private project text, interview notes or the saved plan. The response can be reviewed and edited locally; it is not saved into the plan, copied into an asset or sent anywhere automatically.

This restricted path uses Gemini 2.5 Flash Lite through Vertex-only routing, requests zero-data-retention and no-data-collection eligibility, and makes one attempt with no provider fallback. Each request reserves 2¢ against a fixed $1 workshop allowance before calling the provider; failed or uncertain attempts retain that reservation. The existing four private AI workflows remain on their current baseline and are not covered by this workshop budget. This is neither general marketing AI nor a completed model-quality/privacy evaluation.

### What the ladder counts

| Stage    | Dashboard goal                                         | Current requirement to unlock the next stage                                                                                                                                  |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First 10 | 10 completed interview records                         | At least 5 completed interviews, an accepted synthesis, a Stage 1 experiment, and manual confirmation that you can describe your best-fit user and made or scheduled a change |
| Next 50  | 50 Stage 2 contacts marked Tried it, Active or Paying  | At least 10 such contacts, a nonempty feedback survey, a Stage 2 experiment, and manual confirmation that you reviewed survey answers                                         |
| Next 100 | 100 Stage 3 contacts marked Tried it, Active or Paying | Final stage; no further unlock                                                                                                                                                |

The goals and unlock thresholds differ. They are workflow guides, not evidence that demand is validated. Counts and statuses are founder-entered records; tags such as “would use” and “would pay” do not establish actual use or payment. An introduction, a trial, repeat use and payment answer different questions.

### Current limits that affect use

- Private interview drafts autosave after a short pause and show saved only after acknowledgement. Failed or uncertain saves pause automatic retries while preserving local text; conflicts offer a separate saved-version comparison. Incomplete drafts do not add to interview counts or AI evidence. No offline cache is provided; keep the page open until saved.
- Synthesis does not provide structured links from each claim to its source interview. Check generated quotes and interpretations against the original notes.
- Regenerating a synthesis replaces it and resets acceptance. Regenerating outreach replaces the stage's saved drafts; Stage 2 regeneration also replaces the survey.
- There is no automated follow-up, public evidence pack, interview authenticity check, cohort dashboard or shared project membership.

## What we are testing next

[Iteration 5](FEATUREROADMAP_workplan.md) stages the requested product expansion alongside research: economical AI, a new brand and demo landing page, teaching resources, durable personal workspaces, teacher and admin panels, and controlled sharing/collaboration. The [task registry and index](docs/roadmap/task-index.md) specify status, dependencies, subtasks and agent handoffs. The public demo, original brand, teaching kit and teaching page are implemented; a narrow aggregate admin dashboard and manual saved Marketing Lab are also implemented. Owner-only multiple ideas and project switching are implemented. A private instructor planning workspace is also implemented. Class provisioning, account-free entry, scoped account enrollment, aggregate administration and deliberately reviewed submissions are implemented. Full team progress/bundles, broader sharing and simultaneous collaboration remain planned. The registry distinguishes each gate and its actual evidence.

The primary pilot outcome to test is a **useful loop within 14 days**: a founder takes an external action and records a specific decision supported by observations, including counterevidence or unknowns, plus a next step. Voluntary return matters; course requirements and facilitator help will be recorded separately. Draft generation, interview totals and positive feedback alone are insufficient.

Research may change the audience, workflow or positioning. The owner-requested engineering plan can proceed while interviews run; research findings and reliability gates remain separate. F-007 now has [verified green CI](https://github.com/ianroy/first-10/actions/runs/39092157827), while privacy, model evaluations and preview setup remain open. The [company values](docs/company-values.md) and [OpenRouter plan](docs/roadmap/openrouter-plan.md) guide future implementation.

## Privacy and AI data flow

Use first names for contacts and avoid sensitive information in free text. Supabase stores account authentication and project data; the database migration enables owner-based row-level security for the original six application tables. The public `marketing_plans` and `teacher_plans` tables have owner-only reads and validated atomic saves. The teacher planner grants no access to anyone else’s work. The deployed ownership migration also enforces matching project/contact ownership and immutable row identities; strict real database policy tests cover these boundaries. The interview start checkbox is an owner report; final saving records separate versioned note-taking, AI-processing and sharing choices with database timestamps. Historical choices remain unknown. The Interview privacy panel controls project and record choices; missing/withdrawn processing permission excludes affected content before provider requests. Sharing choices alone grant no recipient access. These reports are not independently verified participant consent.

For the four private AI workflows, after checking current saved processing choices, the server sends eligible selected context to **OpenRouter and the routed model provider**: project name, description, audience and problem; completed interview answers and tags for synthesis and outreach; accepted learnings for outreach; and contact relationship, relevance, source and stage fields for Stage 2. Contact first names are not selected for the AI context, but free-text notes can still identify people. Review what you record and agree appropriate data handling with participants before using it in AI generation.

“The app does not contact customers” refers to outreach sending. It does not mean that data stays on your device. See [ProductSpec.md](ProductSpec.md) for the data flow and current limitations.

## Development setup

Use **Node.js 22.12+** and **Bun 1.3.5**, matching the installed framework's Node requirement and the Bun version in CI. CI explicitly selects Node.js 22; use that major when reproducing a CI result. The commands below invoke the pinned Bun version through npm's `npx`; an installed Bun 1.3.5 can run the equivalent `bun` commands.

```sh
git clone https://github.com/ianroy/first-10.git
cd first-10
npx bun@1.3.5 install --frozen-lockfile
cp .env.example .env
# Fill in .env before starting the app.
npx bun@1.3.5 run dev
```

Use the local URL printed by Vite; the wrapper can choose the port. Configure the origin’s auth callback URLs in Supabase’s allowed redirects. The app requests `/auth?callback=true&view=student`, `educator` or `admin` as the selected destination; account-creation redirects must retain ordinary-account permission limits. An email callback can continue to its validated destination, while an ordinary visit to `/auth` stays on the chooser.

### Environment variables

| Variable                                             | Scope                 | Purpose                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser/build         | Public Supabase URL and publishable/anon key                                                                                                                             |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | Server                | Same project URL and publishable/anon key for authenticated AI requests                                                                                                  |
| `OPENROUTER_API_KEY`                                 | Server only           | Required for AI generation                                                                                                                                               |
| `OPENROUTER_MODEL`                                   | Server only, optional | For private kinds, missing or blank uses `anthropic/claude-sonnet-4.5`; an explicit model overrides it. Fictional practice uses its fixed model                          |
| `APP_URL`                                            | Server only, optional | OpenRouter request referer; code defaults to the recorded production URL                                                                                                 |
| `NITRO_PRESET`                                       | Build                 | Set to `vercel` when building for Vercel                                                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Server only           | Aggregate admin reads after a fresh trusted-role check, plus operator tooling for the isolated fictional presenter seeder; bypasses RLS and must never reach the browser |
| `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`    | Template metadata     | Present in `.env.example`; not read by current application code                                                                                                          |

The template includes a blank `OPENROUTER_MODEL=` line; blank and missing values now select the baseline. Lower-cost routes require their model-evaluation tasks before promotion. `APP_URL` and `NITRO_PRESET` are additional supported settings not listed in that template. Keep real `.env` values out of Git. Never put the OpenRouter key or service-role key in a `VITE_` variable.

### Database

The application schema is in [supabase/migrations/20261017000000_init.sql](supabase/migrations/20261017000000_init.sql): `projects`, `contacts`, `interviews`, `learnings`, `experiments` and `outreach`. The additive [ownership migration](supabase/migrations/20261018000000_private_relationships.sql) strengthens relationships without rewriting content. The [Marketing Lab migration](supabase/migrations/20261018001000_marketing_plans.sql) adds `marketing_plans`, with one plan per project, bounded versioned JSON, atomic revision checks, three prior snapshots and immutable completed initial thinking. The [teacher-plan migration](supabase/migrations/20261018002000_teacher_plans.sql) adds the eighth public application table, `teacher_plans`, with one private plan per project and atomic revision-checked saves. The separate [fictional AI reservation migration](supabase/migrations/20261018003000_demo_ai_budget.sql) stores only budget/reservation metadata in the private schema; it is not a general AI-usage or student-data table. Provision an explicitly selected development Supabase project, then apply pending migrations with the Supabase CLI:

```sh
supabase link --project-ref <development-project-ref>
supabase db push
```

Check the linked project before applying changes. Add new migrations for schema changes rather than editing an already-applied migration or resetting a shared database.

### Checks and commands

| Command                                       | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `npx bun@1.3.5 run dev`                       | Start the development server                                          |
| `npx bun@1.3.5 run typecheck`                 | TypeScript check                                                      |
| `npx bun@1.3.5 run lint`                      | ESLint                                                                |
| `npx bun@1.3.5 run test`                      | Vitest run                                                            |
| `npx bun@1.3.5 run roadmap:check`             | Validate task dependencies, decisions, claims and completion evidence |
| `npx bun@1.3.5 run roadmap:test`              | Test the roadmap validator and execution controls                     |
| `npx bun@1.3.5 run test:watch`                | Vitest watch mode                                                     |
| `NITRO_PRESET=vercel npx bun@1.3.5 run build` | Build for Vercel                                                      |
| `npx bun@1.3.5 run preview`                   | Preview a production build                                            |
| `npx bun@1.3.5 run format`                    | Rewrite formatting across the repository; review the diff             |

Run the same sequence locally and in [CI](.github/workflows/ci.yml):

```sh
npx bun@1.3.5 install --frozen-lockfile
npx bun@1.3.5 run lint
npx bun@1.3.5 run typecheck
npx bun@1.3.5 run test
npx bun@1.3.5 run roadmap:check
npx bun@1.3.5 run roadmap:test
NITRO_PRESET=vercel npx bun@1.3.5 run build
```

Lint excludes generated `dist`, `.output`, `.vinxi` and `.vercel` output automatically, so the command is unchanged after a Vercel build. Keep the frozen Bun lockfile; these checks need no live Supabase credentials or OpenRouter key. Tests use local fixtures and the build does not verify live authentication, database policies or AI generation. The roadmap check rejects an invalid task graph; its separate test suite covers dependency, decision and claim enforcement. Follow [ProductSpec.md](ProductSpec.md) and the roadmap's current state before changing product behavior.

## Architecture and deployment

The app uses React 19, TanStack Start/Router/Query, Vite, Tailwind and shadcn/ui. Browser CRUD uses Supabase with the signed-in user's session. The authenticated route supplies the verified user ID to project selection; project and child-record query keys include that identity and the selected project so switching accounts or ideas does not reuse another scope's cached records. Browser selection is a convenience, while Supabase row-level security enforces ownership. All AI generation goes through `generateAI` in [src/lib/ai.functions.ts](src/lib/ai.functions.ts), which authenticates the caller, loads context under their RLS permissions and requests JSON from OpenRouter. AI keys and prompt assembly stay server-side; the browser saves returned results.

The separate `/admin` dashboard is restricted to the trusted `app_metadata.firstten_demo_admin === true` flag, rechecked server-side against the current bearer token. It returns aggregate operational counts and the current presenter account’s contribution, with no notes, emails or raw-user list. It also shows count-only founding-partner requests/feedback, separating known fixture domains and keeping missing counts unavailable. Requests are unverified and are not confirmed schools or adoption. Acquisition and retention funnels are not instrumented. This limited grant is not the planned general platform-admin role. See [presenter access and revocation](docs/demo/presenter-data.md). The dedicated presenter can use the `ianroy` username alias with a privately supplied password; public users create their own email account. Credentials never belong in Git.

The repository retains the Lovable Vite wrapper, whose default build target is Cloudflare. The Vercel build uses `NITRO_PRESET=vercel`. The recorded hosting target is Vercel project `first-10`, with [this production URL](https://first-10-three.vercel.app); live deployment health and Git integration are not verified by this document.

For an authorized deployment, link the intended Vercel project, configure the variables above for each environment you intend to use, then run:

```sh
vercel link
vercel deploy --prod
```

Set `NITRO_PRESET=vercel` in the remote build environment as well as the required Supabase and OpenRouter values. The `VITE_*` settings must be available at build time. In Supabase Authentication, configure the Site URL and allowed `/auth` callback URLs, including the app’s `callback=true&view=...` query parameters, for production, local development and any previews being used. Confirm sign-in, project access and AI generation after deployment.

The project remains connected to Lovable. Preserve published Git history: use ordinary commits and pushes, and keep the connected branch working.

## Team

First Ten was created for the Babson AI Academy by:

| Maker                        | Professional profile                                                                                                                         | Affiliation / focus                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ian Roy                      | [Brandeis profile](https://scholarworks.brandeis.edu/esploro/profile/ian_roy/overview)                                                       | Brandeis University · Design & Innovation; Senior Lecturer in Engineering and Business                                   |
| Anna M. Pietraszek           | [FIU profile](https://business.fiu.edu/about/directory/profile/pietraszeka)                                                                  | Florida International University · Entrepreneurship Center Director; Associate Teaching Professor, Marketing & Logistics |
| Jungsoo Ahn                  | [Stony Brook profile](https://www.stonybrook.edu/business/faculty-research/faculty-directory/jungsoo-ahn.html)                               | Stony Brook University College of Business · Assistant Professor of Strategy and Entrepreneurship                        |
| José Pedro Carreón Gutiérrez | [EGADE profile](https://egade.tec.mx/en/profesor/pedro-carreon)                                                                              | EGADE Business School, Tecnológico de Monterrey · MBA leadership                                                         |
| Harini Mittal                | [BCC profile](https://www.bcc.cuny.edu/employees/mittal-harini/) · [LinkedIn](https://www.linkedin.com/in/harini-mittal-ms-mba-phd-78a3615/) | Bronx Community College, CUNY · Business & Information Systems                                                           |
| Raquel Thomas                | [Benedict College profile](https://benedict.edu/faculty-and-staff/raquel-thomas/)                                                            | Benedict College · Business & Entrepreneurship                                                                           |

## Project documents

- [ProductSpec.md](ProductSpec.md): audience, value model, implemented behavior, architecture, data model and contributor conventions.
- [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md): current state, research questions, delivery gates and resumable task plan.
- [research/value-prop.md](research/value-prop.md): earlier value-proposition canvas; read alongside the newer candidate thesis in roadmap §2.1.
- [research/interviews/README.md](research/interviews/README.md): interview workspace and research records; neutral guides, screening, permission choices and pilot rules; no invented participant findings.
- [AGENTS.md](AGENTS.md): repository instructions, including the required reading order and roadmap state update.

## Demo and release checks

Public checks: `npm run smoke -- https://first-10-three.vercel.app`. The redacted `/api/health` reports configuration shape/presence without keys; it does not prove authentication, database availability or model quality. The deployment smoke workflow and strict isolated database-policy CI are separate checks.

The [presenter workspace](docs/demo/presenter-data.md) contains only clearly fictional examples in a dedicated account. Insert-only seeding is dry-run-first and preserves edits on repeat. The browser sign-in, source reads and saved-summary reload were verified. No real participant study or product adoption is implied. The pitch also has a downloadable, self-contained HTML fallback.

The [founding-partner invitation](https://first-10-three.vercel.app/founding-partners) offers educators two semesters free for classroom trials and feedback. Its QR code is on the final pitch slide. Requests are privately recorded for team follow-up; they do not automatically create an account, enroll a class or grant access.

The four private AI workflows use frozen versioned prompts/schemas and record server-owned successful-generation metadata without source/output text. Unknown provider/model/usage/cost remain unknown; this is not the general budget system or a durable link to a later edited saved output. Project collaboration has a tested membership foundation but stays disabled until its invitation/design interface is ready. The [release runbook](docs/operations/release-runbook.md) includes migration-history checks and an executed restore rehearsal using only disposable fictional data.
