# Private interview autosave and recovery

WS-005 builds on the existing WS-004 `loadInterviewDraft`, `saveInterviewDraft` and `completeInterviewDraft` APIs. It adds no database, API, storage, AI or authorization surface. The component keys its complete session by the verified project's owner ID, project ID and draft ID; pending reads, writes, timers and confirmations belong to that mounted session. Disposed sessions ignore delayed responses. The existing server verifies the current actor and the database enforces owner/project scope, CAS, immutable scripts/contact bindings, lifecycle and archive restrictions.

## Save behavior

After 1.2 seconds without edits, the hook submits one bounded validated document with the current acknowledged revision and a fresh mutation ID. Changing question position, tags, contact unlinking and the owner's reported permission choices are part of that same document. Drafts remain incomplete and excluded from completed-interview counts and ordinary AI evidence. Nothing is automatically completed or sent to a provider.

“Saving” is not “saved.” Acknowledgement advances the saved revision. Background saving allows further typing: the earlier acknowledgement updates the revision but never replaces newer local edits. Those edits receive a separate CAS save only after acknowledgement of the earlier request. Foreground manual saves and completion retain their simpler disabled-editor behavior. Destructive confirmation dialogs suspend background dispatch until the owner makes a choice.

An uncertain transport outcome retains the exact request, including its mutation ID, revision, document and contact. Editing afterward does not change that pending request. Automatic saves stop; an explicit Save draft retries that exact request first. Only a successful acknowledgement permits a new request for newer local edits. Reconnection does not dispatch automatically. Deterministic failures also pause automatic saving; corrected local work requires an explicit save. Invalid permission/document combinations never reach persistence. Archive rejection retains local work and directs the owner to Account recovery.

## Conflict and recovery

A concurrent-tab conflict stops saves and keeps local text editable/exportable. Compare saved version performs a fresh scoped read and shows the saved revision, notes, quotes and permission choices alongside the retained local editor. A failed comparison preserves local work. No merge or permission expansion occurs. Review / reload saved draft requires explicit destructive confirmation before replacing local text; copying/exporting local work first is advised. A successful reload resumes from the saved version. A newer tab may still win a subsequent CAS, producing another visible conflict rather than an overwrite.

The route blocker and browser before-unload protection remain enabled while local work is dirty, a write is in flight or a read is pending. These are browser best-effort prompts, not a guarantee against power loss or forced closure. Only acknowledged server work can be resumed after reload. No localStorage, sessionStorage, background/offline queue or browser-private-text cache is added. Unacknowledged local text is lost on a forced reload or explicit discard; keeping the tab open or exporting remains necessary.

Completion remains an explicit review and atomic API operation against one saved revision. The review acknowledgement resets whenever that revision changes. Existing completion retry semantics prevent duplicate records. Explicit clear/withdrawal still clears notes, quotes and tags and saves all three reported choices withdrawn. An uncertain save must be reconciled before a further withdrawal write; there is no claim that an unconfirmed request can be recalled. Downloaded/completed copies cannot be recalled.

## Verification

The WS-005 behavioral suite covers debounce, acknowledgement-only status, reload/resume, edits during a delayed save, uncertain exact replay with newer edits, offline/reconnect suppression, two-version conflict comparison, failed comparison, delayed owner/project responses, archive rejection, navigation guards, no browser storage, confirmation suspension, invalid permission choices and response-scope mismatch. Existing WS-004 session tests remain unchanged. Existing SQL owns atomicity/authorization semantics; no new SQL behavior is introduced. Deployment/browser evidence belongs to the coordinator's integration record.

2026-10-18 isolated verification from base `d1362df`: 51 focused tests passed (13 new WS-005 behaviors plus unchanged WS-004 and desktop interview workflows). The full app run passed 1,036 tests across 106 files, with 11 pre-existing skipped tests in one file. Typecheck, scoped lint, formatting/diff checks and the Vercel production build passed. This is source verification, not a claim of deployed browser rehearsal or new SQL coverage.
