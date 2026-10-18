# Access and ownership contract

SEC-001 · 2026-10-17 · source baseline `f3c45253d837d486f8a8cec4e3b353eabf7acb5a`

This is the implementation contract for the planned workspace, class, sharing and design features. It does **not** claim those features or their safeguards are implemented. Start with [ProductSpec](../../ProductSpec.md), [the task registry](../roadmap/tasks.json) and the companion [API contract](api-contracts.md). The coordinator must incorporate these decisions into the roadmap and, when code changes, the spec and AGENTS conventions. No production schema or policy changes occur in SEC-001.

## 1. Current behavior and the first safe slice

The [initial migration](../../supabase/migrations/20261017000000_init.sql) defines exactly six tables. Every row has `id`, `user_id DEFAULT auth.uid()` and `created_at`; the five child tables have `project_id`. The `own rows` policy permits authenticated CRUD when `auth.uid() = user_id`. There is no application-row policy for anonymous users. The service role bypasses this boundary and is not a product role.

| Existing table | Current fields containing private content | Current ownership / integrity limit |
| --- | --- | --- |
| `projects` | `name`, `description`, `audience`, `problem`, `link`, `questions`, `survey`, `checklist`, `stage` | `user_id` is the owner; [useProject](../../src/lib/data.ts) selects their earliest row. No one-project uniqueness constraint |
| `contacts` | `first_name`, `relation`, `why`, `source`, `status`, `stage` | Row owner checked; project existence checked, not matching ownership |
| `interviews` | `answers` including question/note/quote, `tags`, `completed`, `contact_id` | Row owner checked; project/contact existence checked, not matching project/owner. Contact deletion sets `contact_id` to null |
| `learnings` | `title`, `body`, `data`, `accepted`, `kind`, `stage` | Can contain quoted interview content; acceptance is not permission to share |
| `experiments` | `hypothesis`, `change`, `result`, `stage` | Can contain private notes; no sharing scope |
| `outreach` | `title`, `body`, `kind`, `stage` | Can include names/quotes; generation does not publish or send it |

**Keep all six tables owner-private in the first shared release.** Do not broaden their `SELECT` policy to every project member or teacher. A row policy cannot safely redact the private columns of `projects`. Members receive an explicit project-summary projection and work in separate shared design tables. Reviewers receive intentional snapshots. This preserves existing privacy while allowing a useful small collaborative slice.

The current [AI handler](../../src/lib/ai.functions.ts) reads context using the caller's RLS client, but lacks runtime input/output validation and the planned consent, scope and budget checks. It is not evidence that the new authorization contract has passed.

## 2. Identity and scope decisions

1. **Authenticate the actor on the server.** Derive `actorId` from the verified Supabase session. Never accept `user_id`, owner, author, role, administrator status or institution from client-controlled metadata as authority.
2. **Preserve ownership.** On existing tables, `user_id` remains the immutable owner. Their `project_id` must reference a project with the same `user_id`; an interview's non-null contact must have that same owner and project. Reject changes to identity/scope columns after insert. The first slice has no ownership transfer.
3. **Owner is derived.** `projects.user_id` is the authoritative project owner. Store only `editor` / `viewer` grants in `project_members`; do not duplicate an `owner` grant that could drift. No membership operation may remove or demote the derived owner.
4. **A role applies to a resource.** Project editor of P1 is not editor of P2. Teacher of C1 is not teacher of C2. Platform admin is an additional operational role, not a grant to all product content. When roles overlap, evaluate each operation's required scope; do not choose a global highest role.
5. **Keep `user_id` and `project_id` on project content.** New design/revision/comment/snapshot/decision rows retain both. `user_id` identifies the immutable creator/author; `projects.user_id` identifies the container owner. A collaborator may author a shared design row in another owner's project only under an active editor grant. That explicit exception does not apply to legacy private tables.
6. **Name genuine non-project scopes.** Profiles/preferences are self-scoped; classes and assignments are class-scoped; platform roles/audits and platform budget aggregates are platform-scoped. They do not get a fake project id. Class submissions and links have both `class_id` and the actual `project_id`. The registry/migration owner must document each exception instead of making `project_id` arbitrarily nullable everywhere.
7. **Do not infer external permission.** Enrollment, project membership, an accepted learning or note-taking permission does not imply permission for AI processing or sharing. Unknown historical choices stay unknown. Explicit processing/share checks belong in PRV-001 and remain independent of access roles.

## 3. Eight-role permission matrix

