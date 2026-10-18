# Guest class entry (CLS-007)

Teachers can provision a class or hackathon at `/classes` without owning a
personal project. A class owner publishes instructions and assignments, reviews
the audience/end date and activates a bounded entry link/QR. Students enter at
`/join` without a name, email, password or personal account. Chosen aliases are
optional; the server generates them when absent. This is an authorization
capability, not identity or enrollment verification and not a legal compliance
claim.

## Separate authorities

1. **Class entry** creates a new team plus a new opaque guest principal. It
   cannot list existing teams, restore them or retrieve a private source.
2. **Team invitation** admits a new principal to one existing team. It expires
   within 24 hours and admits at most 12 uses, subject to team capacity.
3. **Team return** similarly creates a new principal in that team, with a
   disclosed maximum 30-day lifetime. It never restores another principal's
   private scope. Sharing a team key does not share principal-private work.
4. **Principal recovery** restores exactly its real class/team/principal.
   It is one-use: successful recovery revokes that principal's previous
   sessions/recovery credentials and issues a new private recovery secret.
5. **Browser session** is a distinct opaque capability scoped to one real
   principal/team/class. It lasts at most 24 hours or until class access ends.
   It is available only in a secure HttpOnly cookie.

All raw capabilities use 32 cryptographically random bytes (256 bits) generated
in SQL; tables store SHA-256 hashes only. Successful entry/recovery returns new
return/invite/recovery secrets once for explicit private copy/file download.
They are not recoverable from hashes or persisted in local/session storage.
Teachers cannot retrieve a learner's private key. A lost private recovery key
cannot be replaced by a team key. The public room explains this before entry.

Only the class owner activates/revokes class entry or revokes team/principal
access. Active co-teachers can manage assignments and see disclosed aliases/
state, but do not manage entry, roles or guest revocation. Student accounts
receive published instructions/assignments, never guest roster management.
Current authenticated class invite tools remain separate from no-account entry.

Guest schema uses real class/team/principal FKs and immutable actual teacher
issuer fields from CLS-001. It does not create auth.users or project rows, put
guest IDs in existing account user_id FKs, add project membership, or change
private project/interview/contact RLS. Closed private tables have no direct
anonymous/authenticated/service-role table privileges. The service role can
execute only the explicit guest exchange/session RPCs, not private helpers.
Owner management RPCs independently verify current authenticated authority.

## Lifecycle, capacity and retries

Each class entry lasts 1–30 days, bounded by class access end, and admits at
most 1–200 new teams. Ten unexpired active entry links/class and the latest
50 entry metadata rows are exposed to the owner. Revocation stops future use
of that link; admitted team sessions continue until their own expiry or
explicit team/principal/class closure. The UI distinguishes these actions.

SQL serializes all scope mutations on the actual class row. It enforces
200 historical teams/class, 1,000 principals/class, 12 principals/team and
256 historical capability records/team, regardless of reset browser cookies.
Every browser session is issued alongside a counted recovery capability, so
session history is bounded too. At the history limit recovery returns
RECOVERY_UNAVAILABLE before revoking prior credentials; current valid session/
recovery records remain intact. Management can still log out. A rejected
rotation never silently destroys the prior key.

