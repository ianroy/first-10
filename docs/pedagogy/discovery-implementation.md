# DISC-001 manual discovery workspace

The authenticated `/discovery` route now implements the seven-step manual cycle. Its own project-scoped record is independent of `projects.checklist`, stage counters and existing interview answers. `RequireProject` supplies the currently selected owned project; the route remounts the workspace on owner/project change.

## What a student can do

1. Describe a problem and proposed solution. An explicit button copies a saved idea brief into an empty frame if it fits, then leaves every word editable. Nothing is inferred or replaced automatically.
2. Enter a falsifiable hypothesis with population, situation, predicted observation, disconfirming criterion and time window. Preserve the first attempt and append up to 20 versions; use any version as an editable starting point for a new one. These are student-reported entries, not verified independent authorship.
3. Plan up to five reachable aliases with relationship and relevant experience. Fewer than five is permitted. Optionally select an existing owned contact or unlink an unavailable reference without losing the local text. Add actual contacts through People.
4. Record possible false positives/negatives, mitigation and missing perspectives. These are limitations of sampling and method, never diagnoses of people.
5. Write, edit and preserve up to 20 script versions tied to a hypothesis and explicitly selected context captures. Existing script versions remain intact.
6. Review the exact chosen saved script, export its permission opening/questions/note worksheet, and conduct a conversation outside the app. Alternatively, explicitly confirm **Use this saved script in Interview** to replace only preparation questions. That adoption clears the old AI-origin receipt, compares both prior question content and origin, and leaves all completed answers unchanged. Save the workspace first; then choose a saved person in Interview. Printing, adopting or opening Interview never counts a conversation.
7. Read current owned interview notes, optionally report a connection to a script version, and record observed behavior, exact words, interpretation, counterevidence and a next decision/test. The UI flags differing actual question text. Unlinked manual observations remain useful and never create completed interview records or advance a stage.

## Context, privacy and retention

At any step a student can add an immutable public website/GitHub URL or pasted product text, prompt, model output or other context. Captures store kind, label, capture/review date, reported storage permission and retrieval state. URLs are inert text: no page/repository is fetched, executed or sent to a model. Pasted model output stays an unverified draft rather than interview evidence. Public URL validation rejects embedded credentials, local/private literals, obvious secret parameter names, encoded parameter names and token fragments. A bounded secret screen is defense in depth, not proof that arbitrary pasted text contains no sensitive data.

A capture is added to the workspace draft and persisted only by Save workspace. Unadded form text remains local and triggers dirty-navigation protection. Review/storage permission are separate from AI and sharing permission. This feature makes no AI request and grants no teacher, class, team or external access.

A student may permanently exclude a saved capture from current reuse and export. The UI/PDF omit its content and withhold linked script bodies/titles; adoption also refuses those scripts. A new reviewed script can be authored separately. Exclusion is not erasure: immutable captures and the last three saved document revisions remain in private storage. The dedicated privacy purge task owns deletion behavior. Manually copied text in other fields cannot be automatically identified or withdrawn; review/redact the whole export before sharing it.

## API and database boundary

- `loadDiscovery({data:{projectId}})` returns `{ok:true,workspace:null|{id,revision,savedAt,document,history}}` or a safe failure.
- `saveDiscovery({data:{projectId,expectedRevision,mutationId,document}})` returns `{ok:true,id,revision,savedAt,document,history}` or a safe failure. Use revision `0` for first save. Identical uncertain retries reuse the mutation UUID; changed content gets a new UUID. Only the most recent request token is retained; older retries encounter revision conflict rather than reapplying.
- `adoptDiscoveryScript({data:{projectId,expectedRevision,scriptId,expectedQuestions,expectedOriginId}})` returns the adopted questions or a safe failure. The script must be the selected saved version. Its workspace revision and existing preparation content/origin are compared under the project lock.

Migration `20261018013000_discovery_workspaces.sql` adds an owner-only table, composite project/owner foreign key, immutable identity, SELECT-only browser grants and three authenticated RPCs. There is no client-supplied owner, service-role writer or direct document mutation grant. RPCs resolve `auth.uid()` and current ownership. Saves/adoptions lock the project, reject archived writes and check referenced contacts/interviews belong to the same current owner/project; referenced rows are key-share locked during save. Archived owners may load old work. Student/teacher/admin role metadata does not bypass ownership.

The strict version-1 JSON contract rejects unknown fields, duplicate activity identifiers, dangling references, invalid URLs and oversized text/arrays. Existing hypothesis/script/context arrays are append-only ordered prefixes. Old exclusion IDs cannot be removed. Current draft fields, sample map and observations remain editable. The request limit is 288 KiB; the application document limit is 192 KiB and the PostgreSQL serialized-storage cap is 256 KiB. A direct RPC caller can be bounded differently by JSONB serialization; the supported UI always passes the stricter application validator. History contains at most three previous saves. No localStorage/background autosave exists. Save errors and revision conflicts preserve the current local draft; explicit reload confirmation discards it only after a successful load.

## PDF integration and inventory

`discoveryActivities(document, {savedAt, revision, dirty, fictional})` returns pure `ActivityOffer[]` for:

- Problem/solution frame.
- Current hypothesis draft and each preserved hypothesis version (first attempt identified).
- Reachable-person map and a separate sampling-risk/missing-perspectives activity.
- Current editable script and each exact preserved script with answer/quote/uncertainty space.
- Each reported result within the observations/decision activity, with optional source references described without IDs.
- Current decision, product change, next test and uncertainty.
- Context captures with retrieval/review limits and excluded-content tombstones.

The route's owner-authorized launcher supports individual selection and bounded portfolio batches. Current edits invalidate the reviewed snapshot; dates are derived from saved source state and the shared launcher's content fingerprint. The coordinator must add this adapter to the saved-project portfolio, nav, generated routes/types and the canonical activity coverage inventory. Future AI feedback, retrieval, classroom submissions and teacher/team bundles remain separate tasks.

## Verification and rollback

- 76 local rollback-only PostgreSQL assertions cover ownership/role isolation, direct-write denial, first/version mutation/deletion/reordering, irreversible exclusion, CAS/idempotency, foreign/deleted sources, unlink retention, archive behavior, URL/secret guards and exact adoption without changing old answers.
- The complete local policy suite with the coordinator's current demo-budget fixture passes 1,011 assertions; rollback cleanup confirmed. Migration apply was restricted to the Docker database guarded by published port `55322`. No hosted apply was performed by this worker.
- All 612 application tests pass (including 48 focused discovery tests); typecheck, scoped ESLint and production build pass. Focused schema/adapter/UI tests exercise strict bounds, individual export freezing, first-attempt retention, source limits, failed-load/save recovery, retry identity, explicit adoption, mismatch/unlink and dirty-navigation confirmation.
- An actual 20,969-byte, two-page fictional script PDF was generated with the bundled Noto fonts and visually inspected. Élodie renders correctly; headings, permission text and note lines wrap within margins. Question numbers accompany continuation fields. Existing font/glyph limits remain explicit and unsupported glyphs fail rather than corrupt output.

Rollback is disable the Discovery navigation/route and revoke the three authenticated RPC execute grants, preserving the table and saved work. Do not drop the table or rewrite applied migration history. Re-enable only after a forward repair and the policy tests. Existing Interviews and People remain functional independently.