`R` = read only the projection specified below; `W` = scoped write; `M` = manage grants/lifecycle; `Self` = the actor's own resource; `—` = deny. Recipient access requires an active relevant grant/membership. The author retains their own private snapshot/withdrawal history after ending recipient access, subject to the account-retention policy. Archive behavior is described in §7.

| Resource / operation | Anonymous | Project owner | Project editor | Project viewer | Student | Teacher | Unrelated signed-in user | Platform admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public landing, lessons, fictional demo | R | R | R | R | R | R | R | R |
| Own profile/preferences; create own project | — | Self W | Self W | Self W | Self W | Self W | Self W | Self W |
| Private project details and six legacy tables | — | R/W/M for own project | — | — | Only if also that project's owner | Only if also that project's owner | — | — |
| Member project summary | — | R | R | R | Only with project grant | Only with project grant | — | Only with project grant |
| Project membership grants / invitations | — | M | — | — | — | — | — | — |
| Shared design document + permitted history | — | R/W/M | R/W | R | Only with project grant | Only with project grant | — | Only with project grant |
| Design comments | — | R/W; moderate | R/W own; resolve permitted threads | R | Only with matching project role | Only with matching project role | — | Only with matching project role |
| Own class enrollment / project association | — | Only if student in class | Only if student in class | Only if student in class | Self R/W; associate own project only | R as teacher for scoped enrollment metadata | — | — |
| Class/assignment administration | — | — | — | — | R published instructions | R/W for own classes; membership M only class owner | — | — |
| Class roster and milestone projection | — | — | — | — | Self R | R for active class | — | — |
| Submitted snapshot | — | Self R/W if enrolled submitter | — | — | Self create/read/withdraw | R active submitted versions in class | — | — |
| Teacher feedback | — | R if submitter | — | — | R on own active submission | R in class; W own feedback | — | — |
| Operational aggregate dashboard | — | — | — | — | — | — | — | R fixed aggregate projection |
| Platform role administration | — | — | — | — | — | — | — | No client path; protected operator procedure |
| Public/named shared snapshot | Explicit active bearer grant only | Own or explicit grant | Explicit grant only | Explicit grant only | Explicit grant only | Explicit grant only | Explicit grant only | Explicit grant only |

The last row is a capability exception, not public access to the underlying tables. A named grant also requires its intended authenticated recipient. There is no general anonymous `SELECT` policy on shares, snapshots or interview tables.

### Exactly which fields cross each boundary

| Projection | Allowed response fields | Explicitly excluded |
| --- | --- | --- |
| `ProjectSummary` for members | `id`, owner-approved `name`, `role`, `archivedAt`, `updatedAt`, `membershipRevision` | Description, audience, problem, link, questions, survey, checklist, private counts/content and contact identities |
| `ClassRosterEntry` | Class/enrollment ids; enrolled user's chosen display label; enrollment state; assignment ids; submission state/time; coarse assignment milestone counts whose visibility was disclosed | Email/phone, all other projects/classes, contact names, questions/notes/quotes, private draft text, private AI usage/cost |
| `SubmissionView` | Submission/assignment/class ids; submitter's class label; version; submitted time; reviewed snapshot payload; teacher feedback | Raw source row ids, private source URLs, current live notes, source lookup capability and unrelated private project fields |
| `DesignDocumentView` | Project/document ids; title; shared body; revision/time; author display label; comments/history permitted by current membership | Joined private interviews, hidden prompt context, member emails, unapproved raw evidence |
| `SharedSnapshotView` | Frozen owner-reviewed title, selected/redacted excerpts, decision/reflection and source labels explicitly cleared in preview; snapshot version | Owner email/id, raw source ids, underlying private resources, live future edits, unselected attachments |
| `AdminAggregateView` | Fixed time window/grain; metric definitions; eligible counts; grouped actual AI usage/cost; freshness; data-quality flags | Individual users' activity trails, student names, project names/ids, text, quotes, prompts, class rosters or arbitrary filters/SQL |

Choosing a class display label is not permission to publish it on a public page. Endpoints use these named allowlists; never serialize a database row with `select('*')` across a role boundary. Excluded fields stay excluded even if the client requests them.

## 4. Planned schema responsibilities

Names below reserve a consistent vocabulary for dependent tasks; no table in this section is claimed to exist. Migration files and generated types are integrated serially by the coordinator.

