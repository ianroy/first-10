# Next 50: $0 Marketing Lab contract

**MKT-001 · 2026-10-18 · contract version 1.** Baseline `07f704ddfb84a8d5c65633703079e97f783d5981`. This is the implementation contract for MKT-002–008, not a statement that the lab is shipped. It supplements the [access contract](../architecture/access-contract.md), [ProductSpec](../../ProductSpec.md), [marketing claims](claims.md) and [pedagogy map](../teaching/pedagogy-map.md). The owner’s BUS131 Week 6 deck and audience → channels → content → test → measurement board supply the teaching sequence.

## 1. The useful outcome and boundary

A student can explain **whom they will reach, where, with what truthful asset, toward which useful action, within what limits, and how they will decide what to do next**. The result is an executable one-week plan and a later reflection. A polished AI draft, views or a saved plan do not establish adoption.

Use one private plan per project. Preserve the current Stage 2 unlock calculation and existing contacts, outreach, survey and experiment data. The authenticated lab entry is `/marketing` with an explicitly validated `projectId`; normal entry and new saves/generations require the owned project’s stored `stage >= 2`. At Stage 1 show the existing unlock path without changing its requirements. A stored stage is a workflow condition, not proof of research quality. Owners may read/export an already saved plan if stage changes; do not delete it. The public fictional demo has no stage/login gate and no connection to production plans.

The current selected-project convention remains until WS-002 lands. Resolve that project once at entry and pass its id to every operation; never let a nested component independently pick “the first project.” Project changes discard no unsaved draft without an explicit choice. Teachers, class membership, editors/viewers and platform admins receive **no marketing-plan read grant** in this slice. A future reviewed snapshot is a different operation, not broader access to this row.

## 2. Student journey and completion rules

| Step                | Student action and visible output                                                                              | Behavior                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Think first         | Write their own audience, useful action, channel ideas and notes; name their own sections                      | No AI suggestions or filled template before this capture. Prompts can ask questions. Save the initial board before revealing optional scaffolds/AI. “Unknown” is acceptable; do not claim to certify authorship. |
| Focus               | Refine the beachhead; distinguish observations, assumptions and unknowns                                       | Import only selected owner-authorized sources, with source labels. A source is not automatically a verified fact.                                                                                                |
| Investigate places  | Add specific physical/digital channels, their observations, access questions and resource needs                | Enter exact links/places manually. AI can propose avenues to investigate, not verified venues, current rules or access.                                                                                          |
| Choose two          | Select one primary and one distinct alternative, explaining fit and effort                                     | Up to two current commitments. An alternative can be a fallback. The board can retain other candidates.                                                                                                          |
| Make and review     | Produce one channel-specific asset manually or with optional AI; connect it to a destination and useful action | Human truth/disclosure/access checks and a peer or self walkthrough. Copy is deliberate; no send/post/publish APIs.                                                                                              |
| Run a one-week test | Assign tasks, dates, prerequisites, definition of done, resource limits and fallback                           | Planning does not mark outreach completed. External actions remain manual and self-reported.                                                                                                                     |
| Measure and reflect | Record sources, periods, counts/unknowns; choose repeat, revise or stop                                        | Keep reach, visits, useful action, return and referral distinct. No automatic analytics or attribution claim.                                                                                                    |

All manual steps remain available when AI is disabled, unavailable or out of allowance. An incomplete draft always saves if structurally valid. “Ready” is an owner-reviewed planning state, not validation or permission from a venue.

Ready-to-review requires the initial board; audience/useful action; two distinct selected channels; one asset for the primary channel; resource limits; a seven-day test window; a primary outcome/measurement plan; at least one assigned task; and explicit unknowns or an affirmative “none identified.” Unknown baseline/target may remain null with an explanation. Marking `running` additionally requires a launch review for the chosen asset/channel, a manual started timestamp and an actual next task. Marking `reviewed` requires a reflection, even when no one participated. No positive result is required.

## 3. One table, owner-private storage and atomic revisions

MKT-002 adds **only `marketing_plans`** for this slice:

