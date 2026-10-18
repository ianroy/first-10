<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# AGENTS.md

- All AI calls go through `generateAI` in `src/lib/ai.functions.ts` (one server function, `kind` switch, strict JSON schema, OpenRouter chat completions via OPENROUTER_API_KEY) — keeps prompts and the key server-side in one place.
- Users may keep several owner-private projects. The authenticated ProjectSelectionProvider supplies the verified user id; selection is remembered per user, validated as a UUID and checked with owner-scoped queries/RLS. With no selected id, resolve the earliest active owned project and pin its id in per-user browser selection. Never silently fall back from a missing/foreign/archived explicit selection; Account remains available for recovery. Scope query caches by user/project, cancel stale requests on switching and key project subtrees so local drafts cannot cross projects. Create retries retain their request/project ids and a verified per-request actor; never mutate shared client authorization. Every private child app table carries `user_id` + `project_id` and owner-only access; this does not grant sharing or class access.
- Signed-in pages live under `src/routes/_authenticated/` and normally wrap content in `RequireProject` + `AppShell`, with a desktop sidebar and mobile bottom nav. Setup and Account are authenticated recovery exceptions: Setup may create an idea, and Account must remain reachable when a selected project is unavailable. Account lists only the verified owner’s projects.
- Project archive is currently recoverable metadata (`archived_at`, `lifecycle_revision`) with owner-only CAS create/archive/restore helpers. It does not yet freeze legacy CRUD; WS-009 owns that enforcement. Preserve old content and explicit selection/recovery while integrating lifecycle UI.
- Platform-admin grants are operator-only, stored in the database and checked fresh server-side; audited aggregate responses expose no raw project/student notes. The trusted presenter flag remains a separate narrow demo permission, never a general role grant.
- Stage unlocks are stored in `projects.stage`; manual checklist ticks and Stage 3 metrics live in `projects.checklist` JSON — avoids extra tables for small state.

- Read `ProductSpec.md` first, then `FEATUREROADMAP_workplan.md` §0-§1 before doing any work; update the roadmap's state block before you stop.