| Scope / proposed relation | Identity and access contract | Owner task |
| --- | --- | --- |
| `profiles`, `user_preferences` | `user_id` is the subject and immutable key; own values only. A preferred project id is re-authorized on every use; it is not a grant | WS-001/002 |
| `project_members` | Unique `(project_id, user_id)`; subject user, role editor/viewer, active/revoked state, immutable `created_by`, revision. Only project owner manages; member reads own safe membership | SEC-004 |
| `invitations` | Issuer `user_id`, typed target project or class, role fixed by target, token hash, intended recipient user id where bound, expiry/revocation/acceptance. Never readable as a token table by invitees | SEC-005, CLS-001 |
| `platform_admins`, `admin_audit` | Admin subject role issued by protected operator; immutable grant history. Audit actor, enum operation, resource identifiers, timestamp and safe outcome; no content payload | SEC-006 |
| `interview_drafts` | Owner `user_id` + matching project/contact; answers, revision, save state, finalized interview id. Private; finalization at most once per draft | WS-004/006 |
| Consent records | Private owner/project/subject-record scope, purpose, granted/declined/unknown/withdrawn, policy version and time. Historical records are never auto-granted | PRV-001 |
| `classes`, `class_members`, `assignments` | Class creator `classes.user_id` is immutable and remains class owner; class has lifecycle/revision and disclosed recipient `access_expires_at`; class membership subject `user_id`, role student/teacher, active state and immutable grantor; assignment `user_id` is teacher author | CLS-001 |
| `class_project_links` | Unique active `(class_id, user_id)` link to a project that this enrolled student owns. Explicit confirmation; switching link never links other projects or publishes private content | CLS-001 |
| `class_submissions` | Student `user_id`, actual project, class, assignment, immutable snapshot versions, submission/withdrawal state and revision. Derive class/project from authorized association, not trusting a mismatched request | CLS-002 |
| `submission_feedback` | Teacher author `user_id`, derived class/project/submission ids, versioned feedback; original author immutable | CLS-003 |
| Product events and AI usage | Trusted actor `user_id`, authorized project or explicit class/platform scope; enum event and allowlisted properties. Ledger costs written only by trusted budget operations | AN-002, AI-004 |
| Decisions, experiments and commitments | Owner-private project records unless copied into an intentional snapshot; retain evidence revision links and reported/observed distinctions | EV-002/004 |
| Evidence snapshots and share grants | Owner `user_id`, project, immutable selected payload; grants bind snapshot version, audience, permission read, expiry and revocation. Never a dynamic view into all notes | SHR-001/002 |
| Design documents/revisions/comments | Immutable author `user_id` + project; active owner/editor writes, viewer reads; all design content is explicitly shared in that project. Revisions append; comments have author and edit revisions | COL-001/003 |

For subject tables (`project_members`, `class_members`, `platform_admins`), `user_id` is the grantee, not the granting actor. Store `created_by` separately and enforce both identities; do not copy the legacy `auth.uid() = user_id` write policy onto these tables.

## 5. Role changes, invitations and private evidence

**Project membership:** the owner grants editor/viewer and can downgrade/revoke. An editor can edit shared designs, not change ownership, invitations, private project settings or consent. A viewer cannot comment in the first slice. A removed author loses access to current and historical shared content; authorship attribution remains. Content creation never grants membership.

**Classes:** an authenticated user may create a class they own; this creates authority only for that new class, not a verified institutional designation. The class owner may explicitly grant/revoke a co-teacher through a protected operation. Ordinary teachers manage assignments and feedback but cannot grant teaching authority. Class enrollment invitations always grant `student`, never `teacher` or platform admin. A teacher is not automatically a project member. The class owner cannot remove their own final authority; archive the class instead. Ownership transfer is outside this slice.

**Invitation order:** SEC-005 first implements project invitations and a target discriminator. Class invites return `FEATURE_DISABLED` until CLS-001 adds the class relations, scope checks and atomic student-enrollment branch. Do not create a polymorphic foreign key that validates only a UUID's existence in any table. Validate the correct target transactionally. Tokens are high-entropy, stored hashed, expire (default seven days, maximum thirty), and are revoked on issuer authority loss. Invite creation/acceptance is idempotent, with one token bound to one accepting actor. Wrong recipient, expired, revoked and replayed-by-another-user tokens fail. The initial client only offers a copyable link; it sends no email automatically.

**Snapshots:** a student/owner reviews exactly what leaves private space. Preview is not a grant. Confirmation freezes the selected payload and source revisions; later private edits do not appear automatically. Teachers receive only active submitted versions in their active class. Withdrawal, membership removal, class closure/expiry or grant revocation stops future recipient/teacher reads, previews, AI use and exports. The author retains private access to their own snapshot and withdrawal record; this does not restore any recipient grant. Already viewed/downloaded copies cannot be remotely erased; explain that limit before sharing. Implement server access revocation, not a misleading promise of recall.

