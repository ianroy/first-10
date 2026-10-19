# Signed-in class participation verification — 2026-10-18

Worker e32269a is integrated as e316d0c. This change uses the existing account participation and immutable selected-copy services; it adds no schema, role grant, provider call or raw teacher data access.

- Enrollment, published assignments and deliberate owner-project association remain the existing scoped workflow. The class inventory now distinguishes loading, failure/retry and true emptiness.
- An author can select a previous copy for the chosen assignment, reread it freshly and begin a new reviewed revision. The server independently binds author, class, assignment, associated source project, thread and preview. Selected fields must be reviewed again; a new version has a new recipient grant. Old withdrawn versions are not revived.
- Students see the teacher-visible alias, membership and exact-copy metadata described before publication. The private project connection grants no raw source access. A personal-workspace return link is explicit.
- Pending leave disables a still-mounted review form. A failed or uncertain leave preserves unsaved reflection and the stable retry identity; confirmed departure or explicit refreshed revocation removes the pending class review. Private source work and author-copy recovery remain separate.

The new 15 component tests cover selection/recovery, error-versus-empty, revision source/assignment checks, fresh reread failure, teacher exclusion, leave retry/draft preservation, confirmed departure, access refresh and invitation failures. Together with existing relevant tests the scoped suite passes76. These use deterministic server doubles; they are not actual enrollment or deployed authorization proof.

Unchanged database authority is covered by the previously executed migration21/22/24 SQL fixtures and the successful isolated-RLS CI on6e7c581. The source audit confirms existing thread author/project/class/assignment checks in preview and confirmation; this UI adds no new authority. Combined root checks with all three saved actual-SQL DTO suites enabled pass1174 app tests/11 existing skips, typecheck, full lint (0errors/6 existing warnings) and the Vercel build.

A live ordinary-student login, revision/leave browser journey and physical second-device check remain final integrated release checks under REL001/002, not claimed here. The available fictional presenter is a class owner, so its teacher view is not presented as an ordinary-student test. Local component transport and historical SQL evidence do not replace that release gate.

Root also corrected named-account invitation copy to direct account-free learners to the teacher’s separate guest entry link. It never converts a named-account invitation into a guest capability. Rollback hides the new revision entry and retains private source work, every earlier immutable copy and withdrawal support.

Live root follow-up one5495dd: classroom inventory and personal-workspace return link rendered; selecting the fictional owner class loaded current assignments. Refresh selected class immediately removed the old detail during the access check, then restored it with both selected Discovery and Marketing Lab teacher copies still present. Screenshot: `/private/tmp/first-ten-pdf-qa/live-classroom-refresh.png`. This confirms the owner refresh path only, not a live ordinary-student revision/leave journey.