| Column                                             | Contract                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id uuid`                                          | Server-generated primary key; immutable.                                                                                                                           |
| `user_id uuid`                                     | Server-derived owner, default `auth.uid()`; immutable.                                                                                                             |
| `project_id uuid`                                  | Unique, immutable; composite foreign key `(project_id,user_id)` to the matching project `(id,user_id)` after SEC-003 supplies that key. Project deletion cascades. |
| `revision bigint`                                  | Starts at 1; advances by exactly one successful save. Bounded to a safe client integer; clients cannot assign it.                                                  |
| `document jsonb`                                   | Strict `MarketingPlanV1` below, with `schemaVersion: 1`. Unknown schema versions fail closed.                                                                      |
| `history jsonb`                                    | Server-maintained array of the three most recent prior `{revision, savedAt, document}` snapshots. No client-supplied history.                                      |
| `last_mutation_id uuid`, `last_mutation_hash text` | Token and server-computed SHA-256 of the canonical save request for the most recent save; compare both on replay.                                                  |
| `created_at`, `updated_at timestamptz`             | Database timestamps; created time immutable.                                                                                                                       |

Enable owner-only RLS for SELECT. Do not grant browser roles direct INSERT/UPDATE/DELETE; expose a narrowly scoped authenticated atomic save RPC used by `marketing.functions.ts`. The RPC derives `auth.uid()`, authorizes the matching owned project, checks stage for writes, validates shape/bounds/references, and executes compare-and-swap in one transaction. If `SECURITY DEFINER` is necessary for revoked table DML, fix `search_path`, qualify every relation, revoke PUBLIC execution, grant only authenticated execution, prohibit supplied actor ids/dynamic SQL and return only the owner’s plan. No service-role shortcut or general JSON patch endpoint.

```ts
type LoadMarketingPlan = { projectId: string };
type SaveMarketingPlan = {
  projectId: string;
  expectedRevision: number; // 0 means create only; otherwise match current exactly
  mutationId: string; // UUID, reused only for the identical retry
  completeStudentFirst: boolean; // explicit first-board completion; false on ordinary saves
  document: MarketingPlanV1;
};
type SaveResult =
  | { ok: true; id: string; revision: number; savedAt: string; document: MarketingPlanV1 }
  | {
      ok: false;
      code:
        | "UNAUTHENTICATED"
        | "NOT_FOUND"
        | "STAGE_LOCKED"
        | "INVALID_PLAN"
        | "CONFLICT"
        | "IDEMPOTENCY_CONFLICT"
        | "UNAVAILABLE";
      currentRevision?: number;
    };
```

For create, `expectedRevision=0` never upserts over an existing row; serialize concurrent creates using the unique project key and return conflict to the loser. For update, lock the owned row, recheck expected revision, append its prior snapshot, retain the newest three and update atomically. If `mutationId` equals `last_mutation_id` and the canonical request hash matches, return the existing success without another increment; different payload with that id fails. Hash the expected revision, completion flag and normalized client document, excluding server-managed timestamps. A retry after a later mutation returns conflict, never replays an old write. Ignore/derive server-managed timestamps when comparing the client payload. “Saved” appears only after the successful response.

On conflict retain the unsaved draft, display the current revision and offer reload/compare or explicit reapplication against that revision. No automatic merge, last-write-wins or replacing the user’s draft with an AI response. Restoring a retained snapshot is an explicit new save of validated content against the current revision; it creates a new revision. Three prior snapshots provide bounded recovery, not permanent audit history. Show that retention limit and allow an owner-controlled text/JSON download. Reject an incompatible schema; do not reset an unreadable plan to empty.

At the database boundary cap `octet_length(document::text)` at **131,072 bytes**, `history` at three entries and **400,000 bytes**; cap the request body at 256 KiB and preflight the client document at 120 KiB. Refuse oversize documents without truncating fields or dropping current content. Bound arrays and strings below in both API validation and the write RPC’s structural validator. SQL validation must independently enforce scope, identities, revision, schema version and reference integrity; direct RPC calls cannot bypass those invariants.

## 4. Version 1 document: exact shapes

These TypeScript shapes are the contract, with all keys present and `null` for unknown/absent values. Implement strict runtime schemas (for example Zod), reject unknown keys, then add the refinements below. Strings are plain text, never executable HTML. UUIDs in a document are local entity ids unless explicitly described as database references.

```ts
type Id = string; // UUID
type Day = string; // YYYY-MM-DD, real calendar date
type Instant = string; // ISO 8601 UTC
type Format =
  "community_post" | "organizer_email" | "dm" | "social_caption" | "flyer" | "demo_script";