**Shared design evidence:** owner-reviewed excerpt references point to an active approved snapshot, never raw interviews. Recheck snapshot and membership permission on each render/export/AI request, including history; a revoked reference renders a tombstone. Do not embed an inaccessible source's full text into a history response. Arbitrary text deliberately typed into a shared document is shared content; make the audience visible before editing. Do not auto-import private notes behind the user's back.

**Public link:** only an explicit bearer share can be anonymous. Hash tokens, bind one immutable snapshot version, default seven-day expiry (maximum thirty), rate-limit resolution, return a generic missing/expired response and allow immediate revocation. Named shares require the exact recipient user id plus authentication. Token-bearing responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and no indexing; redact tokens from access/analytics logs. Do not expose a token list or private source ids to recipients.

## 6. Enforcement pattern and admin boundary

Authenticated single-owner CRUD may continue through the existing session-scoped Supabase client after SEC-003 closes ownership gaps. Cross-role projections, role grants, snapshots, atomic saves and aggregate queries use narrow server functions/RPCs with runtime schemas. API and database enforcement must agree; UI hiding is insufficient.

Policy helpers should answer one question such as current actor's active project role. If a helper must read a membership table protected by a policy that calls the helper, use a narrowly audited `SECURITY DEFINER` function to avoid recursive RLS. Fix `search_path` to an empty/controlled value, fully qualify relations, remove `PUBLIC` execution, grant only intended roles, disallow caller-supplied actor ids and dynamic SQL, and return only the boolean/role or explicit projection needed. Avoid security-definer views/functions that return all underlying columns. Protect identity columns and consistency in the database, not only in TypeScript.

Use a dedicated narrowly privileged owner for helpers where feasible; never expose a generic service-role query endpoint. The existing [server admin client](../../src/integrations/supabase/client.server.ts) is not a shortcut around scope checks. Test direct SQL/RPC attacks as well as route-level checks.

**Platform admin bootstrap:** an operator executes a reviewed migration/command against an explicitly verified Supabase user UUID and intended environment. There is no public signup flag, hardcoded email match, user-editable JWT metadata, “first user is admin” rule or client-side role setter. No public API grants/revokes platform-admin roles. The operator records bootstrap/revocation in append-only audit data. Every privileged request checks the current grant in the database; a stale JWT is not continuing authorization.

**Admin analytics:** allow only fixed dimensions (time grain, approved event/kind/model grouping), bounded windows and aggregate projections. Suppress behavioral/cohort breakdowns with fewer than five distinct eligible users; use fixed bucket boundaries and prohibit arbitrary intersecting identity filters to reduce differencing. Return `suppressed`/`insufficient_data`, not a zero that implies no activity. Exact platform-wide AI spend/reservation totals may be displayed for budget operation without per-person attribution. Admin-summary AI receives only the already-authorized aggregate DTO, never raw event or content tables. These are initial product privacy choices, not a claim of formal anonymization.

## 7. Concurrency, revocation and lifecycle

- Mutable resources have a server-incremented integer `revision`; updates require `expectedRevision`. Zero matching authorized rows is a conflict or generic unavailable result, never a silent overwrite. Read the current authorized revision before offering merge/replace. Keep actor, created time and container ids immutable.
- Mutations with retry risk take an idempotency key, scoped to actor + operation + resource. Store a request hash and result; the same key/payload returns the existing result after current authorization is rechecked, a changed payload returns `IDEMPOTENCY_CONFLICT`. Never return a cached private response to a revoked actor.
- Finalizing a draft is one transaction: lock authorized draft, enforce expected revision and current consent, create one interview, update its matching contact, mark finalized and record the event. A permanent unique draft-to-interview association prevents duplicates even after request-journal expiry. Remote AI calls are not part of that database transaction or assumed exactly-once.
- Project archive is owner-only, preserves content and permits authorized reads; ordinary writes/generation/invite acceptance/new snapshots stop until owner restores it. Privacy withdrawal/revocation/export remain available. Archived classes stop enrollment, new submissions and AI; existing authorized submitted work follows disclosed read-access expiry. Deletion remains PRV-002's explicit policy/confirmation flow.
- Removing membership revokes future reads, writes, downloads, subscription channels and AI context immediately at the server. Acknowledged durable writes remain stored. An offline/stale editor cannot commit using a role they formerly held. Realtime, if enabled later, must reauthorize subscription and write paths and disconnect revoked members.
- Account deletion must address owned shared containers before deleting the owner identity. Do not cascade-delete another user's project through membership. No ownership transfer shortcut is assumed; PRV-002 must either safely archive/delete the user's owned containers or require an explicit future transfer operation. Exports omit other users' private records and inaccessible shared history.
- Client query keys include authenticated user + project/class/document scope. Switching account/project cancels in-flight UI application and clears inaccessible cached data; cached identity or a remembered project id never authorizes a request.

