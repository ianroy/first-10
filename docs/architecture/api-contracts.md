# Scoped service API contract

SEC-001 · 2026-10-17 · source baseline `f3c45253d837d486f8a8cec4e3b353eabf7acb5a`

Read [the access contract](access-contract.md) first. This document fixes names, scopes and response boundaries for dependent agents. It specifies **planned** operations, not endpoints already deployed. Keep [the current four AI kinds](../../src/lib/ai.functions.ts) and authenticated owner CRUD compatible while introducing the new operations. These are TypeScript/TanStack server-function contracts, not a request to introduce a second REST framework.

## 1. Shared request rules

- Authenticate using [requireSupabaseAuth](../../src/integrations/supabase/auth-middleware.ts); use its verified session identity. On every server call, resolve current database permissions. Client role flags, actor ids, route guards and remembered project ids are not authority.
- Validate all inputs at runtime with strict schemas: UUIDs, enum values, finite numbers, UTC dates, text/array sizes and unknown-key rejection. Bound pagination to 50 items and administrative windows to 31 days per request. Reject arbitrary relation names, SQL, filter expressions or requested column lists.
- Existing owner-only reads/writes may use the caller's Supabase client after ownership constraints pass. Cross-role operations use narrow RPCs/projections described here; do not load a private row with the service role and redact it opportunistically in the browser.
- Default errors: unauthenticated `AUTH_REQUIRED`; invalid input `INVALID_INPUT`; inaccessible/unknown resource `NOT_FOUND`; known permitted operation disallowed by state `FORBIDDEN`, `ARCHIVED` or `FEATURE_DISABLED`. Do not reveal whether another user's id exists. Return `REVISION_CONFLICT` only after establishing access to that resource.
- New mutations return the shared result envelope below. Legacy calls may use an adapter to preserve their current success/error shape while callers migrate together. Never change all existing return shapes incidentally in a single dependency task.
- `requestId` is a UUID generated per user intent, reused on retry. Store actor + operation + target + key + canonical payload hash + result in an operation journal for at least seven days. Recheck current authorization before replay. Different payload with the same key returns `IDEMPOTENCY_CONFLICT`. Durable entity constraints also prevent duplicate finalization/invite acceptance after journal expiry.
- Updates use `expectedRevision`; create uses a unique idempotency key. Server mutation, revision increment, required audit/event insert and idempotency result commit atomically. Never acknowledge “saved” before commit. An event/outbox must not include notes or provider payloads.
- Sanitize rendering of user text, including sample-like content, as untrusted text. Rich text uses an allowlisted schema; no stored script/HTML execution. Private/capability responses are `no-store` and tokens/notes stay out of logs.

## 2. Types and complete request examples

This block is self-contained TypeScript for contract checking. `UUID`/`Instant` are illustrative aliases; runtime validators, not these aliases, enforce their formats. Resource ids in the examples are fictional test identifiers.

