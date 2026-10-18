# Class guest and export access contract

Version 1 · 18 October 2026 · technical design, implementation pending. Implements the owner requirement in [FERPA-first direction](ferpa-first-product-direction.md). This document is not institutional approval or a processor agreement.

## Principals and resource scopes

A teacher authenticates normally and owns a class or hackathon. A student can use a chosen team alias without a personal account or required name/email. Model a guest as a server-created opaque principal under a real class/team, separate from `auth.users`. Its team/session capability is an authorization factor, not an identity verification or evidence of student enrollment. Do not put a guest UUID in an existing `user_id` foreign key or invent a project association.

Proposed class relations are explicit exceptions to the account-project scope: `class_guest_principals`, `class_teams`, `class_guest_sessions` and `class_guest_activities` have real class/team/principal references and immutable teacher issuer/guest author fields as applicable. Account-owned projects keep `user_id` and `project_id` intact. If a team intentionally associates a real existing project later, authorize that owner/project separately; enrollment never establishes that relationship.

Class entry and team access are different capabilities. A teacher may display a class-entry code/QR. It permits bounded guest entry or creation of a new team; it never reveals a roster, existing team content or a reusable private team secret. Joining an existing team requires an intentionally shared team invitation. Return access uses a high-entropy recovery capability, communicated to the student, not a hidden account or forced email collection. Show how losing that capability affects recovery before the student relies on it.

Team/session secrets are generated server-side with at least 128 bits of entropy, stored only as hashes and compared safely. Use secure, HttpOnly, SameSite cookies for the active session. Do not place private return/team secrets in URL queries, analytics, logs or referrers. Class-entry codes are rate limited, bounded and revocable; accepting one exchanges it for a specific team/session capability. Apply CSRF/origin protection to mutations. Database functions recheck class lifecycle, session expiry/revocation, team and allowed operation on every call. No general anonymous SELECT policy is added to class, submission, team, project or interview tables.

## Field and audience matrix

`Own` means the verified account owner or validated guest/team capability for that resource. Teacher means an active teacher for that class. Submitted means an explicitly reviewed immutable snapshot, not a live private-table join. Institution/operator control is governed by configured service access and agreements; it does not become ordinary teacher UI permission.

| Data or operation | Current storage/processor | Owner or guest team | Teacher | Other teams/public | PDF default | Target control |
| --- | --- | --- | --- | --- | --- | --- |
| Teacher account email/auth ID | Supabase Auth; existing | Own teacher only | Own teacher only | Deny | Exclude | No student email needed for guest entry |
| Student real name/email/student ID | Not required in guest mode | Avoid collection | Not required | Deny | Exclude | Team alias is enough; no identity mapping inferred |
| Guest principal/session secret | New class scope; planned | Opaque own scope; secret held only in session/recovery channel | Safe count/state only, no secret | Deny | Exclude | Hash-only secret storage, expiry/revocation, rate limits |
| Class entry code and title | New class scope; planned | Enter the matching class | Own class manage | Code conveys entry only | Class title optional | A code is never a roster/read grant |
| Team alias and membership label | New class scope; planned | Own team | Disclosed class projection | Deny by default | Alias optional | No forced real name, user email or external directory |
| Personal project definition/questions/checklist | Existing Supabase project | Verified account owner only | Deny unless intentionally submitted excerpt | Deny | Selected owner export | Guest joins do not grant project ownership |
| Raw private contacts, notes, exact quotes | Existing owner-only tables; guest private scope planned | Own scope only | Deny | Deny | Exclude by default; explicit owner selection/redaction | Note consent and sharing/AI choices separate |
| Guest team private activity draft | New class/team scope; planned | Validated team capability | Deny raw draft | Deny | Own/team export after review | Display shared-with-team audience before save |
| Intentionally submitted activity version | New immutable class snapshot; planned | Submitting team read/withdraw | Active class/assignment read | Deny | Teacher may export authorized version | No automatic inclusion of later private edits |
| Teacher feedback and rubric | Existing private planner; class scope planned | Matching submitted team only | Own class/author permissions | Deny | Submitted-team/teacher selection | Does not grant raw-note access or automatic grading |
| AI request source context | Existing server gateway to OpenRouter/provider | Requires affected processing permission | Own permitted content only | Deny | Origin metadata only | Guest/class AI off until institutional policy and consent permit |
| AI generation receipt | Existing private metadata ledger | Owner project scope | Deny unless selected submitted metadata | Deny | Selected prompt/model/version, not account/request secrets | Unknown reported cost/model stays unknown |
| Workspace manual measures/results | Existing owner marketing/project data | Own scope | Submitted aggregate only | Deny | Selected, with units/source/period/unknown markers | Do not turn drafts or counts into verified outcomes |
| Operational product/AI counts | Existing narrow admin; broader planned | No cross-user access | Own class disclosed coarse progress only | Deny | Not part of student activity PDF | Admin is aggregate-only, no raw student trail |
| PDF export bytes and manifest | Local browser; new engine planned | Explicit authorized download | Submitted versions only | No automatic publication | Selected activity/team content | No paid render service, AI call or arbitrary remote resource fetch |
| Access/revocation audit | Existing narrow ledgers; class scope planned | Safe own operation result | Class-scoped management result | Deny | Exclude internal actor/token IDs | No source-content payload in operational logs |
| IP/browser/server request metadata | Hosting/database processors; exact retention review pending | Do not imply anonymous | No ordinary teacher trail | Deny | Exclude | Inventory actual provider settings; minimize app logging |