## 8. Additive migration and verification handoff

1. **SEC-002:** create a disposable database fixture with owner A/B, an editor, viewer, student, teacher, unrelated account and admin. Preserve a fixture demonstrating existing cross-owner/project links; never use production participant data.
2. **SEC-003:** inspect and report legacy inconsistencies before enforcing constraints. Add supporting composite uniqueness/foreign keys or equivalent database checks; project links must match owner, and contact links must match owner/project. For contact deletion preserve the existing ability to null only `contact_id`, not required owner/project columns. Quarantine/remediate anomalous rows with operator review; do not delete or change ownership silently. Validate constraints after remediation.
3. **SEC-004/005/006:** add memberships/helpers/invitations/admin roles with no change to private legacy table access. Backfill derived owners from existing `projects.user_id`; no synthetic collaborator/admin grants. Class target stays disabled until CLS-001.
4. **WS/PRV:** add lifecycle/revisions/drafts and consent-compatible reads. Existing consent remains unknown. Switch routes/caches to explicit authorized project selection before enabling multi-project UI. Backfill revision/lifecycle metadata without fabricating saved drafts, event history or participant permissions.
5. **CLS/SHR/COL:** add class and shared-content tables, then projections and UI. Add class invite constraints and acceptance branch together. Create snapshots only through reviewed publication; never backfill all notes as submitted/shared. Update AGENTS/spec conventions only when the matching migration and code are integrated.
6. **Release:** regenerate types through the coordinator, run fresh/legacy-data migration and real RLS tests, deploy compatible code with server flags off, verify preview and revoke/failure scenarios, then enable only passing surfaces. Use additive corrective migrations and ordinary revert/fix commits. Never reset production or rewrite Lovable history.

Required denial cases include forged owner/project/contact ids; cross-project references under the same owner; editor access to private tables; viewer writes; self-promotion; class join granting teacher/admin; cross-class teacher reads; teacher/admin AI requesting raw notes; stale membership and archived resources; withdrawn snapshots through history/export; wrong-recipient/replayed invites; missing consent; simultaneous expected revisions; duplicate finalization; small-cohort aggregate leakage; and direct RPC calls bypassing hidden UI. Test each with its real identity, not a mocked “authorized” boolean.

## 9. Demonstration boundary and decisions made

For the academic demonstration, a fictional public demo can show the intended loop without enabling these planned roles or incurring AI cost. Label fixtures and unreleased screens accurately. A live class/shared workflow may be demonstrated only after its actual identity, persistence and policy checks pass; do not remove checks to meet a presentation deadline.

Decisions made here: legacy content stays private; members get a minimal project summary and separate shared design space; teacher access is submitted snapshots plus disclosed milestones; class roles and project roles are independent; platform admin sees aggregates only; owner/author identity is immutable; class invites grant student only; stale writes conflict; publication uses revocable snapshots. These are implementation choices, not observed founder demand, teaching efficacy or a validated buyer claim.

Next eligible contract consumers: SEC-002 (policy harness) and downstream AI/WS authors. They should reference this file's projection names and negative cases, report any required deviation, and have the coordinator update both contracts before implementing conflicting semantics.

## 12. New account-free class/hackathon direction (2026-10-18)

The owner now requires teachers to provision private spaces students can join without creating a personal account, plus PDF export of every activity/team. The [guest and export contract](../privacy/guest-data-contract.md) adds an explicit class-scoped guest principal/capability model; it does not expand Anonymous in the existing matrix into raw table access. Public class entry and private team/return capabilities are separate. Existing account-project `user_id`/`project_id` ownership stays intact. New genuine class/team/session relations must document their principal exceptions, use immutable teacher issuer/guest author identity and recheck scope at every operation. Teacher access remains limited to disclosed class projections and intentional submitted snapshots; PDFs follow the same authorized audience. FERPA-first is the design/operating commitment, with institutional review recorded separately under FERPA-002.