```ts
type UUID = string;
type Instant = string;
type Revision = number;
type ProjectRole = "owner" | "editor" | "viewer";
type ErrorCode =
  | "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN"
  | "FEATURE_DISABLED" | "ARCHIVED" | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT" | "CONSENT_REQUIRED" | "BUDGET_EXCEEDED"
  | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "INVALID_GENERATION";
type ServiceResult<T> =
  | { ok: true; data: T; requestId: UUID }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean;
      currentRevision?: Revision }; requestId: UUID };
type Mutation = { requestId: UUID };
type VersionedMutation = Mutation & { expectedRevision: Revision };
type ProjectScope = { projectId: UUID };
type Page<T> = { items: T[]; nextCursor: string | null };

type ProjectSummary = {
  id: UUID; name: string; role: ProjectRole; archivedAt: Instant | null;
  updatedAt: Instant; membershipRevision: Revision;
};
type Answer = { q: string; note: string; quote: string };
type DraftView = {
  id: UUID; projectId: UUID; contactId: UUID | null; answers: Answer[];
  tags: string[]; revision: Revision; updatedAt: Instant;
  finalizedInterviewId: UUID | null;
};
type SaveDraftInput = ProjectScope & VersionedMutation & {
  draftId: UUID; answers: Answer[]; tags: string[];
};
type FinalizeDraftInput = ProjectScope & VersionedMutation & {
  draftId: UUID;
};
type FinalizeDraftResult = {
  draftId: UUID; interviewId: UUID; draftRevision: Revision;
  completedAt: Instant; alreadyFinalized: boolean;
};
type SourceRef = {
  kind: "interview" | "learning" | "experiment" | "decision";
  id: UUID; revision: Revision;
}; // Owner-only request/provenance: never exposed to a snapshot recipient.
type SnapshotPayload = {
  title: string;
  excerpts: { label: string; text: string; observationType: "reported" | "observed" }[];
  interpretation: string; uncertainty: string; decision: string; nextAction: string;
};
type SubmissionPreviewInput = ProjectScope & {
  classId: UUID; assignmentId: UUID; sources: SourceRef[];
  proposedPayload: SnapshotPayload;
};
type SubmissionPreview = {
  previewHash: string; sourceVersions: SourceRef[]; payload: SnapshotPayload;
  teacherVisibleFields: string[]; expiresAt: Instant;
};
type SubmitSnapshotInput = ProjectScope & Mutation & {
  classId: UUID; assignmentId: UUID; previewHash: string;
}; // Server rechecks sources, permission and unchanged canonical preview.
type SubmissionView = {
  id: UUID; classId: UUID; assignmentId: UUID; submitterLabel: string;
  version: Revision; submittedAt: Instant; payload: SnapshotPayload;
};
type ClassRosterEntry = {
  enrollmentId: UUID; classId: UUID; displayLabel: string;
  state: "active" | "left" | "removed";
  milestones: { assignmentId: UUID; status: "not_submitted" | "submitted" | "withdrawn";
    submittedAt: Instant | null; completedStepCount: number | null }[];
};
type InvitationTarget =
  | { type: "project"; projectId: UUID; role: "editor" | "viewer" }
  | { type: "class"; classId: UUID; role: "student" };
type CreateInviteInput = Mutation & {
  target: InvitationTarget; recipientUserId: UUID | null; expiresAt: Instant;
};
type ShareAudience =
  | { type: "named"; recipientUserId: UUID }
  | { type: "bearer" };
type CreateShareInput = ProjectScope & Mutation & {
  snapshotId: UUID; snapshotVersion: Revision; audience: ShareAudience;
  expiresAt: Instant;
};
type DesignBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "approved_excerpt"; snapshotId: UUID; snapshotVersion: Revision;
      excerptIndex: number }; // Resolved only after a fresh access check.
type DesignDocumentView = {
  id: UUID; projectId: UUID; title: string; blocks: DesignBlock[];
  revision: Revision; updatedAt: Instant; authorLabel: string;
};
type SaveDesignInput = ProjectScope & VersionedMutation & {
  documentId: UUID; title: string; blocks: DesignBlock[];
};
type AggregateQuery = {
  from: Instant; to: Instant; grain: "day" | "week";
  group: "funnel" | "ai_kind" | "model";
};
type AdminAggregateView = {
  from: Instant; to: Instant; updatedAt: Instant;
  rows: { bucket: string; metric: string; value: number | null;
    state: "available" | "suppressed" | "insufficient_data" }[];
  qualityFlags: string[];
};
type ProjectAIKind = "questions" | "synthesis" | "stage2" | "stage3";
type AIRequest =
  | (ProjectScope & Mutation & { kind: ProjectAIKind })
  | (ProjectScope & Mutation & { kind: "challenge"; decisionId: UUID; expectedRevision: Revision })
  | (ProjectScope & Mutation & { kind: "question_rewrite" | "outreach_rewrite"; selectedText: string })
  | (Mutation & { kind: "lesson_draft"; classId: UUID; resourceVersionIds: UUID[];
      teachingBrief: string })
  | (Mutation & { kind: "teacher_feedback_draft"; classId: UUID; submissionId: UUID;
      submissionVersion: Revision; rubricVersionId: UUID })
  | (Mutation & { kind: "admin_summary"; query: AggregateQuery })
  | (ProjectScope & Mutation & { kind: "design_assist"; documentId: UUID;
      expectedRevision: Revision; instruction: string });

const exampleDraftSave: SaveDraftInput = {
  projectId: "00000000-0000-4000-8000-000000000001",
  draftId: "00000000-0000-4000-8000-000000000002",
  requestId: "00000000-0000-4000-8000-000000000003", expectedRevision: 4,
  answers: [{ q: "What happened last time?", note: "Fictional practice note.", quote: "" }],
  tags: [],
};
const exampleClassInvite: CreateInviteInput = {
  requestId: "00000000-0000-4000-8000-000000000004",
  target: { type: "class", classId: "00000000-0000-4000-8000-000000000005", role: "student" },
  recipientUserId: null, expiresAt: "2026-10-24T18:00:00Z",
};
const exampleTeacherDraft: AIRequest = {
  kind: "teacher_feedback_draft", requestId: "00000000-0000-4000-8000-000000000006",
  classId: "00000000-0000-4000-8000-000000000005",
  submissionId: "00000000-0000-4000-8000-000000000007", submissionVersion: 1,
  rubricVersionId: "00000000-0000-4000-8000-000000000008",
};
```