type Metric = "relevant_reach" | "visits" | "useful_action" | "return" | "referral";
type Cohort = "peer_test" | "classmate" | "external" | "automated" | "mixed_unknown";
type AiOrigin = {
  requestId: Id;
  kind: "marketing_channels" | "marketing_content";
  promptVersion: string;
  modelId: string;
  planRevision: number;
};
type StudentBoard = {
  columns: { id: Id; title: string }[];
  notes: { id: Id; columnId: Id | null; text: string }[];
  audience: string;
  usefulAction: string;
  channelIdeas: string[];
  completedAt: Instant | null; // server stamps first explicit completion
};
type Source = {
  id: Id;
  label: string;
  text: string;
  kind: "owner_observation" | "interview" | "accepted_learning" | "external_observation";
  recordId: Id | null; // interview/learning DB id only, checked in this project
  url: string | null; // manually supplied public source URL; never fetched by this contract
  observedOn: Day | null;
};
type Channel = {
  id: Id;
  name: string;
  medium: "physical" | "digital";
  place: string | null;
  url: string | null; // exact place/link supplied by owner only
  sourceIds: Id[];
  observation: string;
  fitReason: string;
  access: {
    state: "unknown" | "needs_permission" | "requested" | "allowed" | "not_required" | "denied";
    rulesNote: string;
    rulesSourceId: Id | null;
    checkedOn: Day | null;
    nextQuestion: string;
  };
  estimatedMinutes: number | null;
  resourcesNeeded: string[];
  unknowns: string[];
  origin: "student" | "ai_proposal";
  aiOrigin: AiOrigin | null;
};
type Asset = {
  id: Id;
  channelId: Id;
  format: Format;
  ownHook: string;
  truthfulSupport: string;
  supportSourceIds: Id[];
  body: string;
  builderDisclosure: string;
  cta: string;
  destinationUrl: string | null;
  firstUsefulAction: string;
  aiOrigin: AiOrigin | null;
  review: {
    truthful: boolean;
    disclosedBuilder: boolean;
    accessChecked: boolean;
    destinationChecked: boolean;
    checkedAt: Instant | null;
  };
  walkthrough: {
    mode: "peer" | "self" | null;
    understoodAudience: string;
    actionObserved: string;
    hesitation: string;
    revisionMade: string;
    checkedOn: Day | null;
  };
};
type WorkTask = {
  id: Id;
  channelId: Id | null;
  assetId: Id | null;
  kind:
    | "investigate"
    | "permission"
    | "make"
    | "peer_check"
    | "manual_outreach"
    | "observe"
    | "reflect";
  title: string;
  ownerLabel: string;
  dueOn: Day | null;
  dependsOn: Id[];
  doneMeans: string;
  estimatedMinutes: number | null;
  status: "todo" | "doing" | "done" | "blocked";
  completionNote: string;
};
type Measurement = {
  id: Id;
  channelId: Id;
  assetId: Id | null;
  metric: Metric;
  cohort: Cohort;
  from: Day;
  to: Day; // inclusive dates; same period required for a rate
  unit: "unique_people" | "sessions" | "events";
  count: number | null;
  source: string;
  sourceUrl: string | null;
  recordedOn: Day;
  limitations: string;
};
type RateSpec = {
  id: Id;
  numeratorId: Id;
  denominatorId: Id;
  label: string;
  subsetConfirmed: boolean; // owner confirms numerator is within denominator population
};
type MarketingPlanV1 = {
  schemaVersion: 1;
  studentFirst: StudentBoard;
  audience: {
    beachhead: string;
    situation: string;
    usefulAction: string;
    valueProposition: string;
    sourceIds: Id[];
    assumptions: string[];
    unknowns: string[];
  };
  sources: Source[];
  channels: Channel[];
  selection: { primaryId: Id | null; alternativeId: Id | null; reason: string };
  assets: Asset[];
  resources: {
    cashBudgetCents: 0;
    availableMinutes: number | null;
    existingResources: string[];
    limitations: string[];
    aiUse: "manual_only" | "existing_allowance";
    fallback: string;
  };
  test: {
    state: "draft" | "ready_to_review" | "running" | "reviewed";
    startOn: Day | null;
    endOn: Day | null;
    reviewOn: Day | null;
    startedAt: Instant | null;
    primaryMetric: Metric;
    baselineMeasurementId: Id | null;
    target: number | null;
    unknownBaselineOrTarget: string;
    measurementPlan: string;
    repeatIf: string;
    reviseIf: string;
    stopIf: string;
    tasks: WorkTask[];
  };
  measurements: Measurement[];
  rates: RateSpec[];
  reflection: {
    decision: "repeat" | "revise" | "stop" | null;
    evidenceIds: Id[];
    learned: string;
    uncertainty: string;
    nextAction: string;
    reviewedOn: Day | null;
  };
};
```

### Bounds, references and invariants

- Maximum arrays: 8 student columns, 24 notes, 8 initial channel ideas, 20 sources, 12 candidate channels, 10 assets, 24 tasks, 80 measurements, 10 rates. String arrays within an entity max 8; id-reference arrays max 20. Ids must be unique within each collection. Null counts and targets stay null; known numbers are nonnegative integers up to 1,000,000,000. Minutes are integers 0–10,080 for this one-week plan.
- Text limits: labels/titles/owner labels 120 characters; student notes/source text/channel observation/fit/rules/asset support/measurement source or limitation 1,000; asset body 4,000; all remaining free-text fields 500; URLs 2,048. Each string-array item max 300. Total byte limit still applies. Trim outer whitespace, preserve meaningful newlines, and never silently shorten saved text.
- Empty initial document: all arrays empty, free text empty, unknowns represented as empty arrays until identified, nullable fields null, flags false, cash budget 0, AI mode `manual_only`, primary metric `useful_action`, test state `draft`. Do not prefill measured zero, a venue permission, a timestamp or a fabricated source. UI prompts/examples must not become saved observations.
- `studentFirst.completedAt` is set when `completeStudentFirst=true` on a successful save after at least one note, a stated audience/useful action and one initial channel idea are saved. Preserve this first board immutably after completion; later refinements use the other plan fields. It is a sequencing record, not proof the student did not use other AI. There is no clear/reset-completion operation in this release; keep the original board across plan cycles. A later fresh-cycle feature needs its own explicit contract. Ignore supplied completion timestamps on first completion and require the stored value on later reads/saves; clients cannot backdate the sequence.
- Every `sourceIds`/`supportSourceIds`/`rulesSourceId` resolves inside the document. `interview` and `accepted_learning` sources require a real `recordId` with the same `project_id` and owner; learning must still be accepted for new AI use. Other source kinds require `recordId=null`. Check referenced records on save and AI context assembly. If a record is deleted, render a missing-source marker on load and block its AI use until the owner repairs/removes it; do not silently invent replacement evidence.
- All channel/asset/task/measurement/rate/reflection refs resolve in this document. An asset references one existing channel; an asset-linked measurement/task must have the same channel. `baselineMeasurementId` resolves to a measurement of the primary metric. `reflection.evidenceIds` references measurement ids. Task dependencies are acyclic, existing and not self-references. The primary and alternative are distinct; no third channel may be marked selected.
- Owner-supplied exact places/URLs never become “verified by First Ten.” `allowed`/`not_required` needs a recorded date and basis; it is a user-reported access check. `denied` cannot pass a launch review. Copying or drafting does not itself require permission to publish; actual manual outreach should wait for permission/rule checks. Never contact a venue on the user’s behalf.
- Asset review resets to unchecked when its body, support, disclosure, destination, CTA, channel or related source content/access basis changes. Retain walkthrough notes as dated observations; show “needs recheck” after a later edit. AI adoption cannot set review flags, permissions, measured counts, decisions or completion timestamps.
- One week means `endOn = startOn + 6 calendar days`, inclusive; `reviewOn >= endOn`, normally the next day. Validate real dates. Tasks can have due dates in this window or a clearly shown preparation date. Warn when total planned minutes exceed available minutes; do not present a funded plan or invent free printing, transport, subscriptions or tokens.
- Initial board, sources and assets remain private and may contain sensitive free text. Minimize personal details; no participant-contact fields are introduced. Owner export is explicit and previewable. No automatic teacher access, analytics text ingestion or raw-content logging.

## 5. Optional AI through the existing gateway

Add only two `Kind` branches in `generateAI`; never call OpenRouter from the browser or a second function. Auth/project/stage checks precede loading any plan or source. Both kinds require the saved initial board and an exact current plan revision. The user previews the selected context and makes an explicit generation request. PRV/AI-008 eligibility, rate, spend and provider controls remain mandatory; a saved learning or note-taking checkbox alone is not external-processing permission.

```ts
type MarketingChannelsInput = {
  kind: "marketing_channels";
  projectId: Id;
  planRevision: number;
  requestId: Id;
  selectedSourceIds: Id[]; // max 6 plan source ids
};
type MarketingChannelsOutput = {
  suggestions: {
    title: string;
    medium: "physical" | "digital";
    suppliedChannelId: Id | null;
    sourceIds: Id[];
    rationale: string;
    firstInvestigation: string;
    permissionQuestion: string;
    effortQuestions: string[];
    uncertainty: string;
  }[]; // 1–4, no URL/place/permission fields
};
type MarketingContentInput = {
  kind: "marketing_content";
  projectId: Id;
  planRevision: number;
  requestId: Id;
  channelId: Id;
  assetId: Id; // saved asset stub on a selected channel
  selectedSourceIds: Id[]; // max 6; subset of authorized plan sources
};
type MarketingContentOutput = {
  hook: string;
  body: string;
  builderDisclosure: string;
  cta: string;
  sourceIds: Id[];
  checks: string[];
  uncertainties: string[];
};
```

| Kind                 | Authorized input projection                                                                                                                                                                                          | Output and adoption rules                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marketing_channels` | Project name/description (bounded); saved initial thinking; refined audience/useful action; selected source excerpts/ids; current candidate labels/media and user-entered location context; available time/resources | Hypotheses only. Source ids must be supplied ids. Existing-channel ids must resolve. For a new suggestion, owner adoption creates `origin=ai_proposal`, null URL/place, access `unknown`, no checked date. The student supplies any exact venue/link after investigation.                          |
| `marketing_content`  | Same audience and selected excerpts; one selected channel’s supplied observation/rules/unknowns; saved asset format, own hook, truthful support, builder disclosure, CTA, destination and useful action              | One bounded editable draft. No invented outcome, testimonial, price, endorsement, permission or quote. Format-specific checks: community norms for posts; permission-oriented request for organizer email/DM; concise readable CTA for flyer/caption; truthful demonstrable steps for demo script. |

