# WEB-002 verification and integration handoff

The public `/demo` route renders the reusable `StudyLoopDemo` component with bundled fictional content from `src/lib/demo/studyloop.ts`. It moves from listening to an interpretation, Nora's counterexample, a local choice and the matching proposed test. Every plan is explicitly unrun. Maya is the only direct quote; Owen, Priya and Nora remain labeled fictional notes/counterexample. Nothing is presented as participant research, product demand, learning gains or measured results.

## State and boundaries

- React component state only: step, open perspective and chosen direction. There are no storage, auth, data-hook, AI, analytics or request imports in the component/fixture modules.
- Reset restores step 1, Maya, no selected decision and closed source disclosures. It announces the reset and moves focus to the first heading. Refresh/remount returns to the same start. Separate component instances have separate state and radio-group identifiers.
- A choice is needed to open the proposed-test step. Back and source review preserve the choice. All three options have distinct questions, actions, observations and reasons to reconsider; none receives a score.
- The approved root change skips the page's Supabase auth subscription on `/demo` and `/demo/`, cleaning up an existing subscription when entering and resubscribing when leaving. Existing sign-in/user-update invalidation and sign-out cache clearing are preserved. This does not clear a user's real account session or claim to disable every previously initialized application service.
- Static text is at `/demo/studyloop.html`. It contains all four perspectives and all three proposed plans, has print styles and no script tags, and is served as a public asset independent of the React route. Tests compare its rendered text with the fixtures to catch drift.
- The example makes no live AI call or production mutation. Normal page assets and existing fonts still load over the network; this is not a full-site offline claim. No demo actions are emitted as research/product metrics or copied into a real project.

## Future composition

`StudyLoopDemo` may be embedded on the landing page without introducing another fixture set. Its optional `continuation: ReactNode` appears only after a chosen proposed test. The default is an explicitly planned marketing-lab preview with no false launch CTA. MKT-007 can replace that slot with its separately verified fictional continuation. Add a teaching CTA only after the teaching route is integrated and verified.

The coordinator must regenerate `src/routeTree.gen.ts` through the normal Vite/TanStack tooling after cherry-pick. Vite generated it for local verification; it is deliberately excluded from this task's commit. Do not hand-edit it.

## Checks actually run

- `bun run test`: **59 tests passed across 10 files**, including 10 new WEB-002 tests. New coverage includes all decision branches, source navigation, focus movement, full reset, independent instances, fetch/storage spies, static text parity and root listener cleanup/resubscription with private-event invalidation.
- `bun run typecheck`: passed after generated route registration.
- `bun run lint`: passed with zero errors and six existing component-export warnings.
- `NITRO_PRESET=vercel bun run build`: passed with all four Supabase environment variables unset. Existing large-chunk, input-validator deprecation and tsconfig-paths notices remain. The demo route chunk was approximately 6.08 kB gzip in this build.
- Chrome: direct `/demo` entry with Supabase configuration absent; initial Maya state; all source perspectives; Enter navigation; heading focus; Tab+Space source disclosure; native radio Space/ArrowDown/ArrowUp; proposed-test view; reset and refresh. Zero console errors/warnings on the exercised demo.
- Responsive review at 1280 px desktop and 390/320 px phone widths, with no horizontal overflow. The plain-text page loaded through its actual link, exposed all content, and contained zero script elements.
- Production smoke: the emitted Vercel handler and static assets were served by a temporary local Bun adapter, with Supabase configuration still absent. The built route completed the "Ask another group" branch and reset successfully, without console errors. The generic Vite preview incompatibility described in the BR-004 handoff remains outside this task.

Saved evidence: [desktop counterexample](screenshots/counterevidence-desktop.png), [phone counterexample](screenshots/counterevidence-mobile.png), [desktop proposed test](screenshots/proposed-test-desktop.png).

No paid calls, production records, migrations, dependency changes, deployment, physical projector test or full screen-reader certification are claimed. The coordinator owns deployed route checks, the claims ledger and roadmap completion state.

## Rollback

Revert WEB-002 and regenerate the route tree. Remove any later landing/teaching link to `/demo` at the same time. The static reading view can remain as a fallback if desired. No saved application data depends on this example.