Do not add `role`, `actorId`, `serviceRole`, `ownerId`, `includePrivateNotes` or arbitrary raw context to any request. Runtime validation must reject these keys. Plain UUIDs in a request establish identity of a target, not access to it.

## 3. Operation inventory and file ownership

These are exported operation names to implement inside the named modules already assigned by the registry. The UI can wrap them in hooks, but must not create competing authorization paths. All operations inherit §1 validation and the access contract's field projections. Read operations require no idempotency key unless they create a stored preview; every write does.

| File / task | Operations and input scope | Required authority / returned fields |
| --- | --- | --- |
| `src/lib/data.ts`, `project-lifecycle.ts` · WS-001/002 | `listProjects({cursor?})`, `getProjectSummary({projectId})`; `createProject({requestId,name,...ownerFields})`; `updateProject({projectId,expectedRevision,requestId,patch})`; `archiveProject` / `restoreProject` | Authenticated users create only their own project; only owner modifies/archives. Owner gets private detail through owner API; members receive `ProjectSummary` only. No cross-project bulk `select('*')` |
| `src/lib/project-context.tsx` · WS-002 | `selectProject({projectId})`, account/project cache lifecycle | Client selection calls authorized summary first; no authority or content is derived from local storage. Query keys include actor and scope |
| `src/lib/membership.functions.ts` · SEC-004 | `listProjectMembers({projectId})`; `setProjectMember({projectId,targetUserId,role,expectedRevision,requestId})`; `revokeProjectMember(...)` | Owner manages; member reads their own grant only. Minimal labels/roles, never emails. No owner grant/edit. Revoked/member-stale roles fail. Grant only to an existing explicitly identified user; no broad account search |
| `src/lib/invitations.functions.ts` · SEC-005 / CLS-001 | `createInvitation(CreateInviteInput)`; `acceptInvitation({token,requestId})`; `revokeInvitation({invitationId,expectedRevision,requestId})` | Project owner/class owner issues; authenticated intended recipient or one accepting actor for unbound invite accepts. Return token/link only at creation, and scoped membership summary at acceptance; no raw stored hash. Class branch disabled before CLS-001 |
| `src/lib/admin-auth.server.ts`, `admin-audit.server.ts` · SEC-006 | `requirePlatformAdmin(context)`; internal `appendAdminAudit(transaction,event)` | Internal functions only; current protected role table checked. No public admin grant endpoint. Audit safe enum/id metadata, no notes or tokens |
| `src/lib/interview-drafts.functions.ts` · WS-004/006 | `createInterviewDraft({projectId,contactId?,requestId})`; `getInterviewDraft({projectId,draftId})`; `saveInterviewDraft(SaveDraftInput)`; `finalizeInterviewDraft(FinalizeDraftInput)` | Project owner only. Derive row owner; validate matching project/contact. Return `DraftView` or `FinalizeDraftResult`. Snapshot edits never mutate a finalized interview by reusing this path |
| `src/lib/consent.ts` plus PRV-001 protected persistence | `recordConsent({projectId,subjectRef,purpose,choice,policyVersion,expectedRevision,requestId})`; `getConsentChoices({projectId,subjectRef})` | Owner records actual choice; server records actor/time/version. The UI helper is not an authorization boundary. Never accept client timestamps or inferred historical permission; no teacher/member visibility |
| `src/lib/account.functions.ts` · PRV-002 | `exportAccountData({requestId})`; `previewAccountDeletion({})`; `confirmAccountDeletion({previewId,confirmation,requestId})` | Current authenticated self only; recent authentication required for deletion. Export own private plus currently authorized authored/shared data, excluding others' private content. Confirmation bound to actor, resource inventory/version and expiry |
| `src/lib/classes.functions.ts` · CLS-001 | `createClass({name,requestId})`; `listMyClasses({cursor?})`; `updateClass` / `archiveClass`; `createAssignment` / `updateAssignment`; `associateClassProject({classId,projectId,expectedRevision,requestId})`; `leaveClass` / `removeStudent`; `grantClassTeacher` / `revokeClassTeacher` | Authenticated user creates own class; active teachers manage assignments. Only immutable class owner manages teacher grants/removes students. Student associates only their own project while enrolled. Class invite grants student only. Every mutation names class and target ids, expected revision where existing |
| `src/lib/submissions.functions.ts` · CLS-002 | `previewSubmission(SubmissionPreviewInput)`; `submitSnapshot(SubmitSnapshotInput)`; `listMySubmissions({classId,assignmentId?})`; `withdrawSubmission({classId,submissionId,expectedRevision,requestId})` | Active enrolled owner of associated project creates/submits; original author may withdraw even after class removal. Derive class/assignment/project relation. Preview returns owner-only `SubmissionPreview`; teacher response uses `SubmissionView`, never owner source refs |
| `src/lib/teacher.functions.ts` · CLS-003 | `getClassRoster({classId,cursor?})`; `getClassProgress({classId,assignmentId?})`; `getSubmission({classId,submissionId,version})`; `saveTeacherFeedback({classId,submissionId,expectedRevision,requestId,body})` | Active teacher of that class. Safe roster/progress and active snapshot fields only. Feedback author is current teacher, not request input. Read submitted versions only; no draft-source query |
| `src/lib/events.server.ts`, `analytics.ts` · AN-002 | Internal `recordVerifiedEvent(...)`; allowlisted client `recordIntentEvent({name,scope,requestId,properties})` | Server assigns actor/time and validates scope. Client-reported intent is distinct from verified saved/finalized/submitted activity. No client event can mint completion, cost or membership. No general event listing for users |
| `src/lib/admin-metrics.functions.ts` · ADM-001 | `getAdminAggregates(AggregateQuery)` | Current platform admin only; returns `AdminAggregateView` after fixed bucket/suppression policy. No raw SQL, per-user drilldown or content export |
| `src/lib/generation-history.functions.ts` · EV-001 | `listGenerationHistory({projectId,kind,cursor?})`; `getGenerationVersion`; `selectGenerationVersion({projectId,generationId,expectedRevision,requestId})` | Owner only for legacy private content. Revision switch and accepted state are explicit; no automatic replacement after provider failure |
| `src/lib/decisions.functions.ts`, `commitments.functions.ts` · EV-002/004 | `listDecisions` / `getDecision`; `saveDecision`; `saveExperimentOutcome`; `saveCommitment`; each project-scoped, with request/revision on writes | Owner-private rows only; referenced evidence must share owner/project and allowed source revision. Return observation/interpretation/unknowns and action state explicitly; no authenticity score |
| `src/lib/evidence-pack.functions.ts` · SHR-001 | `previewEvidencePack({projectId,sources,proposedPayload})`; `publishEvidenceSnapshot({projectId,previewHash,requestId})`; `withdrawEvidenceSnapshot({projectId,snapshotId,expectedRevision,requestId})` | Project owner only. Current source/permission checks and explicit reviewed snapshot. Publishing a snapshot does not automatically create a public grant |
| `src/lib/shares.functions.ts` · SHR-002 | `createShare(CreateShareInput)`; `resolveShare({token})`; `revokeShare({projectId,shareId,expectedRevision,requestId})` | Owner issues/revokes. Resolution requires matching active named/bearer grant and active snapshot; named needs exact authenticated recipient. Return only `SharedSnapshotView`, not the grant table or raw source refs |
| `src/lib/design-space.functions.ts` · COL-001/002 | `listDesignDocuments({projectId,cursor?})`; `getDesignDocument({projectId,documentId,revision?})`; `createDesignDocument`; `saveDesignDocument(SaveDesignInput)`; `archiveDesignDocument` | Active owner/editor writes; viewer reads. Explicit shared body/revisions only; snapshot references rechecked. Owner may archive; no private-legacy join |
| `src/lib/design-comments.functions.ts` · COL-003 | `listDesignComments({projectId,documentId,cursor?})`; `createDesignComment`; `editDesignComment`; `resolveDesignThread`; `moderateDesignComment` | Owner/editor creates; author with current editor access edits own comment; owner/editor resolves threads; owner moderates with audit/tombstone rather than impersonating author. Viewer read only |
| `src/lib/ai.functions.ts` · all AI tasks | `generateAI(AIRequest)` | Single model gateway, explicit kind-specific access and budgets in §5. No permission check or grade is decided by model output |

