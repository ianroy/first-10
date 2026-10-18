# Reviewed guest Marketing Lab handoff

This CLS-008 slice gives an account-free learner a deliberate teacher-only copy of selected Marketing Lab work. It does not grant teachers access to the saved plan. It does not add account identities, public links, AI processing, automated outreach or a new sharing audience to the existing discovery/account contracts.

## Actual source and ownership

Migration `20261018024000_guest_marketing_handoffs.sql` is additive to published21/22/23. Its private, RLS-enabled closed relations are `marketing_submission_choices`, `threads`, `previews`, `versions`, `grants`, `operations` and `audit`. Composite foreign keys bind each genuine Marketing Lab plan to its actual class/team, publishing guest principal and assignment. The names above share the `marketing_submission_` prefix. There is no fake auth user, project or learning-activity relation. Existing account/learning submission functions and payload discriminants remain unchanged.

Guest server functions are namespaced in `src/lib/guest-marketing/handoff/`. They use the existing same-origin bounded POST, HttpOnly guest session and session-bound CSRF executor. Callers cannot supply authority through a user, project, class, team or presenter flag. Guest RPC execution is service-only; authenticated teacher RPCs separately verify the current account token and fresh database class owner/teacher membership. Raw tables and private helpers have no public/anonymous/authenticated/service-role grants.

## Reported eligibility and actual access are different

A missing choice is **unknown**. Each publishing principal has a separate reported-sharing choice for each accessible plan; another teammate's choice does not become a team-wide choice. The report says that the publisher may submit selected authored marketing material. It does not verify participant consent and is not an audience access grant. Private interview notes, personal details and material the publisher may not disclose must be excluded. Team membership alone never submits anything.

Saving an explicit `granted` report permits a private preview. The learner then chooses a published assignment, 1–12 closed source selectors, optional exact source substrings, up to30 literal redactions and a bounded reflection. SQL derives the actual saved source text; arbitrary caller text cannot stand in for a source. It scrubs email addresses and UUIDs from selected presentation text and labels excerpts **Student-authored / student-reported; not verified customer evidence**. Interpretations, hypotheses, manual counts and content drafts do not become verified customer observations.

Only a separate explicit `selectedCopyConfirmed:true` request with the exact preview hash creates an immutable version and a distinct teacher access grant. Previewing or downloading a private preview grants no access. Source kinds include the saved thinking/audience/resources/test/reflection groups and a specific saved channel/content/outreach/task/measurement. Whole objects are shown as bounded JSON text, with an optional exact substring to narrow a large selected record. Test-group selection excludes separately selectable tasks.

## Versions, revocation and access deadlines

Preview/confirm bind the saved plan revision/hash, reported choice revision, exact redacted payload, expected thread version, publishing principal/team access generations, class revision, published assignment revision and exact class access deadline. Confirm rebuilds that basis before writing. A changed source or choice requires a fresh preview. A10-minute preview also expires at the class access deadline.

A later ordinary plan edit never changes or automatically withdraws an already published immutable copy. Teacher eligibility reads only saved snapshot content and source/permission/scope metadata, not the current raw plan document. A withdrawn sharing choice or changed choice revision, withdrawn grant, class/assignment revision, principal/team generation, closure, expiry or revocation denies the prior recipient copy. Regrant, reopen or recovery cannot silently revive it; a fresh deliberate publication is required. The response distinguishes an active recorded grant from `recipientEligible:false`.

Guest author list/get/export and withdrawal remain tied to the actual publishing principal. A teammate cannot read another publisher's teacher copy. The author can retrieve their own immutable version after ordinary source edits or recipient withdrawal while current guest access remains valid. Guest expiry ends this access. The UI tells learners to export before class access ends. This feature promises no permanent archive, new account transfer, verified deletion or recall of earlier downloads. Assignment due dates remain instructional metadata; changing assignment metadata advances its revision. The class access deadline is the enforced guest access boundary.

Guest actions acquire the class lock, resolve the current guest after waiting, then lock the relevant source/choice/thread rows. Recovery, closure and concurrent source writes therefore cannot bypass a stale pre-lock check. Mutating operations recheck guest access after writes and raise a caught transaction exception on late expiry so content, grant, preview consumption and receipts roll back together. Teacher reads acquire a class share lock and check current role/grant eligibility.

## Storage and retry bounds

The first slice is teacher-only. There is one thread per publishing principal, plan and assignment, at most50 threads per publisher,20 versions and50 previews per thread. Each preview specification is at most64KiB, each payload/manifest40KiB, each excerpt6000 Unicode code points, and reflection fields retain their individual bounds after redaction and scrubbing. Unsupported/null/duplicate selectors and unknown authority fields fail closed.

An additional stored byte guard includes preview specification+payload+manifest and submitted payload+manifest+authority. The total must fit **2MiB per publisher** and **16MiB per class** before each new allocation. The class lock serializes these checks. Refused allocations preserve existing work and exports; the generic capacity message does not disclose another learner's usage. Consumed-preview retries reuse the stored version and never duplicate payloads.

