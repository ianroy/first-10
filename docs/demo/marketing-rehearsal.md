# Public $0 Marketing Lab rehearsal

MKT-007 · 2026-10-18. This is a fictional teaching example, separate from the planned saved Marketing Lab. It introduces no provider calls, production queries, storage writes or publication APIs. Normal page assets still load through the browser.

## Entry and story

- Full discovery-to-plan path: `/demo`. Inspect Maya, preserve Nora’s disagreement, choose a next move and preview the proposed test. The marketing board follows that chosen move.
- Direct stage shortcut: `/demo?view=marketing#marketing-lab`. It explicitly selects the attendance-confirmation example, starts with the thinking panel and explains the shortcut. Refresh returns to that known setup.
- Script-free fallback: `/demo/studyloop.html#marketing-lab`. It includes both channel drafts and all three decision branches.
- **Reset entire example** clears discovery and marketing state, removes the shortcut query/hash and focuses the first source step. No demo choice is copied into a real project.

## A 75-second extension to the discovery story

| Time   | Show                     | Explain                                                                                                                                                      |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0–12s  | Audience + Nora boundary | “The next invitation should follow the decision. We focus on groups with uncertain attendance, not every student.”                                           |
| 12–25s | Think                    | Invite a first thought or deliberately open the fictional student thought. “Students think before using the scaffold.”                                       |
| 25–40s | Channels                 | Compare campus-club introduction with a course-community post. Switch the primary. “Access is a question to investigate, not something the AI can grant.”    |
| 40–55s | Draft                    | Open **View sample draft**. “The student team discloses its role and asks for one useful action. This is a prepared example; no AI or posting is happening.” |
| 55–65s | 7 days                   | Show permission, peer review and a bounded manual plan. “This is a research/recruitment week. Any later trial needs its own full week.”                      |
| 65–75s | Review                   | Show five **Not measured** values and a repeat/revise/stop criterion. “A plan is not traction. Explain what evidence would change the next decision.”        |

Five-minute expansion: choose **Ask another group** in the discovery panel. The board changes to a research comparison; Nora’s group is a source to learn from, not a sales prospect. **Keep exploring partner discovery** instead seeks a recent unsuccessful search and explicitly says the four excerpts do not support that original direction yet.

## Behaviors and limits

- A nonblank practice thought or explicitly opened fictional thought unlocks the scaffold. The original practice text remains available in **Starting thought** within this temporary board.
- Choose one primary channel; the other is its distinct fallback. Neither has a verified venue, URL or permission. Changing the primary closes the old draft and clears channel-specific peer/reflection notes.
- All sample content is authored and labeled for human review. The public example makes no claim to have run AI, completed peer review, sent an invitation, recruited anyone or improved attendance.
- The $0 ceiling means no new cash. The three-team-hour ceiling is a proposed planning constraint, not an estimate that every task will fit. Simplify or pause when time/access is insufficient.
- All funnel outcomes remain unknown. Groups, people, peers, classmates and outside participants are not interchangeable denominators. No numeric rate is calculated.
- Notes are temporary; reset, refresh, a new discovery choice or leaving the test clears them. The signed-in saved Marketing Lab remains planned.

## Verification recorded

- Full application suite: **69 tests, 11 files passed**. This includes 10 new marketing tests for student-first gating, the two channel drafts, all three discovery branches, no fabricated outcomes, combined/standalone reset, changed audience, no fetch/XHR/storage writes, remount isolation and fixture-aligned static fallback.
- TypeScript `tsc --noEmit`: passed after the dev tool regenerated the route tree locally. Scoped ESLint and Prettier: passed.
- Real Chrome, local Vite dev server with Supabase variables unset: canonical shortcut, keyboard Enter/Space/arrow-radio interaction, disclosure focus, whole-example reset, cleared query/hash, reset focus and refresh without carried notes verified. No warning/error console entries were recorded in that walkthrough.
- Desktop 1440×1050 and phone 390×844: no horizontal overflow in the channel panel. Screenshots are in `src/tests/mkt-007/screenshots/`.
- **Not run here:** production/Nitro build or deployment. The coordinator owns the serialized integration build and deployed check. Browser evidence is for the local dev server, not a claim about production.
- Paid API spend: **$0**. No migration, environment, package dependency, private data or RLS change.

Rollback: remove the marketing continuation and shortcut from `/demo`; the original source-to-test demo remains available. Keep the static fallback as a teaching resource. The generated route tree is excluded from this worker commit; regenerate at integration.