A team member can see only the work whose audience is explicitly the team. A private interview must not turn into team or teacher data merely because an activity adapter exports it. Every export adapter derives `sourceScope` and audience from authorized acquisition. Selecting “teacher” or supplying an arbitrary JSON `submitted_snapshot` string is never itself an access grant.

## Provision, save, submit, export, withdraw

1. Teacher chooses class or hackathon, assignments, end date, retention schedule and permitted processing. The provision screen previews the class/team/student-visible audience and policies before activating entry.
2. Guest enters a class code, sees instructions and data audiences, and chooses a team alias. An existing-team join requires its separate team capability. Student signup is optional, not a condition of the guest activity.
3. Each draft declares whether it is personal/private or shared with the team. Save and reload are authorized to that exact principal/team/class. A pending save from team A must never appear in team B after switching.
4. Submission creates a selected, redacted, versioned snapshot. Preview shows exactly what the teacher can see. Teacher progress projections omit draft text, contact identities and raw source IDs.
5. PDF export freezes selected authorized versions. The file identifies activity, alias when chosen, capture date, source/activity version and status. Include blank/unknown/not-run states honestly. Record coverage so every activity supplies an adapter; all-activity export reports omissions rather than silently dropping them.
6. Withdrawal/revocation removes future recipient access and excludes withdrawn work from newly generated teacher bundles. It does not delete a PDF already downloaded by someone else. Explain this at export/submission, without treating export as public sharing.
7. Class closure blocks new guest entry and follows its disclosed save/return/submission policy. Give students an opportunity to export before access ends. Retention/deletion is explicit and institution-configured; no indefinite guest workspace is silently created. PRV-002 implements deletion mechanics before a retention promise is advertised.

## AI and processor policy

Manual activities remain useful when AI is unavailable or disabled. A guest/class space starts with AI disabled until the institution/teacher configuration permits the approved use and affected-record processing choices allow it. Consent to note-taking or enrollment is not permission for external model processing. Unknown or withdrawn permission excludes the affected text from model context. The server gateway enforces the decision; a disabled button alone is insufficient. Do not claim zero retention, no training or approved geography without verified provider configuration and agreements.

Department of Education guidance addresses online educational services, institutional direct control and data use. Its glossary explains why indirect identifiers matter. Use those primary sources when preparing FERPA-002 institutional review, alongside actual architecture, processor settings and agreements. [Online services guidance](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Student%20Privacy%20and%20Online%20Educational%20Services%20%28February%202014%29_0.pdf), [PII glossary](https://studentprivacy.ed.gov/glossary).

## Required executable evidence

- Two teachers, two classes, two teams per class, guest and account principals: direct API/RPC/SQL reads and writes stay within scope. Forged, revoked, expired, reused, wrong-team and closed-space capabilities fail without disclosing whether private content exists.
- No-account guest can join, finish an activity, save/reload, return via disclosed recovery, preview a submission and obtain its PDF. A second unrelated guest cannot retrieve it.
- Missing/withdrawn processing permission or disabled class AI prevents the affected text from reaching the mocked provider boundary. Verify actual bounded synthetic provider use separately.
- Individual and full-team exports show all selected activities, no unrelated rows and no unselected private identifiers. Withdrawn/unsubmitted private work is absent from teacher bundles. Inspect actual PDF pages for long text, Unicode, tables, links and page overflow.
- Retention job dry run, bounded deletion and fixture restore; log only safe counts. Actual institution review and approval remain separate evidence, not synthetic test output.
