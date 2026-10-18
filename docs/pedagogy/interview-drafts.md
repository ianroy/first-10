# Private interview drafts (WS-004)

The version-one draft backend stores incomplete interview work separately from completed interviews. A draft never contributes to completion counts, stage gates, synthesis evidence, class submissions or shared projections. Drafts are owner-private; selecting a PDF audience never grants access. The interview route now exposes explicit private save/resume and reviewed completion, while retaining preparation editing, provenance and completed-interview exports.

## Contract and lifecycle

`src/lib/interview-drafts.ts` contains the strict schemas. All five server functions in `interview-drafts.functions.ts` receive an explicit `projectId`; the authenticated server independently refreshes identity and the database checks project ownership. No client-supplied owner, service credential or role is accepted. Transport is bounded to 15 seconds and responses are not cached.

- `listInterviewDrafts({data:{projectId}})` returns active summaries (no note bodies).
- `loadInterviewDraft({data:{projectId,draftId}})` returns a current version-one record or a terminal completion receipt.
- `createInterviewDraft` additionally takes nullable `contactId`, exact `expectedQuestions`, nullable `expectedOriginId`, and `noteStatus` (`unknown` or explicitly reported `granted`). The caller keeps the same random draft ID for an identical retry. The database compares the saved preparation snapshot before creating it.
- `saveInterviewDraft` takes `expectedRevision`, a stable `mutationId`, nullable `contactId`, and the complete document. Identical retries return the saved result; changed payloads cannot reuse a mutation identity. Stale revisions return `CONFLICT` without overwriting the newer draft.
- `completeInterviewDraft` takes only the scope and reviewed `expectedRevision`. In one transaction it captures the exact saved answers and permission choices using the existing consent-aware interview RPC, stores a completion receipt and clears the duplicate draft document. Its server-owned completion identity ensures retries and two concurrent completions create only one interview.

The document preserves exact question text, notes, quotes, tags, note/AI/sharing reports and current position. The initial question snapshot and origin reference cannot be replaced by later preparation edits. A contact reference may only be retained or explicitly unlinked; missing/deleted references require an actionable unlink. It cannot be reassigned to another person. No foreign contact/project reference is accepted.

Creating with the same identity after completion returns the terminal receipt, even when current preparation has changed. A caller must show that receipt and must not interpret the replay as a fresh interview. Active lists exclude terminal receipts. Completed records retain questions and minimal identifiers/timestamps but no duplicate draft notes.

## Permission and retention boundaries

All permission choices default to unknown; a note-granted report is required before storing nonempty notes/quotes or completing. These are owner-reported choices, not independently verified consent, an AI authorization for incomplete notes, or a sharing grant. Changing to a non-granted note choice requires clearing note/quote text. No historical draft text copies are retained: revisions replace the one current document, while idempotency stores only a hash and the current mutation identity.

At the maximum safe revision, the only allowed update clears every note, quote and tag and withdraws all three choices. That terminal privacy-reducing update cannot be reversed by an old maximum revision. Previously downloaded files and database backups are outside this current-document clearing action; broader purge/export lifecycle work remains separate.

Archived projects remain readable to their owner, but draft creation/saving/completion is blocked. Migration 16000 forward-fixes the existing direct capture RPC to reject archived writes and preserve later-stage contact states. Only Stage 1 `to_contact`, `new`, `contacted` or `replied` transitions to `interviewed`; Stage 2/3 and trial/active/paying states are preserved.

Limits are explicit: 100 active drafts per idea; 1–30 questions; 2,400 characters per question; 6,000 per note; 2,400 per quote; bounded total JSON. Exceeding limits fails without truncation. No automatic local storage, autosave, AI generation, remote URL fetch or publishing occurs in this backend.

## Save/resume interface

Preparation lists current private drafts independently of the current preparation editor. A saved draft can resume even if preparation questions have since changed or have been removed. Starting a separate draft requires the current questions to be saved and the draft list to load successfully. A person from any stage may be selected, or the owner can explicitly choose an unlinked manual conversation. Beginning without reported note permission is allowed, with note entry disabled.