Admissions also consume atomic global (500/minute), trusted-client
(120/minute) and matched-capability (120/minute) counters. The client limit
accommodates a 45-person classroom behind a campus NAT. The server HMACs only
Vercel's overwritten `x-vercel-forwarded-for` platform header with a distinct
purpose; arbitrary forwarded-for headers are ignored. Outside Vercel, or when
the trusted header is absent, requests share a conservative unknown-client
bucket. No raw IP/fingerprint is stored. Vercel documents this platform header
in its [request-header reference](https://vercel.com/docs/headers/request-headers).
Global/per-code/class capacities still hold if client identity changes.

Admission counters are written outside the inner scope transaction. Capacity
and crossed-deadline failures roll back partial teams, principals and recovery
rotations while retaining attempt counts. Clock time is checked after lock
waits and before session issuance; expired/archived classes, revoked principals,
archived teams, revoked/expired sessions and wrong capability kinds fail closed.

Owner entry issuance uses request UUID + payload identity. An identical retry
returns metadata with token:null/replayed:true; different payloads conflict.
There is no automatic public-entry retry: if a response is unconfirmed, reload
to inspect any delivered session before deliberately creating another team.
A failed or lost initial entry response does not claim learning work was saved.
Public admission remains bounded even after abandoned sessions.

## HTTP and browser boundaries

Public server functions require POST, exact Origin matching the server request
URL and same-origin Fetch Metadata when supplied. HTTPS is required in
production. A same-origin bootstrap issues an HttpOnly CSRF challenge cookie
and returns an HMAC bound to that challenge plus the current session cookie.
Every public mutation must supply that in-memory CSRF value. Entry/recovery
rotates both session-bound CSRF and active session; a previous scope's CSRF
cannot authorize a newer cookie. Bootstrap clears stale session cookies on an
explicit database denial or invalid projection. Database/network uncertainty
is reported as unavailable rather than inventing session success.

Production cookies are `__Host-firstten_guest` and
`__Host-firstten_guest_csrf`: Secure, HttpOnly, SameSite=Strict, Path=/,
no Domain. Plain HTTP is allowed only in non-production on localhost,
127.0.0.1 or ::1; it uses explicitly separate development cookie names.
There is no production insecure-cookie fallback.

URLs carry capabilities only in fragments:

- `/join#entry=<64 lowercase hex>`
- `/join#team_invite=<64 lowercase hex>`
- `/join#team_return=<64 lowercase hex>`
- `/join#principal_recovery=<64 lowercase hex>`

The page strips fragments and queries before any request; malformed values do
not acquire query fallback. Links, QR and recovery files are generated locally.
No external QR/render service, AI call or email message is sent. Raw session
tokens never return to browser JavaScript. Route and function responses use
private/no-store, no-referrer and noindex/nofollow. Do not add analytics that
capture the original private URL or recovery inputs.

Class UI is keyed by verified user then class, remains outside RequireProject,
and ignores reads from an unmounted selection. Public room generations discard
late entry/management responses when capability scope changes. Opening a new
invitation shows its review form even when another guest cookie already exists.
All new entry/recovery secrets disappear from visible state on scope changes;
only explicitly downloaded/copied keys remain with the student.

## Current surface and next activity gate

The own guest view contains only class title/mode/instructions, end date,
requested retention, AI:false, own team/principal IDs/aliases and at most 50
published assignments. It omits rosters, other teams, session/recovery secrets,
account projects, contacts and raw notes. Teacher guest lists are paginated
50 teams with up to 12 disclosed aliases/access states each.

This task provides entry and published instructions, not learning activity
drafts or submissions. The room explicitly says activity saving is unavailable.
CLS-008 must implement real team/private activity audience controls and
persistence together with individual activity PDFs and coverage registration.
Team acquisition may use the session's team; principal-private acquisition must
also bind the session's principal. Never authorize a supplied principal ID,
invent an account project, or widen a team invitation into private recovery.
CLS-002/003 and EXP-003 handle deliberately reviewed submissions/teacher bundles.
Class AI remains off until its separate institutional/processing gates.

Requested retention days are displayed but are not a promise of enforced
deletion. PRV-003 owns guest retention and deletion. Bounded admission-counter
housekeeping removes old request-count windows only; it deletes no learning
work. Institution-dependent review and agreements remain separate FERPA-002
work; account-free use does not mean anonymous processing.

## Evidence and coordinator integration

The guarded database rehearsal creates a uniquely named schema-only clone of
the dedicated local55322 stack, verifies no source auth rows were copied,
applies only the pinned reviewed migration and runs rollback policy fixtures.
It tests real SQL roles, code bounds, wrong-kind/forged capabilities, two
classes/teams, distinct team/private principal recovery, one-use recovery,
expiry/revocation/closure, capacity rollback and persistence of rate counters.
Two actual independent connections compete at cap255: one rotation commits,
the second waits then denies and the valid new key remains at cap256.
A separate manage request waits across actual class expiry and returns
NOT_FOUND without changing its prior recovery key. The exact newly created
clone is dropped and absence verified. No main-local or hosted 18000 apply is
performed by this worker.

Root owns dependency locks (qrcode1.5.4/@types1.5.5), generated database types,
routeTree and AppShell navigation/sign-in destination wiring. The new source
routes are `/_authenticated/classes` and `/join`; root publishes/applies in
15000 → 16000 → 17000 → 18000 order. The QR uses the local library and complete
entry URL; inspect it at desktop presentation size after integration. Root
must verify a real browser full guest round-trip on the integrated app before
claiming live release acceptance.