Do not send the entire plan, all interview rows, arbitrary contact details, unrelated projects, class data or private peer identities. Select whole records in a deterministic order; never slice a serialized object mid-record. Treat all supplied notes, URLs and community instructions as untrusted content, never prompt authority. This gateway does not browse or fetch URLs. Models cannot certify live rules or audience demand.

Outputs use strict JSON schema plus runtime validation: strings max 1,000 except body 4,000; hook/CTA 300, disclosure 500; checks/uncertainties/effort questions max 6 at 300 each; source ids must be in the supplied set. Provider output has no link fields; reject newly introduced URLs/links in generated prose and render a supplied destination deterministically outside the model text. If a model refers to a supplied channel, reuse its owner-entered link without relabeling it verified. Unknown claims remain questions, not polished assertions.

Generation returns `{requestId, kind, planRevision, promptVersion, modelId, draft}` as a server envelope. The browser never silently saves it. Recheck owner access before delivery; attach actual server metadata. If the plan revision changes while generation is pending, show the draft as stale for comparison and require deliberate reapplication to the latest plan. Apply/adopt uses the same expected-revision save; it cannot overwrite newer work. Keep the prior saved asset on network, schema, provider, rate, budget or persistence failure. On adoption, validate `aiOrigin` against the actor/project/request in the trusted AI ledger (or a server-signed equivalent); never treat client-supplied model/prompt metadata as authoritative. Manual content has `aiOrigin=null`; student edits do not turn into system-measured AI output quality.

