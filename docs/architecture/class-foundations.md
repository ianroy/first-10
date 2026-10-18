# Class foundations (CLS-001)

This foundation supports authenticated teacher-owned classes or hackathons,
assignments, recipient-bound student invitations, and a student's explicit
association of an existing owned project. It does not enable anonymous guest
entry, submitted activity content, project sharing, class AI processing or
automatic retention enforcement. Those capabilities retain their separate
CLS-007/008, CLS-002/003, PRV-003 and AI task gates. A class owner is the account
that provisioned the class; this does not certify an institution or employment.

## Authority and storage

All six new public tables enable RLS and deny direct access to anonymous,
authenticated and service roles. The only application access is authenticated
fixed-operation security-definer RPCs with a fixed search path and narrow JSON
projections. Server functions revalidate the bearer identity against the
middleware's verified user. No caller-supplied actor or generic role/patch is
accepted. No existing project or private-child policy changes.

- `classes.user_id` is the immutable owner and final authority. The owner is
  derived, not duplicated in `class_members`. Owner removal, owner transfer,
  institutional roles and co-teacher invitations are unavailable.
- `class_members` contains actual auth principals, chosen aliases and scoped
  student/teacher roles. Only the owner grants/revokes teachers and removes
  students. Students and co-teachers can leave. Active co-teachers can manage
  assignments, but cannot grant roles, issue invitations or remove students.
- `assignments` records the immutable original author and actual last editor
  separately. Students see published instructions only; teachers/owner also see
  drafts and archived instructions. Assignment reading supplies no submissions.
- `class_project_links` requires both a real class membership and a composite
  `projects(id,user_id)` FK. Only the active student explicitly associates their
  own active project. The association is not consent to process or disclose any
  project content. Only that student receives its project ID. Teachers receive
  neither association targets nor raw project, contact or interview sources.
  Leaving, removal or promotion invalidates the link atomically; rejoining does
  not restore it automatically. A future assessment share must use the reviewed
  explicit `account_project` source contract, separate from guest team content.
- `class_teams` and `class_guest_principals` contain real class/team references
  and the actual class owner issuer, with immutable scope. Guest principals do
  not reference auth.users and create no fake auth account or project. There is
  no guest minting, session, capability, content or resolver API in this task.

Archive or expiry immediately denies ordinary student/co-teacher operations,
including replaying a previously successful assignment request. Owners retain
recovery metadata and cleanup authority; they can revoke links/members, archive
or explicitly extend an expired class. Revoked membership denies cached reads
on the next request. Historical records remain; removal does not erase student
project work. Class ownership is immutable and owner leave cannot remove the
last authority.

## Mutation and invitation semantics

Every ordinary mutation has a request UUID, a fixed operation/resource and a
SHA-256 payload identity in a private operation journal. Replays reauthorize
first, compare the full request identity, and return the original acknowledgement;
an acknowledgement is not fresh state. UI clients must refetch after a write,
retain local edits on conflict and never replace newer work with stale receipts.
Reusing a request UUID with different content returns IDEMPOTENCY_CONFLICT.
Revisions are safe integer CAS values; creation expects zero and stored rows
start at one. Final safe revision is reserved for archived/removed/left/inactive
states. Ordinary edits/regrants cannot consume the last revocation step;
REVISION_EXHAUSTED leaves active work recoverably revocable. Hard constraints
also prevent privileged maintenance from creating active terminal records.

All writers lock the class first. Member/assignment/project locks and CAS checks
follow; invitations also lock their record and membership. Access expiry uses
wall clock after waiting for locks. Acceptance checks expiry again after the
membership write and rolls the whole attempted enrollment back if expiry passed.
No accepted receipt can regrant a left/removed member or downgrade a teacher.
Archive, owner loss or expiry invalidates outstanding invitations.

Class invitation tokens are 256 random server-generated bits, stored only as a
SHA-256 hash. Creation returns the raw secret once; an identical retry returns
metadata with token:null and replayed:true. The owner can list/revoke metadata,
but cannot recover the secret. A new link requires explicit revoke/reissue.
The token binds one real recipient UUID and the enrollment revision at issuance,
grants only student membership, and expires within 1–30 days or at class expiry,
whichever comes first. Acceptance requires sign-in as that exact recipient and
an affirmative choice of classroom alias. Owner/teacher/platform admin roles
cannot be invited. Revoking an accepted invitation blocks future acceptance;
removing its enrolled member is a distinct owner action.

The old direct `create_project_invitation('class',...)` placeholder stays closed
with FEATURE_DISABLED; it never polymorphically treats a class UUID as a project.
The typed server class branch now calls the actual class-only RPCs.

## Root integration contract

