# Activity PDF coverage

Version: 2026-10-18. Source registry: `src/lib/export/coverage.ts`.

This inventory covers current learning activities, including local drafts. It does
not claim that class membership, guest continuity or shared student submissions
exist. Every new activity must register a named export, its source authority,
current-state adapter and verification here and in the registry.

## Current adapter coverage

| Activity                  | Export choices and current state                                                                                                                                                                                              | Source boundary                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Idea / audience / problem | Named idea brief; setup coordinator also mounts unsaved current form                                                                                                                                                          | Selected owner project                                                                                          |
| Discovery cycle | All seven steps, separate sampling risks, preserved hypothesis/script versions, reviewed context, results/reflection, exact selected script and blank note worksheet | Owner-private current edits or saved workspace; excluded context text omitted |
| Interview preparation     | Current question list and recorded origin when available                                                                                                                                                                      | Owner; interview route integrated by coordinator                                                                |
| People and relevance      | Each contact, relationship, relevance, source, stage and status; separate new-person draft                                                                                                                                    | Owner-loaded records; ownership checked                                                                         |
| Interviews                | Each saved note/quote/question/tag/completion record; current unsaved interview and permission report                                                                                                                         | Owner; permission choices stored separately, no sharing permission inferred; coordinator mounts interview route |
| Learnings                 | Current edited synthesis, counterpoints, quotes, suggested changes and source receipt; each other saved learning in selected portfolio                                                                                        | Owner; changed synthesis returns to draft marker                                                                |
| Experiments               | Each hypothesis/action/current result plus unsaved new experiment                                                                                                                                                             | Owner; empty result is not a test outcome                                                                       |
| Stage checklist           | Manual ticks; saved portfolio additionally reports computed source counts                                                                                                                                                     | Owner; record counts are not verified people or demand                                                          |
| Outreach                  | Each current edited message, channel suggestion, referral and onboarding question; stage pipeline contacts                                                                                                                    | Owner; drafts remain unsent                                                                                     |
| Feedback survey           | Current edited questions and source receipt                                                                                                                                                                                   | Owner; no automatic response collection claimed                                                                 |
| Next 100 metrics          | Current manual count edits; missing values remain unknown, explicit zero stays zero                                                                                                                                           | Owner; no inferred conversion rates without cohort/date/denominator                                             |
| Manual Marketing Lab      | Five named steps: original thinking/audience/sources; channels/access; content/walkthrough; bounded test/tasks/resources; measurement/comparison/reflection. Each content draft, task and measurement also has its own choice | Current in-memory owner plan, revision/date/dirty markers; original thinking and all known fields retained      |
| Temporary AI practice     | Current edited body, separate original response and recorded metadata; previous edited bodies                                                                                                                                 | Fixed fictional case; unsaved, unadopted, no additional generation                                              |
| Educator planning         | Private lesson plan with all fields; separate assignment preview without facilitator notes; 60-minute reference agenda and rubric                                                                                             | Owner-private planning, capacity is not enrollment                                                              |
| Classroom example         | Each of four authored teams, counterexample and next step; current local feedback draft                                                                                                                                       | Fictional, not students or live submissions; feedback unsent                                                    |
| Public discovery example  | Starting assumption, each fictional interview source, interpretation/counterexample and current proposed decision                                                                                                             | Public authored fixture, no auth/source request                                                                 |
| Public Marketing Lab      | Five named boards with current practice thought, selected channel, sample-draft state, proposed test, peer note and reflection                                                                                                | Public fictional fixture; refresh/reset clears local work                                                       |
| Selected saved portfolio  | Explicit chosen batches of owned saved records plus separately loaded saved marketing/teacher/discovery plans                                                                                                                           | Coordinator dashboard/account integration; no claim that unsaved edits from other pages are included            |

Coordinator-owned integration files are `interview.tsx`, `setup.tsx`, `account.tsx`,
`dashboard.tsx`, `OwnerSavedWorkExport.tsx` and `IdeaBriefExport.tsx`. Their combined mount checks now pass, including current-form edits, exact permission states and cache-refetch completeness. Coverage entries bind each mounted source to a real adapter; adapters alone do not prove a shipped route.

## Selection and privacy

`OwnerActivityExport` accepts a project and either an `ActivityOffer[]` or a deferred
`() => ActivityOffer[]`. Deferred adapters run only inside a verified current-project
or authenticated selection context. Missing identity hides the export; mismatched
rows produce an export-only error. It never starts a new authentication lifecycle.
Only an explicitly selected recorded AI origin may trigger the owner-scoped
metadata RPC. Public fixtures use `ActivityExportLauncher` directly and make no
source/identity request. PDF generation fetches only bundled fixed-origin fonts.

The conservative fictional marker follows the reserved presenter owner or the
explicit project fixture marker. It never changes `owner_private` into a sharing
grant. Owner-only audiences remain enforced. Permission/consent selections are
not inferred from completion, acceptance, a role label or the export itself.

Review uses a detached frozen snapshot, email/UUID scrubbing and optional literal
redactions. Changes in source, selection or scope invalidate the preview and any
in-flight download. Identical rerenders do not regenerate snapshot time. Private
notes may still identify people contextually; the owner reviews before downloading.
No sharing, uploading, posting, new AI request or source write happens on export.

Long text is split into named continuation parts, not truncated. Each PDF accepts
at most 50 selected activities and 250,000 serialized characters / 120 pages;
choose smaller batches if necessary. Selection shows the selected and available
counts; a removed selected record blocks the batch instead of silently omitting it.
Unsupported glyphs fail visibly. Latin/Greek/Cyrillic are supported by bundled Noto;
full multilingual shaping and PDF/UA remain separate work.

## Verification

The focused EXP-002 tests exercise ownership rejection, current draft fields,
unknown versus zero, fictional flags, separate original/edited AI bodies, long
text without lost content, global key uniqueness, named choices, bounded batches,
stale sources, stable review time, source-scope invalidation, metadata-only fetches,
public current-state export without network calls, and registry/source bindings.

Actual PDFs rendered with the bundled fonts: fictional owner portfolio (21 pages),
marketing plus teacher examples (9 pages), and four authored classroom examples
(5 pages). Representative page PNGs were inspected for text wrapping, Unicode,
page boundaries, readable hierarchy and recurring draft/fictional markers. Engine
pagination and hostile-text checks remain in EXP-001.

## Explicitly pending

Guest sessions, membership-authorized classroom/student/team bundles, actual
submitted snapshots and permission-aware collaborative exports require their own
adapters when those features exist. New AI discovery activities must extend the
current manual-cycle adapters when delivered. Account privacy JSON and aggregate administrator operational views
are not learning-activity PDFs and do not grant access to private source notes.
