# First Ten: Product Spec and Developer Onboarding

Read this first if you are a new human or agent working in this repo. It describes what the app is, how it is built, and the conventions to follow. For what to build next, see [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md).

## 1. Product in one paragraph

First Ten helps a student founder with a live app and no customers find their first users through a three-rung ladder: **First 10** (interview people you know), **Next 50** (their friends and communities), **Next 100** (channels that scale). An LLM drafts questions, syntheses and messages; the founder edits and decides. The app is mobile-first and designed to be used in the middle of a conversation.

### Principles (do not break these without logging a decision)

1. **AI drafts, human decides.** Every AI output is shown as editable and marked as a draft. The app never sends messages to third parties.
2. **Past behavior, not opinions.** Interview guidance follows The Mom Test: ask what people did, never pitch, never ask "would you use".
3. **Respect.** First names only; explicit consent checkbox before taking notes.
4. **Small steps.** One question per screen, one "next step" on the dashboard, big touch targets.
5. **Evidence drives the next rung.** Each stage's output is built from the previous stage's accepted learnings.

## 2. User journey and screens

| Route | File | Purpose |
|---|---|---|
| `/` | `src/routes/index.tsx` | Marketing landing page |
| `/auth` | `src/routes/auth.tsx` | Magic-link sign-in; redirects to `/dashboard` when a session exists |
| `/setup` | `_authenticated/setup.tsx` | Create or edit the single project (name, description, audience, problem, link) |
| `/dashboard` | `_authenticated/dashboard.tsx` | "Your ladder": next-step card, three progress rungs, pipeline, learnings timeline |
| `/contacts` | `_authenticated/contacts.tsx` | People lists per stage; Stage 1 prompts for who to add; Stage 2+ status select |
| `/interview` | `_authenticated/interview.tsx` | Prep (generate/edit questions, choose person, consent) then Session (one question per screen, notes, quote, tags) |
| `/learnings` | `_authenticated/learnings.tsx` | AI synthesis after 5 interviews, accept it, checklist, experiments, unlock next stage |
| `/outreach` | `_authenticated/outreach.tsx` | Stage 2 (channels, drafts, survey, pipeline) and Stage 3 (channels, referral asks, onboarding questions, metrics) |

Routes under `src/routes/_authenticated/` are gated by `route.tsx` (session check) and wrap content in `RequireProject` (redirect to `/setup` if no project) and `AppShell` (header, bottom tab nav, `Card`, `Empty`, `DraftBadge`, `PrivacyNote` helpers).

### Stage mechanics

- `projects.stage` is 1, 2 or 3 and means "highest unlocked stage".
- Progress counters (`stageProgress` in `src/lib/data.ts`): Stage 1 = completed interviews (goal 10); Stage 2 = stage-2 contacts with status `tried`/`active`/`paying` (goal 50); Stage 3 = same for stage-3 contacts (goal 100).
- Unlocking is manual: the Learnings page shows a checklist (some items auto-evaluated, some self-ticked, stored in `projects.checklist`), and the button writes the next stage.
- Contact `status` values: `to_contact`, `interviewed` (Stage 1); `contacted`, `replied`, `tried`, `active`, `paying` (Stage 2+).
- Interview tags (`TAGS` in `data.ts`): has problem, current workaround, would use, would pay, gave referral.

## 3. Architecture

```
Browser (React, TanStack Router/Query)
   |  direct supabase-js calls (RLS-protected CRUD)      -> Supabase Postgres + Auth
   |  server function: generateAI({kind, projectId})
   v
TanStack Start server function  --(bearer token from session)-->  requireSupabaseAuth middleware
   |  reads project + interviews + accepted learnings + contacts with the USER's token (RLS applies)
   v
OpenRouter chat completions (strict JSON schema)  ->  JSON back to the client; client persists it
```

- **Data access**: all CRUD happens in the browser via `supabase` (`src/integrations/supabase/client.ts`) using the user's session; RLS enforces isolation. React Query hooks live in `src/lib/data.ts` (`useProject`, `useContacts`, ...). After a mutation, call `useRefresh()` with the table names to invalidate.
- **Server functions**: only AI generation is a server function. It is wrapped by `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`), which builds a per-request Supabase client from the caller's bearer token. `auth-attacher.ts` attaches the token on the client.
- **Admin client**: `client.server.ts` uses the service role key. Nothing currently calls it. Keep it server-only.
- **Lovable leftovers**: `lovable-error-reporting.ts`, `error-capture.ts`, `cron-auth.ts`, `previewAuthStorage.ts`, the `@lovable.dev/vite-tanstack-config` Vite wrapper and `.lovable/` came from the original scaffold. They are harmless but are candidates for cleanup (see roadmap, task F-001).
- **Build**: `vite.config.ts` uses the Lovable wrapper, which includes the Nitro plugin with a Cloudflare default; production on Vercel sets `NITRO_PRESET=vercel`. `src/server.ts` is the SSR entry with an error wrapper.
- **Styling**: Tailwind with design tokens in `src/styles.css` (display font Bricolage Grotesque, body Figtree). shadcn/ui primitives in `src/components/ui/` (generated; edit sparingly).

## 4. Data model