The session restores its exact questions and position. Typing does not autosave. **Save draft** persists the current document and choices; **Complete interview** remains disabled until that revision is saved, the owner reports conducting/reviewing the conversation and confirms the completion dialog. A successful save clears the review checkbox so completion always requires reviewing the latest saved revision. Unknown permission choices remain unknown.

Save failures preserve current local notes and the identical retry identity. Stale conflicts keep local work available for owner PDF recovery and require explicit reload before overwriting. Reload itself is confirmed, and a failed reload retains local text. A missing contact reference has an explicit unlink action. Leaving dirty work uses a Radix confirmation and browser navigation protection. Scope-keyed mounting prevents a previous owner/project/session draft from carrying into another selected workspace.

**Clear notes and save withdrawal** explicitly clears notes, quotes and tags, sets all three reports to withdrawn and saves that revision. If a stale conflict or deleted contact prevents the save, the interface reports the failure; it does not claim the stored copy was cleared. A completed receipt has no editable session or completion control. An uncertain completion retry uses the same saved draft revision and accepts the existing receipt without a second interview.

Manual observation entry in Discovery remains available separately. A draft is never quietly promoted to a completed observation, and no data is automatically sent to AI.

## PDF acquisition

`interviewDraftActivities(project, records, dirty=false)` creates owner-only activity offers from already authorized records. It rejects a mismatched project, excludes completion receipts, preserves all current answers/choices and origin metadata, and marks current edits versus saved incomplete work. Trusted adapters must verify acquisition/owner identity; this pure function is not an authorization boundary. The standard export review/selection/redaction component governs download. Fictional source markers use the same trusted project marker as other exports.

## Verification and operations

Migration `20261018016000_interview_drafts.sql` was reviewed and applied only to the dedicated local Docker database on port 55322. SHA-256: `6151037ebe56df6cbc02a32cdfc6ef0d1d9818339bfc8c56818406891198764a`. Publication and hosted migration remain coordinator-controlled.

- 103 focused rollback-only SQL assertions passed, covering all owner/role boundaries, snapshots, malformed inputs, permission clearing, archive behavior, deleted links, terminal revisions and completion replay.
- The complete local rollback fixture suite passed 1,295 assertions, with valid TAP plan and cleanup verification.
- 16 focused schema/server tests passed, including fresh authentication, bounded transport, strict output projection and completed-create receipt replay. Nine session, four list, three PDF adapter tests and six desktop workflow tests verify resume, permission gating, both ambiguous retry paths, conflict/export recovery, completion, withdrawal, explicit leave and deleted-contact handling. Scoped lint and TypeScript passed.
- `PATH=/Users/ianroy/.local/bin:$PATH node src/tests/ws-004/concurrency.mjs` passed real overlapping sessions: one winning save, one stale conflict, no extra revision on identical retry; one completed interview/consent/receipt under concurrent completion; duplicate draft notes cleared.

The concurrency runner is hard-coded to the dedicated local container and port. It creates fresh synthetic identities. Its narrowly approved cleanup exception verifies exact fixture identity, takes an exclusive lock on the consent history table, disables only that table's append-only trigger while deleting those exact fixture audit rows, re-enables the trigger before committing and asserts both fixture absence and trigger restoration. It must never be adapted to a hosted database or run against real participant records.

For release rollback, hide the draft UI and retain data/schema; do not destructively drop private work. The forward capture fix is independently protective. A corrective migration should preserve completed receipt idempotency and owner privacy. Never rewrite a published migration or restore draft text over a completed/withdrawn record.

### UI integration verification

The worker full application suite passed 734 of 735 tests before the final additional retry test; the one expected failure is the coordinator-owned export inventory still pointing to the removed local-only session adapter. Its replacement is `interviewDraftActivities` mounted in `src/components/interview-drafts/InterviewDraftSession.tsx`; the shared coverage/portfolio inventory is updated by the coordinator. This is not a claim that the pre-integration full suite passed.

An actual 22,983-byte, three-page PDF was generated from current unsaved fictional notes, rendered and inspected on pages one and two. Unicode text, draft/fictional labels and pagination were readable; extracted text retained the end-of-long-observation marker and inert hostile text. No external request was made. The worker production build passed. Browser/hosted deployment and authenticated end-to-end save/resume validation remain coordinator release checks.
