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

- All AI calls go through `generateAI` in `src/lib/ai.functions.ts` (one server function, `kind` switch, strict JSON schema, streamed Responses API) — keeps prompts and the key server-side in one place.
- Each user has one project (first row); every app table carries `user_id` + `project_id` with an owner-only RLS policy — simple per-user isolation.
- Signed-in pages live under `src/routes/_authenticated/` and wrap content in `RequireProject` + `AppShell` — consistent gating and mobile bottom nav.
- Stage unlocks are stored in `projects.stage`; manual checklist ticks and Stage 3 metrics live in `projects.checklist` JSON — avoids extra tables for small state.