Existing owner-only contacts/interviews/learnings/experiments/outreach CRUD stays within its present modules while hardening. It must enforce the access contract, expected revisions when introduced, and preserve immutable scope; this inventory does not require a gratuitous rewrite of every simple CRUD call into a server function.

### Concrete field and size limits for the initial slice

Set server constants and mirror helpful UI limits; a client limit is not enforcement. Initial ceilings: names/titles 120 characters; project description/audience/problem 4,000 each; one answer note 8,000 and quote 4,000; at most 30 questions/answers; at most 20 allowed tags; teacher feedback 12,000; snapshot payload 32,000 serialized characters and 30 excerpts; design document 100,000 serialized characters with at most 300 allowlisted blocks; selected rewrite text 8,000. Validate existing imported records separately; do not silently truncate or destroy legacy data. AI input/output token budgets can be smaller and must disclose omissions. Changing a ceiling requires boundary fixtures and a documented reason, not new user approval for ordinary engineering.

## 4. Atomic operation details

### Draft save and finalization

`saveInterviewDraft` checks project owner, active project, matching draft/contact and expected revision in one transaction. It replaces the current draft body only after validation and increments revision once. Return the stored revision/time. A conflict returns no other user's content; keep local unsaved work available for a deliberate merge. Never call the saved UI state “synced” because a timer fired.