Use exports in `src/lib/classes.functions.ts`. All accept `{ data: ... }` and
return `{ok:true,data:...}` or the strict class failure envelope. Server responses
are private/no-store and no-referrer. No SDK service credential is required.

| Export                             | Required data beyond classId                            | Result            |
| ---------------------------------- | ------------------------------------------------------- | ----------------- |
| createClass                        | requestId, document                                     | class summary     |
| updateClass                        | expectedRevision, requestId, document                   | class summary     |
| setClassArchived                   | expectedRevision, requestId, archived                   | class summary     |
| grantClassTeacher                  | expectedRevision, requestId, targetUserId, displayLabel | scoped membership |
| revokeClassTeacher / removeStudent | expectedRevision, requestId, membershipId               | scoped membership |
| leaveClass                         | expectedRevision, requestId                             | own membership    |
| saveAssignment                     | expectedRevision, requestId, assignmentId, document     | assignment        |
| associateClassProject              | expectedRevision, requestId, projectId                  | own association   |
| getClass                           | none                                                    | class detail      |
| listMyClasses                      | optional cursor; no classId                             | summary page      |
| listAssignments / listClassMembers | optional cursor                                         | scoped page       |

Class documents contain exactly name, mode (class/hackathon), instructions,
accessExpiresAt (zoned ISO instant), retentionDays (1–730). Assignment documents
contain title, instructions, dueAt (zoned instant or null), state
(draft/published/archived). AI is always false. Retention is a requested schedule;
do not promise automated guest deletion until PRV-003 is implemented and tested.

Class summaries omit owner/auth identifiers and contain id, name, mode,
instructions, accessExpiresAt, retentionDays, aiEnabled:false, archivedAt,
revision, role, updatedAt. Detail adds only the requesting member's enrollment
and, for students only, their own projectAssociation. Rosters contain membership
ID, classId, displayLabel, role, state, revision; no email, auth IDs, private notes
or associated project IDs. Owner grants use a self-shared recipient account ID;
there is no account search/email roster. Pages contain at most 50 items and
nextCursor; fetch each page explicitly.

Invitations use existing `createInvitation` with targetType:"class",
targetId:classId, recipientId, role:"student", requestId and optional
expiresInDays. New exports listClassInvitations and revokeClassInvitation use
classId and their strict typed inputs. `acceptInvitation` with targetType:"class"
requires token and displayLabel. No email/contact or external message is sent.

Root must integrate the shared public `/invite` route using
`takeScopedInvitationFragment` before auth/network operations. Supported forms:

- Project: `/invite#invite=<64 lowercase hex>`
- Class: `/invite#class-invite=<64 lowercase hex>`

The parser strips fragment and query immediately, including malformed input;
never accept query secrets, log tokens or store them in local/session storage.
Retain tokens only in current page memory. Sign-in elsewhere must instruct the
user to reopen the original private link. Keep route noindex/nofollow,
no-referrer and no-store. After fresh auth, mount ClassInvitationAcceptance
keyed by user ID plus current capability; on identity change unmount immediately
so pending receipt cannot report a prior user's acceptance. Callback returns
classId only. Do not automatically join on page load.

Mount ClassInvitationPanel only for a currently verified class owner, keyed by
user ID plus classId. The server and SQL independently recheck authority. The
panel supports one-time link copy, bounded owner listing and explicit revocation.
It explains that guest entry is unavailable. Owner teacher-grant/removal UI is
separate from this fixed-student invitation UI.

Class/teacher pages must remain reachable without RequireProject because a
teacher may have no owned idea. Scope query keys and component state by verified
user and class. Cancel/ignore stale reads and reset local drafts on either
identity change. Acknowledge save conflicts without dropping edits, refetch
actual current revision after success/replay and preserve retry request IDs for
unconfirmed writes. Do not infer submission access from enrollment/association.

Before exposing a new classroom learning activity, add its individual PDF
adapter and verified mount in export/coverage.ts. This task adds no new visible
learning activity or submission source, so does not claim activity export
coverage. Root owns teacher UI, invite route, generated DB types and routing;
CLS-008/EXP-003 own new guest activity and final portfolio export coverage.

## Verification

The SQL fixture suite checks closed tables and RPC authority under actual
roles, owner immutability, class isolation, student-only token acceptance,
co-teacher boundaries, retained authorship, CAS/idempotence, association consent,
private source denial, guest FK integrity, archive/expiry/removal, terminal
revision revocation and preservation of existing project work.

The exact-local `src/tests/cls-001/expiry-concurrency.mjs` rehearsal guards Docker
identity and port55322, starts two real independent connections, observes a valid
acceptance blocked on the class lock, waits across actual token expiry, then
verifies denial without enrollment, consumption or acceptance audit. It cleans
only newly created fictional fixtures and verifies absence; no capability flag
is changed. It accepts no configurable URL and never prints tokens/credentials.