Defined in `supabase/migrations/20261017000000_init.sql`; TypeScript types in `src/integrations/supabase/types.ts` (generate with `supabase gen types typescript --linked` after schema changes).

Every table has `id uuid`, `user_id uuid default auth.uid()`, `created_at`, and an RLS policy `"own rows"` (`auth.uid() = user_id`) for `authenticated`. Anonymous has no access.

| Table | Key columns | Notes |
|---|---|---|
| `projects` | name, description, audience, problem, link, `stage` int, `questions` jsonb (string[]), `survey` jsonb (string[]), `checklist` jsonb | One row per user in practice (`useProject` takes the first by `created_at`). `checklist` also holds Stage 3 `metrics`. |
| `contacts` | project_id, first_name, relation, why, `stage`, `source` (`warm` or relation text), `status` | Cascades on project delete |
| `interviews` | project_id, contact_id (nullable, set null), `answers` jsonb (`{q, note, quote}[]`), `tags` text[], completed | |
| `learnings` | project_id, stage, `kind` (`synthesis`, `note`), title, body, `data` jsonb, `accepted` bool | Synthesis stored in `data`: problems, objections, best_fit, quotes, changes[] |
| `experiments` | project_id, stage, hypothesis, change, result | |
| `outreach` | project_id, stage (2 or 3), `kind` (`channel`, `draft`, `referral`, `onboarding`), title, body | Regenerating deletes and re-inserts that stage's rows |

## 5. The AI layer

Single entry point: `generateAI` in `src/lib/ai.functions.ts`.

- **Provider**: OpenRouter `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer $OPENROUTER_API_KEY`. Model from `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-4.5`). `provider.require_parameters: true` ensures the routed model supports strict structured output.
- **Kinds**: `questions`, `synthesis`, `stage2`, `stage3`. Each has a task prompt (`TASKS`) and a strict JSON schema (`SCHEMAS`). The system prompt is a warm, plain-language coach persona.
- **Context assembly** (server-side, user's RLS): project fields always; completed interviews (truncated to 14,000 chars) except for `questions`; accepted learnings (6,000 chars) for stage2/stage3; contact sources (3,000 chars) for stage2.
- **Persistence**: the server function returns JSON only. The client writes results to Supabase (e.g. `learnings.insert`, `outreach.insert`, `projects.update`).
- **Errors**: HTTP 401/402/429 map to friendly messages; otherwise a generic retry message.
- **Adding a new kind**: add to `Kind`, `SCHEMAS`, `TASKS`; add context rules in the handler; add a client call and persistence; add a test. Strict schemas require every property in `required` and `additionalProperties: false` (the `obj()` helper does this).

Known limits: no streaming, no per-user rate limit or cost ledger, no eval harness, prompts are inline strings, truncation is by characters not tokens.

## 6. Conventions

- TypeScript strict, path alias `@/` to `src/`. Files in `src/routes` define routes via `createFileRoute`; `src/routeTree.gen.ts` is generated, do not edit.
- Client mutations: call supabase directly, `toast.error(error.message)` on failure, then `refresh(...)`.
- UI copy: plain, friendly, no jargon; second person; sentence case.
- Mobile first: max-width `xl` column, bottom nav, `pb-safe` for iOS inset, buttons `size="xl"` for primary actions.
- Do not store last names, emails or phone numbers of interviewees.
- Secrets: only `VITE_*` vars reach the browser. Never put the service role or OpenRouter key in a `VITE_` variable.
- Tests: Vitest in `src/test/`. Add at least a routing/render test per new route and a unit test per pure helper.
- Commits: small, one task per commit, reference the roadmap task id (e.g. `F-012`).

## 7. Local dev quickstart

```sh
npm install
cp .env.example .env   # fill Supabase + OPENROUTER_API_KEY
npm run dev            # http://localhost:3000 (port may vary)
npm run test
```

To reset the local-to-remote database: `supabase db reset --linked` is destructive; prefer new migration files under `supabase/migrations/`.

## 8. Operations

- Hosting: Vercel project `first-10` (team `ianroy-1382s-projects`), production alias https://first-10-three.vercel.app. Env vars set for the production environment only; add them for preview if you want PR previews to work.
- Database: Supabase project `first-10` (`hdwnnuvqqkkpontcdbwa`, us-east-1), free plan.
- Auth: email magic link. Configure Site URL and redirect URLs in the Supabase dashboard.
- Repo: https://github.com/ianroy/first-10 (private). The Vercel project is not yet git-connected, so deploy with `vercel deploy --prod` or connect the repo.

## 9. Known gaps (inputs to the roadmap)

1. Single project per user; no cohort or instructor view.
2. Stage unlock is manual and checklist-based; no evidence thresholds beyond counts.
3. Interview quality is never checked (no feedback on leading or pitchy questions or notes).
4. Outreach regeneration is destructive (deletes prior rows).
5. No streaming or cost/usage tracking; no prompt evals.
6. No offline or PWA support for in-person interviews.
7. No help finding where customers actually gather online (Stage 2/3 channels are generic AI suggestions, not grounded in real communities). This is the main motivation for the Reddit research in the roadmap.
8. Lovable-specific files and wrapper remain.