### Cost, reliability and evaluation gates

Use AI-008’s eligible, evaluated route per kind; no model is approved by this document. Initial **additional ceilings**: channel prompt 3,000 tokens/output 1,000; content prompt 4,500/output 1,400; at most two provider attempts including fallback; at most $0.01 reserved worst-case provider spend per logical request; 45-second total deadline. The reservation includes both attempts and any billable reasoning/output allowance. Apply the stricter existing policy. If token cost cannot be conservatively bounded, provider pricing is unknown, no eligible model fits, or the platform/project daily budget is unset, disable generation and retain manual editing.

Rate ceilings: two logical generations per minute and ten per day per project, plus twenty per day per actor; shared platform caps still apply. Use request-id idempotency and reserve atomically before each logical request; a retry of the same request must not start another paid operation. Record every attempt’s actual usage/cost and reconcile reservations; do not treat missing usage or an ambiguous timeout as zero spend. Do not refund/resend blindly after an uncertain completion. No expensive silent fallback or new model selected solely by price.

MKT-004/005 evaluate separately using fictional/de-identified fixtures. Required checks: student-first gate, wrong owner/project/source id, forged revision, source injection, fabricated community URL/rule, unsupported claim/quote, irrelevant channel, unreachable resource needs, schema/length errors, permission denied, empty context, low budget, duplicate request, timeout, late response and provider failure. Counters, permissions, URL construction, validation, rates and arithmetic are deterministic code, never LLM decisions. This task makes no paid call and reports no measured quality/cost result.