`finalizeInterviewDraft` first looks for an already finalized mapping under current actor authorization. Matching retry returns its existing interview id; a different requested body cannot be smuggled through because finalization takes no new answers. For a new finalization, lock draft, check revision and required note consent, insert interview from saved answers, update only its matching contact status, record verified event and set the permanent finalized mapping in the same transaction. AI permission is not required just to save manual notes. Run simultaneous finalization and failed-contact-update tests; partial finalization must roll back.

### Preview, publish and withdraw

Server preview validates each source's actor/project/version, sharing choice and selected/redacted payload. Store a short-lived private preview or a server-authenticated digest covering actor, audience, exact payload, source revisions and expiry; a client hash alone is not approval. On confirmation recompute/check the preview and current source/consent/membership. A source changed since preview yields a conflict requiring review, not silent substitution. Snapshot content is immutable; a revision creates a new version, never changes what an earlier recipient reviewed.

Student submissions and public/named evidence shares use different grants. An enrollment or submitted assignment does not create a public URL. Teacher access applies only to active enrollment/class authority and submitted, unwithdrawn versions. Withdrawal is author-owned and remains callable when an ordinary class read is revoked; the endpoint returns only its own confirmation, not others' class content. Authors retain private read/export of their own submitted snapshots and withdrawal history, but cannot use that to restore a teacher/recipient grant. Recipient shared-excerpt references, exports and AI must respect the revoked source at read time, including history views. Previously downloaded copies cannot be recalled.

