# Reviewed classroom submissions (CLS-002)

A class association is not disclosure permission. This slice supports a signed-in **student with their own account project → active teachers of one class**, through a deliberate server-derived preview and confirmation. It never adds classroom policies to private projects, interviews, contacts, discovery plans or learning tables. Guest principals and teams retain genuine independent identities; their activity adapter and team audience return `FEATURE_DISABLED` until CLS-008 supplies actual authorized activity state. No placeholder guest activities, artificial auth users, or fake project IDs are created.

## Publication flow

1. The caller chooses a real class, published assignment, associated own project and 1–12 source fields. No source starts selected. A class owner/teacher cannot impersonate a student author.
2. `previewSubmission` re-verifies the bearer actor and delegates to `preview_class_submission`. The database checks an active class, unexpired access, active student enrollment, explicit active own-project association and active own project. All source queries require both user and project identity.
3. Server allowlists source fields, checks separate recorded sharing choices, applies exact requested phrase redactions, removes email addresses and UUID identifiers, rejects recognizable credentials and generates the exact recipient payload. Unselected source fields and contact identity columns never enter that payload. All free text remains owner-reported; review must remove any other identifying details.
4. The author reviews this exact selected version, its teacher audience and the withdrawal/download limitation, then separately affirms publication. `submitSnapshot` sends only the preview ID, digest and stable request UUID—not a client-written snapshot.
5. Confirmation rebuilds and checks source content hashes, recorded permission revisions, class/assignment revisions, enrollment/association identities and revisions, project lifecycle revision, author alias, current thread version and preview expiry. Any change requires fresh review. The immutable version, active disclosure grant, thread revision, request receipt and content-free audit event are stored atomically.

A new request may submit a newly reviewed version; earlier submitted content never changes. Replaying a consumed preview returns its original author receipt and never creates another grant, including after withdrawal. Request reuse with changed input is rejected.

## Supported sources and separate permissions

Every selected source requires the project's separate `sharing_status=granted`. This does not enable AI or public access.

| Source         | Allowlisted fields                                                      | Additional conditions                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own idea       | name, description, audience, problem                                    | Actual own project                                                                                                                                                           |
| Discovery plan | problem, solution, hypothesis, script, reflection, next test            | Actual saved workspace; no people, raw results or supplied context automatically included                                                                                    |
| Interview      | selected exact substring of formatted answers, or bounded answers field | Completed real interview, note-taking and sharing granted; linked contact sharing granted                                                                                    |
| Learning       | title, body                                                             | Learning sharing granted and evidence not invalidated; conservatively binds all current possible contact/completed-interview source sharing choices, at most100 dependencies |
| Experiment     | hypothesis, change, result                                              | Actual saved owner-private experiment                                                                                                                                        |

An excerpt must be an exact substring of the server's selected field, at most6,000 characters. It is not a way to insert arbitrary invented evidence. Optional exact redaction phrases apply to excerpts and reflection. Source labels are generic and payload keys are snapshot-local (`excerpt.1` etc.). The private manifest contains source identities, content hashes and permission references; it never leaves an RPC as recipient data. The immutable private authority record likewise never enters the presentation DTO.

## Continuing recipient access and revocation

Each teacher read/list checks fresh authenticated class authority, an active submission grant, current active student enrollment/association, published assignment, matching original class/assignment revisions, matching enrollment/association IDs and revisions, and the exact original class access deadline. Every captured processing-permission revision must still match and remain restrictive-purpose eligible; deleted sources fail closed.

This first slice deliberately uses conservative revision matching. **Any processing-choice revision (even an unrelated AI-only change), class edit, assignment edit, enrollment change or association change requires a new deliberate publication.** Leaving/rejoining, removing/re-enrolling, reassociating the same project, republishing an assignment, reopening a class or extending its access deadline never revives or extends an older disclosure. Reassociation and renewed sharing choices alone are not renewed publication consent. A teacher role grants access only while that current class role is active; it does not provide private source access.

Source content edits do not rewrite an already submitted immutable copy. Project archive prevents new authoring; it is not itself a submitted-copy recall. The captured disclosure permissions and class boundaries remain independently enforced. Source deletion can remove author and recipient snapshots via actual foreign-key cleanup.