## 6. Manual measurement and safe destinations

A measurement is a user-entered observation with a source and date window. Keep peer tests, classmates, outside participants, automated traffic and mixed/unknown audiences separate. Never merge demo fixtures or a student's app funnel into First Ten’s admin acquisition/engagement analytics. The source field might name a tally, an analytics view or a self-report; none implies a verified integration. Known zero is explicit; missing is null.

Rates are computed, not model-written or stored as a magic percentage. Permit only predefined pairs: visits/relevant reach, useful action/visits, return/useful action, referral/useful action. Require both rows to share channel, asset scope, cohort, inclusive dates and `unique_people` unit, plus `subsetConfirmed=true`. Require known nonnegative counts, positive denominator and numerator ≤ denominator. Otherwise show counts and a reason (“not measured,” “no denominator,” “different populations” or “not comparable”), not 0%, Infinity or a conversion claim. Display numerator/denominator, period and the measurement limitation beside any valid rate. Do not calculate rates for sessions/events or compare disjoint traffic as a causal experiment.

For a useful-action primary outcome, define the action in plain language before setting a target. Reach/visits can support diagnosis; they cannot automatically stand in for product use. Return/referral need their own explicit observation, not an invite or a share-button click. Baseline can be unknown. Repeat/revise/stop criteria are written before running; later reflection cites observations and preserves what remains uncertain.

Destinations are manually supplied public HTTP(S) URLs; require an absolute URL, no credentials, control characters, javascript/data/file schemes, localhost, loopback or private-network literal hosts. Parse with `URL`; do not fetch, scrape, generate redirects or infer that the destination works. Permit a local development link only in an explicitly non-public test fixture, never as an externally ready asset. Source/destination URLs can contain sensitive data: preview them and avoid secrets, invite tokens, private-note links or personal identifiers.

UTM construction is optional and deterministic from the supplied destination. Set `utm_source`, `utm_medium`, `utm_campaign` from non-personal slugs (1–64 ASCII letters/digits/underscore/hyphen), preserving other query entries and the fragment. Show any existing UTM values before deliberate replacement. Never include user/project UUIDs, emails, participant labels, access tokens or free-text evidence. A tagged URL only labels a link: the destination must already collect/report those parameters for attribution to be available. No pixels, tracking script, third-party analytics integration, QR code payment or automatic measurement is implied. Link-check and peer walkthrough are manual observations in this slice.

## 7. Handoffs, verification and rollback

| Task        | Output and acceptance focus                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MKT-002     | One table + strict types/load/save. Real isolated two-owner RLS/RPC tests, foreign-project/source attacks, direct-DML rejection, concurrent creates, stale save, identical retry, oversized/malformed document, history restore and unknown/null round trip.     |
| MKT-003     | Stage-aware private workspace; own thinking first; manual channel board and two choices; explicit unsaved/saving/saved/conflict/error states; no cross-project cache reuse.                                                                                      |
| MKT-004/005 | Separate optional AI kinds with scoped context, per-kind eval/budget gates and editable adoption. No live-source invention, auto-contact or overwrite.                                                                                                           |
| MKT-006     | Executable tasks, bounded resources, safe tagged URL, explicit manual observations, valid rates and reflection; readable owner copy/export.                                                                                                                      |
| MKT-007     | Public StudyLoop continuation: campus-club route + digital alternative, sample asset, proposed measurement and reflection. Bundled fictional data, reset/keyboard/text fallback, no auth/provider/production reads or writes.                                    |
| MKT-008     | Actual desktop/mobile/keyboard journey and failure cases; measured spend only if a capped eligible generation runs. Distinguish shipped, manual, disabled and demo-only capability. Teacher views are absent unless a separate reviewed snapshot contract ships. |

Do not represent this document as a browser/RLS/eval pass. Preserve current behavior behind the new entry until its checks pass. Rollback hides/disables the lab entry or AI kind while retaining the private table, acknowledged saves, bounded history and owner recovery path; never reset or broaden access to make a demo work. The coordinator updates task state and public claims after integration.