### Invitation and role transaction

Invitation creation validates the issuer's current scope and allowed target role. Store a hash, never a clear token in a list response. Acceptance locks the invitation, checks expiry/revocation/recipient, checks issuer still has authority and target exists/accepts enrollment, then inserts exactly one membership and acceptance record. Racing acceptances cannot grant multiple users or a higher role. A member already holding a stronger role is not silently downgraded by an older invite. Revoked/archived targets deny acceptance. All class-target requests return `FEATURE_DISABLED` until class schema, constraints and tests land together in CLS-001.

Role updates are compare-and-swap operations on membership revision; only the project/class owner may elevate. Platform role changes have no web API. No invitation input branch includes role `owner`, `teacher` or `admin`; co-teacher assignment uses the separate owner-only class operation with an explicitly identified recipient.

### Shared design save

Client sends whole validated document blocks plus `expectedRevision` in the first asynchronous slice. Server locks/compares document revision, rechecks current membership and every approved-excerpt grant, appends a revision and advances the current pointer atomically. A stale edit produces a conflict, not last-write-wins. Preserve the local draft for explicit reconciliation. A subsequent restore is a new revision. Realtime may later add operation-level merging under RT tasks but cannot weaken these authorization or durable-acknowledgment rules.

## 5. AI scope, result and cost contract

The sole provider entry remains `generateAI`. New helpers assemble authorized context; they do not call OpenRouter independently. Preserve current result shapes for the four shipped kinds while introducing validated provenance via AI-002/EV-001. If metadata/envelope changes become necessary, migrate producer and every caller together behind an adapter; do not silently break existing JSON consumers.

| Kind | Actor / source boundary | Permitted result and publication |
| --- | --- | --- |
| `questions`, `synthesis`, `stage2`, `stage3` | Project owner; consent-eligible private project/interview/accepted-learning context, bounded ordered selection | Existing strict draft shapes; user reviews/persists; no sending, stage change or acceptance by the AI |
| `challenge` | Project owner; selected authorized decision and evidence revisions only | Source-linked counterevidence, unknowns and small next tests; optional adoption |
| `question_rewrite`, `outreach_rewrite` | Project owner; explicitly selected text and minimal permitted project context | Editable rewrite; never sent or substituted automatically |
| `lesson_draft` | Active teacher of requested class; permitted resource/rubric versions and teacher's brief | Draft lesson, not a claim of efficacy; teacher review before publication |
| `teacher_feedback_draft` | Active teacher; requested active submitted snapshot version and rubric only | Draft feedback with snapshot/rubric source labels; no raw private source lookup, grade or student ranking |
| `admin_summary` | Current platform admin; server-generated `AdminAggregateView` after suppression | Bounded explanatory draft with data window and uncertainty; no raw events or user text |
| `design_assist` | Active project owner/editor; requested shared document revision and permitted shared excerpts | Proposed shared-document changes for explicit review; no private interview enrichment |

The server derives ids and authorization scope from the kind's validated request; a teacher request cannot add `projectId` to gain founder context. Selected source ids are rechecked against current permissions and consent. Treat content as untrusted data; instructions embedded in notes cannot change policy, budgets or system prompts. Source ids/quote matches must validate against the exact included versions, and output must disclose omitted/insufficient evidence.