The author may read their own submitted immutable copies and withdraw a disclosure even after class expiry, closure, enrollment loss or project archive. Withdrawal only changes the grant active→withdrawn; it never deletes private source work or restores recipient access. This cannot recall material already viewed or downloaded. Author copies do not confer an ability to publish new versions after scope closure.

## API and mount contract

All seven exports in `src/lib/submissions.functions.ts` are POST server functions with fresh bearer verification, strict runtime input/output schemas, a10-second database request timeout, bounded request bodies and `private, no-store`, `no-referrer`, `noindex, nofollow` response headers. No raw errors, source manifests or credentials are logged/returned.

- `previewSubmission({data:{source,classId,assignmentId,threadId,requestId,audience,selections,redactions,reflection}})` → server preview ID/digest/expiry, exact payload and audience.
- `submitSnapshot({data:{previewId,previewHash,requestId}})` → own submitted view.
- `getOwnSubmission({data:{snapshotId}})` → author copy, independent of current class access.
- `getTeacherSubmission({data:{classId,snapshotId}})` → currently authorized selected recipient copy.
- `listMySubmissions({data:{classId?,cursor?}})` / `listTeacherSubmissions({data:{classId,assignmentId?,cursor?}})` → at most50 metadata headers, no payload or source IDs.
- `withdrawSubmission({data:{snapshotId,requestId}})` → own withdrawn header, safe replay.

`SubmissionPreview` requires a verified `scopeKey` (include actor identity), class/assignment IDs, a real discriminated source and owner-acquired `sourceOptions`. Class association/source IDs supplied by the caller are independently reauthorized. The subtree resets on actor/class/assignment/source/thread change; late replies from old scopes are ignored. Draft changes invalidate the displayed preview immediately. Supply `onSubmitted` to refresh the own list after publication.

`SubmissionList` requires `scopeKey`, mode`author` or`teacher`, optional class/assignment scope and `refreshKey`. Teacher mode requires a class and never falls back to author reads. Opening a version retrieves it freshly. Optional `onExport(view)` receives another freshly authorized DTO, not the previously cached payload. The coordinator owns all route mounts, individual reviewed-submission PDF adapter and export coverage registration. Do not mount a new activity without the PDF gate. PDF content must derive exclusively from this audience-approved payload and generic labels; do not include private UUIDs from route/metadata/source/actor/thread keys as activity, section or origin keys. Reauthorize immediately before generating/downloading a teacher PDF; a stale cached DTO cannot authorize it. Explicitly show author versus teacher audience and immutable version.

## Bounds and persistence

Maximums:50 threads per owner/project,50 historical previews per thread,20 immutable versions per thread,80 submit request receipts per thread,8 withdrawal request receipts per snapshot,12 selected fields per preview,30 redaction phrases of at most200 characters,6,000 characters per selected excerpt,40KB selected payload/private manifest,64KB request/specification and10-minute preview validity. Known request IDs remain replayable at capacity, and the first active→withdrawn privacy reduction is always available. Alias (80), title (120), reflection (3,000/2,000) and excerpt (6,000) character limits are rechecked after scrubbing/redaction; expanded text fails explicitly without truncation. Capacity errors are explicit and never delete earlier work or silently recycle publication versions. There is no retention-deletion claim; PRV-003 owns enforcement. Preview and submit operations serialize on class→project→thread; raw tables are closed to anon/authenticated/service_role and helpers cannot be invoked directly. The audit contains IDs/operation/time only and is append-only.

## Verification

The scoped server/UI tests exercise fresh identity, strict schemas, fixed RPC mapping, slow scope switches, separate affirmation, stale-preview invalidation, guest gates, teacher no-class denial, fresh PDF authorization and own withdrawal. SQL fixtures exercise actual policies/functions in rolled-back fictional state, immutable publication, separate source choices, selected redaction, source changes, non-resurrecting scope/permission revisions, class exit and expiry withdrawal. Database rehearsal results and actual competing-connection evidence are reported in the task handoff; unrun fixtures are not evidence of execution.
