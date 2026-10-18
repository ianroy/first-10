# First Ten

**Find your first customers: talk to 10 people you know, then reach 50, then 100.**

First Ten is a mobile-first coaching app for student founders who have built something and don't know who to show it to. It turns "go find customers" into a ladder of small, doable steps, and uses an LLM to draft the interview questions, summaries and outreach messages, while the founder stays in charge of every decision.

- Live app: https://first-10-three.vercel.app
- Built by: Ian Roy ([ianroy@brandeis.edu](mailto:ianroy@brandeis.edu)) for the Babson AI Academy. First scaffolded in Lovable, then moved to GitHub, Vercel and Supabase.
- Status: working v1 of the three-stage ladder. See [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md) for what's next and [ProductSpec.md](ProductSpec.md) for how it works.

## Who it's for

Student founders (and anyone early) with a live app and zero customers. Typical problems it addresses:

1. You don't know who to ask. "Post it everywhere" gets nothing.
2. Friends say "cool!", which teaches you nothing.
3. You don't know what to fix, so you guess.

## How to use it

1. **Sign in** with your email. You get a magic link, no password.
2. **Describe your app** on the Setup screen: name, what it does, who it's for, the problem it solves, optional link.
3. **Stage 1: First 10.**
   - *People*: list 10-15 people you already know who have the problem.
   - *Interview*: let AI write 9 Mom-Test-style questions (edit freely). Pick a person, confirm they're OK with notes, then answer one question per screen: quick note, optional exact quote. Finish by tagging what you heard (has problem, workaround, would use, would pay, gave referral).
   - *Learnings*: after 5 interviews, AI synthesizes top problems, objections, best-fit users, quotes and 3 suggested changes. Accept it, log an experiment, tick the checklist, and unlock Stage 2.
4. **Stage 2: Next 50.** AI proposes channels, drafts outreach messages in your customers' own words, and a short feedback survey. Track each person through Contacted → Replied → Tried it → Active → Paying.
5. **Stage 3: Next 100.** AI proposes scalable channels, referral-ask scripts and onboarding questions. You enter simple metrics to see who sticks.
6. The **Ladder** (dashboard) shows progress on all three rungs, the pipeline, and a timeline of learnings and experiments.

AI output is always a **draft**. Nothing is sent anywhere; the app never contacts your customers for you.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (React 19, TanStack Router + Query), Vite |
| UI | Tailwind CSS, shadcn/ui (Radix), lucide icons, sonner toasts |
| Backend | Server functions (TanStack Start `createServerFn`) |
| Database / Auth | Supabase (Postgres + RLS, email magic-link auth) |
| LLM | OpenRouter (OpenAI-compatible chat completions, strict JSON schema) |
| Hosting | Vercel (Nitro `vercel` preset) |
| Tests | Vitest + Testing Library |

## Run locally

Requires Node 20+ and npm (or Bun; a `bun.lock` is included).

```sh
git clone https://github.com/ianroy/first-10.git
cd first-10
npm install
cp .env.example .env     # then fill in the values below
npm run dev
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | server, client | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | server, client | Supabase anon key |
| `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID` | server, client | Supabase project ref |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin client (`client.server.ts`); never expose |
| `OPENROUTER_API_KEY` | server only | LLM calls |
| `OPENROUTER_MODEL` | server only, optional | Defaults to `anthropic/claude-sonnet-4.5` |
| `APP_URL` | server only, optional | Sent to OpenRouter as the referer |
| `NITRO_PRESET` | build (Vercel) | Set to `vercel` for deployment |

`.env` is gitignored. `.env.example` lists the names only. On Vercel, add `VITE_SUPABASE_PUBLISHABLE_KEY` with `--type config` (the CLI refuses to expose a credential-looking `VITE_` value otherwise); without it the browser bundle throws "Missing Supabase environment variable(s)" and every page shows "This page didn't load".

### Database

The schema is in `supabase/migrations/` (a copy of `drizzle/migrations/0000_migration.sql`). With the Supabase CLI:

```sh
supabase link --project-ref <ref>
supabase db push
```

Six tables (`projects`, `contacts`, `interviews`, `learnings`, `experiments`, `outreach`), each with owner-only row-level security.

## Deploy

```sh
vercel link
vercel env add OPENROUTER_API_KEY production   # plus the Supabase vars and NITRO_PRESET=vercel
vercel deploy --prod
```

After deploying, set Supabase → Authentication → URL Configuration to your production URL so magic links don't point at localhost.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest run |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## Project docs

- [ProductSpec.md](ProductSpec.md): developer onboarding, data model, AI layer, conventions.
- [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md): resumable roadmap, Reddit research plan, regeneration and execution prompts.
- [AGENTS.md](AGENTS.md): short rules for coding agents.

## Privacy

First names only. The interview flow requires confirming consent to take notes. Data is isolated per user by Postgres RLS. Prompts sent to the LLM include the founder's app description and interview notes, so don't record sensitive personal information.
