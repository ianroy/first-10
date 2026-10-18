# FERPA-first classrooms, hackathons and portable team work

Owner requirements, 18 October 2026: make FERPA-first classroom design a core value proposition; let teachers provision class or hackathon spaces that students join without creating a personal account; provide PDF export for **every activity** and complete student-team data.

**Proposed classroom promise:** provision a private learning space, let students start with a team alias, and take their reasoning and work back out as PDFs. This is the next product direction, not a claim that account-free classrooms or all PDF exports already work.

## Privacy contract to implement

A school or teacher account provisions a bounded class/hackathon space with instructions, assignments, end date, retention policy and permitted processing. A student does not have to supply a name, email, password or personal profile to participate. Distinguish a public class-entry code from a secret team/return capability. The former admits entry; it must never unlock existing team work or enumerate a roster. Tokens require high entropy, hashed storage, expiry, revocation and bounded attempts. No-account guest principals are an explicit new class resource scope, not an anonymous policy on the existing private project tables.

Show who can see an activity before it is saved or submitted. Separate shared team work, private notes and intentional teacher submissions. Teachers see their authorized class projection and selected submitted versions. They do not acquire every private interview because they created a class. Teammates see only their approved team scope. Platform admins receive operational aggregates. A guest returning on a different browser needs a disclosed, safe recovery/return method; do not quietly collect email as the solution.

Institution control includes allowed processors, AI opt-in, approved purpose, role grants/revocation, retention/closure, export and deletion. Default guest participation must support a useful manual path. Class enrollment, note-taking permission, team membership and external-AI processing are distinct choices. Uncertain historical permission stays unknown. Do not use student work for advertising, model training or unrelated profiling. Keep operational logging minimal and record its actual retention and processors.

Account-free does not necessarily mean anonymous or outside FERPA. Direct and indirect identifiers can identify a student, and removing an email field does not settle the treatment of the rest of a record. The Department of Education defines those identifiers and explains the conditions around outsourced educational services and institutional direct control. These sources inform the engineering requirements; institutional review and agreements remain a separate release gate. [Department of Education glossary](https://studentprivacy.ed.gov/glossary), [online educational services guidance](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Student%20Privacy%20and%20Online%20Educational%20Services%20%28February%202014%29_0.pdf).

## PDF means every activity

Each implemented activity needs its own downloadable PDF, as well as a chosen-activity team portfolio. Include the activity title, project/team alias, date/version, draft or submitted status, selected original work, decision/reflection and applicable evidence/source labels. Preserve disagreement, unknown versus zero, proposed versus run and fictional examples. AI origin describes the source draft; it does not certify edited wording or the truth of its claims.

The coverage inventory includes idea definition; people and outreach pipeline; interview questions, in-progress drafts and completed interviews; synthesis and accepted learning; experiments/results; outreach plans, messages, feedback surveys and manual metrics; all five Marketing Lab steps and their board, channel map, content, test plan, measures and reflection; teacher lesson plans, assignments, rubrics, submitted team work and feedback; evidence packs, decisions, commitments and shared design activities as implemented. The generic printable teaching kit is useful but does not replace PDF export of a student's actual work.

Export follows the same access rules as viewing. Students can export their own authorized work; teachers can export intentionally submitted class/team versions. Private notes and participant identifiers are excluded by default and cannot leak into a teacher bundle. Preview and redaction precede generation; a PDF is a frozen snapshot, not a live share. Once downloaded, revoking an app grant does not delete that local copy, so explain that at export. Generation must not require a paid PDF service, AI request, arbitrary remote fetch or hidden transfer of student data.

## Execution

- FERPA-001: field/principal/processor/export matrix and reviewed technical contract.
- CLS-007/008: teacher provision and account-free team activity/return/submission journeys.
- EXP-001/002/003: common PDF engine, every-activity coverage and team/class portfolios.
- PRV-003: executable guest/session/team retention and deletion after guest resources exist.
- FERPA-002: actual institutional review, agreement/settings evidence and disposition.

Keep implementation and public availability distinct. “FERPA-first” is the design and operating requirement. Do not describe the current prototype as certified or institutionally approved without the corresponding evidence.