Before a provider request, AI-004 reserves bounded cost atomically for actor/project or class/platform scope and the global operation. Client-provided costs, token counts or budget overrides are ignored. Require the evaluated allowlist, configured maximum input/output tokens and bounded fallback price. Missing eligibility, processing choice or budget denies the call. Unknown provider completion keeps its reservation pending reconciliation; do not blindly retry a possibly charged call or promise external exactly-once execution. Every settled/unknown generation records actual model/provider, prompt/schema version and request id without logging private context.

**Current autonomous-run constraint:** the user authorized at most **USD 25 total in OpenRouter charges across the whole run**, not USD 25 per worker or task; no other paid services. The coordinator owns that shared limit and must account for test/eval/retry/fallback spend before authorizing provider calls. SEC-001 makes no calls. This run-specific ceiling is not a permanent account policy or evidence that a paid eval has occurred.

Recheck authorization before returning/persisting results after a long provider call. If a grant is revoked during processing, discard the result from the product response and keep only permitted operational accounting. Withdrawal cannot recall content already sent to a provider; explain this limitation in the processing choice. Model output never grants permissions, settles usage costs, updates grades or turns a candidate claim into verified evidence.

## 6. Flags, audit and dependency handoff

Server-owned flags default off for unimplemented surfaces: `multi_project`, `project_collaboration`, `class_spaces`, `submission_sharing`, `public_shares`, `admin_dashboard`, `grounded_ai`, `realtime_design`. UI flags are presentation only. A disabled server capability returns `FEATURE_DISABLED`; an enabled flag does not bypass permissions. Keep current single-owner/manual flows working when new flags are off. Do not use a flag to relax an existing owner boundary.

Critical audited operations: membership/teacher grant or revoke, invite issue/accept/revoke, snapshot publish/withdraw/share, admin privileged action, project/class archive/restore, account deletion and mutation of spend controls. Event payloads are enum operation, actor/resource ids, revision, timestamp, outcome and request id; do not store participant text, tokens, arbitrary URLs or model prompts. Transactional operations write audit/outbox atomically; operational log visibility is not private content access.

| Consumer | Required handoff from this contract | Minimum verification before enabling |
| --- | --- | --- |
| SEC-002/003 | Eight identities, legacy owner invariants, cross-owner/project/contact denial list | Real database/RPC tests; fresh and existing-data migrations |
| SEC-004/005/006 | Derived ownership, helper/projection strategy, invitation discriminator and operator-only admin bootstrap | Self-promotion, revoked issuer, wrong-recipient/race, direct RPC and stale-admin tests |
| WS-001–007 | Owner lifecycle, actor-scoped caches, revision/CAS, permanent finalization mapping | Switch account/project, interrupted/stale save, parallel finalization and failure rollback |
| PRV-001/002 | Separate purpose choices, unknown historical consent, audience-specific disclosure and deliberate deletion | Missing/withdrawn processing/share choice, private export boundaries, shared-container deletion |
| CLS-001–006 | Student-only class invites, explicit own-project association, safe roster, reviewed snapshot, feedback context | Cross-class/project denial, preview source changes, withdrawn/removed access, teacher AI escalation |
| AN/ADM/AI | Trusted event provenance, fixed aggregate projection, suppression, atomic cost reservations | Forged client completion/cost, small cohorts, concurrency caps and unauthorized AI context |
| EV/SHR/COL | Private decisions vs published snapshots, distinct grants, shared documents and expected revisions | Source revocation through exports/history/AI; stale document saves; no implicit raw-note sharing |

Each implementing task must supply its request/output runtime schemas, protected SQL/policy changes, focused denial/concurrency fixtures and the exact file/function names to the coordinator. Future source paths are reserved above; schema/type/route integration remains serial. A required semantic deviation must be reconciled in both contracts before dependent workers assume different APIs.

For the demonstration, use fictional local fixtures for any unenabled scope. It is acceptable to demonstrate fewer real capabilities accurately; do not label these API designs as deployed endpoints, simulated notes as research or an AI draft as evidence of teaching effectiveness.