Ordinary operation history is capped at2000 per publishing principal and ordinary activity calls use the shared120/minute guest bucket. Stable request identifiers bind the exact intent. An existing matching receipt returns the current authorized result; conflicting reuse fails. A new ordinary request at capacity is refused even when a consumed preview already exists; retrying the original recorded request remains available.

First monotone sharing-choice or snapshot withdrawals bypass ordinary storage/rate caps. They add at most one receipt per newly reduced choice/snapshot; fresh repeated withdrawals of already withdrawn material are no-ops without additional receipts or audit rows. Grants and ordinary choice changes cannot be reopened indefinitely at the receipt cap. Choice revision capacity reserves the last finite increment for withdrawal. Snapshot grants reduce only from active to withdrawn. Published payloads, thread scope, choice scope and preview content have immutable identity guards; the audit is append-only.

## Desktop, unsaved work and PDFs

`ReviewedMarketingHandoff` is keyed by class/team/principal/CSRF and plan. A form change or saved-plan revision change disables its prior preview. Exact uncertain requests retain their identifiers and request body. Newer local edits survive earlier acknowledgements. Stale scope responses are ignored. A deliberate clear action warns that an already-sent request may still finish and keeps form text. The parent Marketing Lab guard combines plan dirty/busy/uncertain state **OR** the child's draft/busy/uncertain state; a clean child cannot clear a dirty plan.

Private-preview and private-author PDFs use `guest_principal_private`; authorized teacher PDFs use `submitted_snapshot`. The common PDF UI applies fresh authorization before generation and again before delivery. A preview rechecks the original preview request and exact returned DTO; an author copy rechecks its own get endpoint; a teacher copy rechecks its separate teacher endpoint and exact eligibility DTO. A withdrawn author PDF never restores teacher access. No new rendering service or provider call is used.

The coordinator owns the final teacher-panel mount in `ClassroomManager`, the three PDF coverage registry entries, official generated types, normal schema application and deployed browser rehearsal. This branch supplies the guest child mount and a separate `TeacherMarketingSubmissions` component. It does not claim the teacher dashboard is connected until that coordinator integration actually ships.

## Verification receipt, 2026-10-18

The first approved disposable clone applied the candidate but stopped on a PL/pgSQL local/query-alias collision in withdrawal. Its exact clone was dropped and absence verified. A narrow local-variable rename produced migration SHA256 `9bd05330ef36dc72109419b2b9dcc297242cace0468d7a816b16d8e0a48e3634`. No published migration was edited.

The coordinator independently reviewed that pin, harness `b78558506ed0a2b3c9ee0e233add2847e084403ee861c1ad218eb0e0aa213981`, races `fc39343d99ad6794d23062b16c2616e90ecd8d8e7be02177433a3bcd49e15a63` and SQL fixture `0f9cc9c24b0aa17e786636a435f3d824074561ddf00b11c4f796f06e31945738` before the second run. The harness verifies the exact running dedicated container, every5432 binding on55322, source schema through23 without24, a fresh absent random clone, schema-only restore and zero cloned auth users/projects. It applies24 only to that empty clone, runs fictional fixtures, then drops that exact clone and verifies absence. The original local database and hosted service remain unchanged by this worker.

Second run: **1810 actual rollback SQL assertions, zero failures/known gaps, valid plan and rollback; eight fresh actual SQL DTO/production-Zod checks; six observed separate-connection races/barriers** covering plan-save versus confirm, choice withdrawal versus confirm, duplicate confirmation, class closure, real principal recovery and late-expiry insertion rollback. The SQL includes real publisher byte refusal and first privacy reductions at byte/ordinary receipt caps. The class byte limit and per-thread row limits are implemented and source-pinned; this receipt does not claim an independent exhaustive class-cap stress test.

Local receipts (not deployed proof):

- `/private/tmp/firstten-marketing-handoff-rehearsal.log`: first failed run and cleanup.
- `/private/tmp/firstten-marketing-handoff-rehearsal-fixed.log`: passing second run and cleanup.
- `/private/tmp/firstten-marketing-handoff-actual-dtos.json`: fresh SQL DTOs.
- `/private/tmp/first-ten-marketing-handoff-pdf/`: actual2-page teacher,2-page withdrawn-author and1-page private-preview PDFs plus rendered pages; complete selected text, Élodie Unicode, evidence/access labels and no annotations checked. All rendered pages visually inspected.

Dedicated UI/contracts/PDF and adjacent workspace tests pass:117 assertions with the eight fresh actual24 DTO checks enabled,17 older actual-fixture-only checks skipped. Typecheck, scoped lint/format and Vercel production build pass. A full inherited-base run recorded1071 passing tests and the known WS004 asynchronous review-reset assertion failure already corrected by the coordinator on newer main. The worker preserves that test and base; root performs final combined checks after integration. This feature does not complete the entire CLS-008 roadmap: owner-Lab derived parity, account continuity, complete class/team bundles, source-fenced AI and research gates remain separate work.
