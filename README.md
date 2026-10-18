# First Ten

**Turn real customer conversations into a clearer next move: who to focus on, what to change, and what to try next.**

First Ten is a responsive web app for student founders with a live prototype or app and few or no recurring users. It brings a people list, interview questions, notes, AI-assisted synthesis, experiments and outreach drafts into one guided workflow. The founder talks to people, checks the evidence and decides what to do.

This is the **candidate value proposition** being tested. The existing app implements a three-stage ladder; research is now focused on whether that ladder helps founders make better decisions and take useful action. There are no founder interviews or pilot outcomes recorded in the research workspace yet, so improved acquisition, retention and willingness to pay remain unproven. The public page explains this provisional proposition; no acquisition or learning-effect claim has been validated.

- [Open First Ten](https://first-10-three.vercel.app) · [Explore the fictional demo](https://first-10-three.vercel.app/demo) · [Teaching resources](https://first-10-three.vercel.app/teach) · [Workshop pitch](https://first-10-three.vercel.app/pitch/index.html) · [GitHub repository](https://github.com/ianroy/first-10)
- Built for the Babson AI Academy by the [First Ten team](#team). First scaffolded in Lovable, then moved to GitHub, Vercel and Supabase.
- [ProductSpec.md](ProductSpec.md) describes the current product and its boundaries. [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md) is the source of truth for research, delivery gates and the next task.

## The decision First Ten aims to help with

“I launched, got little useful response, and don't know whether to change the product, change who I'm approaching, or keep trying.”

The initial audience to test is a student founder who has recently tried to find users. A course participant and a self-directed founder may have different reasons to return; research will examine them separately. Instructors are possible reviewers or champions, and a budget owner may be someone else. The current app has no instructor or cohort workspace.

The immediate outcome to test is a founder who can say: **“I know whom I'm learning from, can point to something they did or described, understand what is still uncertain, and have chosen my next move.”** Finding users who return is the longer-term aspiration. Narrowing an audience, retaining a decision for a clearer reason, or stopping a weak idea can also be a useful result.

The intended loop is:

1. Find a reachable person who has experienced the problem. A friend can qualify; knowing them is not enough.
2. Ask about a recent situation, its consequences and their workaround. Capture disagreement as well as encouraging answers.
3. Separate what the person said or did from your interpretation and remaining questions.
4. Choose an action that helps resolve the uncertainty: another conversation, a product change, a trial or a follow-up.
5. Check what happened and decide again.

For example, a founder building a study planner might hear that a student already plans carefully but loses track when assignments change. A useful next move could be to test a change-notification flow with students who have that problem. The conversation does not establish that they will use or pay for it. This is an illustrative example, not a customer result.

The proposed advantage is continuity from conversation to decision to follow-through. It still needs to earn its place alongside a founder's existing AI chat, documents, mentor and course tools. The app supports pieces of this loop today; general claim-level evidence links and a source-linked decision record remain research concepts.

## A classroom process you can inspect

The login-free **StudyLoop** example follows fictional perspectives through an interpretation, a counterexample, a choice and a proposed next test. Its resettable, deterministic flow needs no live model response and writes no product data. The example demonstrates a method; it does not claim that every source-linked interaction exists in the private app.

The [teaching kit](public/teaching/resources.json) provides a complete 60-minute lesson (10 minutes own thinking, 20 evidence, 20 marketing-test design, 10 peer review), a one-week $0 marketing assignment, six editable handouts and a nine-page printable PDF. Students map an audience to a primary channel and an alternative, develop truthful content, define an observable useful action and reflect on whether to repeat, revise or stop. The saved in-app Marketing Lab now supports a manual five-step plan at Stage 2. Its dedicated channel/content AI kinds remain planned; the teaching kit works without an account or AI.

Six teaching concepts connect to visible activities: **experiential learning; generative, student-led thinking before AI; scaffolded practice; formative peer feedback; metacognition and reflection; responsible AI and human judgment**. Students keep their initial thinking, inspect disagreement and explain their decision. AI is optional; the rubric assesses reasoning and revision rather than customers, network size or AI usage. These are teaching design commitments, not measured learning gains. See the [pedagogy map](docs/teaching/pedagogy-map.md) for primary sources and limits.

The original First Ten identity uses a conversation-shaped **10**, Field notebook colors and scalable light/dark assets. The [company values](docs/company-values.md) connect honest learning, human judgment, participant respect, accessibility, useful action, continuity and responsible resources to product decisions.

## What you can do today

1. **Sign in and describe your app.** Use email and password, create an email/password account, or request an email sign-in link. Setup collects name, description, audience, problem and optional app link. Each account can keep multiple private ideas, with one selected at a time.
2. **First 10 — learn from relevant people.** Add first names and why each person fits. Generate and edit interview questions about past behavior, save them, select a contact and confirm permission to take notes. Interview mode shows one question per screen with a note and optional exact quote. Save at the end to record the conversation and tags.
3. **Review learnings and try a change.** After five saved, completed interviews, generate an editable synthesis of problems, objections, best-fit users, quotes and suggested changes. Review it against your notes before accepting it. Log an experiment with a hypothesis, change and result; the result can be updated later.
4. **Next 50 — reach beyond the first group.** Once unlocked, generate suggested channels, editable outreach bodies and feedback-survey questions using your project, completed interviews, accepted learnings and contact-source notes. Copy drafts to send yourself and manually update contacts through Contacted → Replied → Tried it → Active → Paying. Channel suggestions are AI-generated, not verified community research; the survey is text to copy, not a hosted response-collection form.
5. **Next 100 — try broader outreach.** Once unlocked, generate channel ideas, referral asks and onboarding questions. Enter your own sign-up, active and returning-user counts. These metrics are not connected to your app's analytics.

The dashboard brings together the next-step suggestion, stage progress, contact pipeline and a timeline of learnings and experiments. A desktop sidebar and responsive panels support classroom projection; mobile keeps bottom navigation. **Account & saved work** lists your ideas, opens a selected project, shows its record counts and links to edit its details. Choose **New idea** to start a separate project without replacing existing work. Account deletion and exports remain unavailable. All AI outputs need human review; the app never sends outreach to interviewees or customers.

### Save another idea and return later

Open **Account & saved work** to choose an existing idea or create a new one. Each keeps its own people, interviews, learnings, experiments, outreach and Marketing Lab plan. **New idea** opens `/setup?new=true` and creates a separate project; **Edit this idea** changes only the selected project.

This browser remembers your selected idea separately for each signed-in account. Your projects are saved in Supabase and available on another device, where you can choose one from the account list. With no remembered choice, the app opens your earliest project. If a remembered project is missing or no longer accessible, it reports that problem instead of silently opening another; use Account & saved work to choose an available idea. Save your edits before leaving a workflow.

### The saved $0 Marketing Lab

At `/marketing`, Stage 2 opens **Think first → Map channels → Make content → Plan the test → Review learning**. Preserve your initial observations, audience, useful action and channel ideas before using the structured steps. Map physical or digital channels, choose a primary route and an alternative, draft truthful content, plan a one-week test and record a repeat/revise/stop reflection. The observation and reflection fields are entered manually; the page does not yet provide the full structured measurement ledger. There is no automatic publication, audience verification or analytics collection. $0 refers to new cash spend, not unlimited time, printing, travel or free AI.

Use **Save draft** and wait for confirmation. Saves check the current revision and reject conflicting updates instead of overwriting another save. The database retains three previous snapshots; the page currently offers reloading the latest saved version, not a history-restore interface. Once completed, the initial thinking is preserved.

### What the ladder counts

| Stage    | Dashboard goal                                         | Current requirement to unlock the next stage                                                                                                                                  |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First 10 | 10 completed interview records                         | At least 5 completed interviews, an accepted synthesis, a Stage 1 experiment, and manual confirmation that you can describe your best-fit user and made or scheduled a change |
| Next 50  | 50 Stage 2 contacts marked Tried it, Active or Paying  | At least 10 such contacts, a nonempty feedback survey, a Stage 2 experiment, and manual confirmation that you reviewed survey answers                                         |
| Next 100 | 100 Stage 3 contacts marked Tried it, Active or Paying | Final stage; no further unlock                                                                                                                                                |

The goals and unlock thresholds differ. They are workflow guides, not evidence that demand is validated. Counts and statuses are founder-entered records; tags such as “would use” and “would pay” do not establish actual use or payment. An introduction, a trial, repeat use and payment answer different questions.

### Current limits that affect use

- Interview notes remain in the current session until the final save. There is no autosave or offline recovery.
- Synthesis does not provide structured links from each claim to its source interview. Check generated quotes and interpretations against the original notes.
- Regenerating a synthesis replaces it and resets acceptance. Regenerating outreach replaces the stage's saved drafts; Stage 2 regeneration also replaces the survey.
- There is no automated follow-up, public evidence pack, interview authenticity check, cohort dashboard or shared project membership.

## What we are testing next

[Iteration 5](FEATUREROADMAP_workplan.md) stages the requested product expansion alongside research: economical AI, a new brand and demo landing page, teaching resources, durable personal workspaces, teacher and admin panels, and controlled sharing/collaboration. The [task registry and index](docs/roadmap/task-index.md) specify status, dependencies, subtasks and agent handoffs. The public demo, original brand, teaching kit and teaching page are implemented; a narrow aggregate admin dashboard and manual saved Marketing Lab are also implemented. Owner-only multiple ideas and project switching are implemented. Teacher/class panels, broader platform administration, sharing and collaboration remain planned. The registry distinguishes each gate and its actual evidence.

The primary pilot outcome to test is a **useful loop within 14 days**: a founder takes an external action and records a specific decision supported by observations, including counterevidence or unknowns, plus a next step. Voluntary return matters; course requirements and facilitator help will be recorded separately. Draft generation, interview totals and positive feedback alone are insufficient.

Research may change the audience, workflow or positioning. The owner-requested engineering plan can proceed while interviews run; research findings and reliability gates remain separate. F-007 now has [verified green CI](https://github.com/ianroy/first-10/actions/runs/39092157827), while privacy, model evaluations and preview setup remain open. The [company values](docs/company-values.md) and [OpenRouter plan](docs/roadmap/openrouter-plan.md) guide future implementation.

## Privacy and AI data flow

Use first names for contacts and avoid sensitive information in free text. Supabase stores account authentication and project data; the database migration enables owner-based row-level security for the original six application tables. A seventh, `marketing_plans`, has owner-only reads and validated atomic saves; it grants no teacher or collaborator access. The deployed ownership migration also enforces matching project/contact ownership and immutable row identities; strict real database policy tests cover these boundaries. The interview start checkbox confirms permission to take notes in that session. It is not a stored consent record or permission to publish quotes or send personal information to an AI provider.

When you request generation, the server sends selected context to **OpenRouter and the routed model provider**: project name, description, audience and problem; completed interview answers and tags for synthesis and outreach; accepted learnings for outreach; and contact relationship, relevance, source and stage fields for Stage 2. Contact first names are not selected for the AI context, but free-text notes can still identify people. Review what you record and agree appropriate data handling with participants before using it in AI generation.

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

Use the local URL printed by Vite; the wrapper can choose the port. Configure that origin's `/auth` callback in Supabase's allowed redirect URLs so magic-link sign-in can return to the app.

### Environment variables

| Variable                                             | Scope                 | Purpose                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser/build         | Public Supabase URL and publishable/anon key                                                                                                                             |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | Server                | Same project URL and publishable/anon key for authenticated AI requests                                                                                                  |
| `OPENROUTER_API_KEY`                                 | Server only           | Required for AI generation                                                                                                                                               |
| `OPENROUTER_MODEL`                                   | Server only, optional | Missing or blank uses the current `anthropic/claude-sonnet-4.5` baseline; set a supported explicit model to override                                                     |
| `APP_URL`                                            | Server only, optional | OpenRouter request referer; code defaults to the recorded production URL                                                                                                 |
| `NITRO_PRESET`                                       | Build                 | Set to `vercel` when building for Vercel                                                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Server only           | Aggregate admin reads after a fresh trusted-role check, plus operator tooling for the isolated fictional presenter seeder; bypasses RLS and must never reach the browser |
| `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`    | Template metadata     | Present in `.env.example`; not read by current application code                                                                                                          |

The template includes a blank `OPENROUTER_MODEL=` line; blank and missing values now select the baseline. Lower-cost routes require their model-evaluation tasks before promotion. `APP_URL` and `NITRO_PRESET` are additional supported settings not listed in that template. Keep real `.env` values out of Git. Never put the OpenRouter key or service-role key in a `VITE_` variable.

### Database

The application schema is in [supabase/migrations/20261017000000_init.sql](supabase/migrations/20261017000000_init.sql): `projects`, `contacts`, `interviews`, `learnings`, `experiments` and `outreach`. The additive [ownership migration](supabase/migrations/20261018000000_private_relationships.sql) strengthens relationships without rewriting content. The [Marketing Lab migration](supabase/migrations/20261018001000_marketing_plans.sql) adds `marketing_plans`, with one plan per project, bounded versioned JSON, atomic revision checks, three prior snapshots and immutable completed initial thinking. Provision an explicitly selected development Supabase project, then apply pending migrations with the Supabase CLI:

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

The separate `/admin` dashboard is restricted to the trusted `app_metadata.firstten_demo_admin === true` flag, rechecked server-side against the current bearer token. It returns aggregate operational counts and the current presenter account’s contribution, with no notes, emails or raw-user list. Missing data is shown as unavailable; acquisition and retention funnels are not instrumented. This limited grant is not the planned general platform-admin role. See [presenter access and revocation](docs/demo/presenter-data.md). The dedicated presenter can use the `ianroy` username alias with a privately supplied password; public users create their own email account. Credentials never belong in Git.

The repository retains the Lovable Vite wrapper, whose default build target is Cloudflare. The Vercel build uses `NITRO_PRESET=vercel`. The recorded hosting target is Vercel project `first-10`, with [this production URL](https://first-10-three.vercel.app); live deployment health and Git integration are not verified by this document.

For an authorized deployment, link the intended Vercel project, configure the variables above for each environment you intend to use, then run:

```sh
vercel link
vercel deploy --prod
```

Set `NITRO_PRESET=vercel` in the remote build environment as well as the required Supabase and OpenRouter values. The `VITE_*` settings must be available at build time. In Supabase Authentication, configure the Site URL and allowed `/auth` redirect URLs for production, local development and any previews being used. Confirm sign-in, project access and AI generation after deployment.

The project remains connected to Lovable. Preserve published Git history: use ordinary commits and pushes, and keep the connected branch working.

## Team

First Ten was created for the Babson AI Academy by:

- Ian Roy
- Jungsoo Ahn
- Harini Mittal
- José Pedro Carreón Gutiérrez
- Anna M. Pietraszek
- Raquel M. Richardson

## Project documents

- [ProductSpec.md](ProductSpec.md): audience, value model, implemented behavior, architecture, data model and contributor conventions.
- [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md): current state, research questions, delivery gates and resumable task plan.
- [research/value-prop.md](research/value-prop.md): earlier value-proposition canvas; read alongside the newer candidate thesis in roadmap §2.1.
- [research/interviews/README.md](research/interviews/README.md): interview workspace and research records; neutral guides, screening, permission choices and pilot rules; no invented participant findings.
- [AGENTS.md](AGENTS.md): repository instructions, including the required reading order and roadmap state update.

## Demo and release checks

Public checks: `npm run smoke -- https://first-10-three.vercel.app`. The redacted `/api/health` reports configuration shape/presence without keys; it does not prove authentication, database availability or model quality. The deployment smoke workflow and strict isolated database-policy CI are separate checks.

The [presenter workspace](docs/demo/presenter-data.md) contains only clearly fictional examples in a dedicated account. Insert-only seeding is dry-run-first and preserves edits on repeat. The browser sign-in, source reads and saved-summary reload were verified. No real participant study or product adoption is implied. The pitch also has a downloadable, self-contained HTML fallback.
