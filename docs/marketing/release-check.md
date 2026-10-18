# Desktop public release check — 18 October 2026

Observed 11:48–11:51 UTC at https://first-10-three.vercel.app in a dedicated Chrome QA tab. Source baseline for the review: `840d0eb`. The production alias can move during release; this report identifies the observed pages and behavior rather than asserting that every response exposed a commit identifier. No private project writes, account changes, paid AI requests or pitch rebuilds were performed.

## Actual browser results

| Check                              | Result                                                                                                                                                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing → Explore the example      | Passed. The CTA opened `/demo`; no login gate appeared. Hero and example identify the material as fictional.                                                                                                                                                                      |
| Public example                     | Passed. Opened Nora’s counterexample, moved to Choose, selected attendance confirmations and opened the proposed test. The result says “Proposed · Not run” and retains uncertainty.                                                                                              |
| Discovery → marketing continuation | Passed. The selected audience carries into the public Marketing Lab and explicitly excludes Nora’s already reliable group. The board identifies itself as fictional, proposed, with no posting, AI calls or saved data. Later marketing-board steps were not rerun in this check. |
| Demo → Start project               | Passed. Opened `/auth`; sign-in stayed visible while an existing presenter session was present. Student/Educator/Admin choices and existing-session destination buttons were visible. Did not submit credentials or switch the account.                                           |
| `/teach`                           | Passed. Lesson, one-week assignment, downloadable resources and six named teaching concepts were visible. No measured learning improvement or institutional endorsement was claimed.                                                                                              |
| Teaching page → readable kit       | Passed. The “Read or print HTML” link opened the nine-handout teaching kit with its source cards, worksheets, rubric and editable-source links. Print dialog/output was not rechecked.                                                                                            |

The browser profile already had a presenter session. Separate HTTP checks below used **no cookies or Authorization header**, so public availability is not inferred only from that signed-in browser. They returned the same public destinations without an authentication redirect. A fresh signed-out browser context was not created.

Six concepts observed on both landing and teaching pages: experiential learning; generative, student-led thinking before AI; scaffolded practice; formative peer feedback; metacognition and reflection; responsible AI and human judgment. The teaching page explicitly calls them activity-design choices rather than demonstrated learning gains.

## Public resource availability

Cookie-free GET requests returned HTTP 200 for `/`, `/demo`, `/auth`, `/teach` and `/demo/studyloop.html`, with `text/html` content and no final-URL redirect.

| Teaching resource                       | HTTP / type                              |  Bytes |
| --------------------------------------- | ---------------------------------------- | -----: |
| `/teaching/first-ten-teaching-kit.pdf`  | 200 / application/pdf; `%PDF-` signature | 351063 |
| `/teaching/first-ten-teaching-kit.html` | 200 / text/html                          |  35958 |
| `/teaching/instructor-guide.md`         | 200 / text/markdown                      |   4428 |
| `/teaching/studyloop-case.md`           | 200 / text/markdown                      |   3937 |
| `/teaching/student-worksheet.md`        | 200 / text/markdown                      |   4183 |
| `/teaching/one-week-assignment.md`      | 200 / text/markdown                      |   4420 |
| `/teaching/field-worksheet.md`          | 200 / text/markdown                      |   4525 |
| `/teaching/assessment-rubric.md`        | 200 / text/markdown                      |   4472 |

All six advertised HTML resource anchors were present: instructor-guide-1, studyloop-case-1, student-worksheet-1, one-week-assignment-1, field-worksheet-1 and assessment-rubric-1. This verifies retrieval and link targets; it is not a new PDF pagination/accessibility certification.

## Copy fixes prepared from the observed release

Three current/planned descriptions had fallen behind shipped features:

1. Landing FAQ called separate teacher panels planned. It now names available private lesson planning and the authored workshop preview, while keeping live submissions, teacher access to student work and shared projects planned.
2. Interactive marketing-example footer and matching static fallback called the saved Marketing Lab planned. They now identify the available **manual Stage 2** saved lab and keep the public fictional example separate from private work.
3. Teaching-page FAQ called the full in-app Marketing Lab and teacher panels planned. It now distinguishes available private planning/manual marketing from future live class access and dedicated AI for private marketing plans.

These are source changes in this QA commit; they require integration/deployment. The earlier browser observations exposed the stale text and do not constitute a post-deployment check of the corrected wording. All 16 focused tests across the existing landing, teaching and marketing suites passed. Scoped ESLint and `git diff --check` also passed. No build was run for these copy-only changes. No general marketing AI, shared student data or real class activity is claimed.

One follow-up is intentionally left: the version-1.0 teaching kit’s “at the kit’s source revision” status paragraph describes earlier planned features. It is explicitly historical and asks instructors to check deployment. Update it in a coordinated kit-version change that regenerates Markdown, HTML, PDF and manifest together; do not edit only one artifact.

## Evidence and limits

Desktop screenshots captured during this run: `/tmp/first-ten-release-demo-desktop.png` and `/tmp/first-ten-release-auth-desktop.png`. These are local QA evidence, not student data or a study result.

No mobile viewport sweep, full keyboard/accessibility audit, screenshot comparison across browsers, complete saved-work journey, new-account flow, paid AI request, PDF rendering review or public pitch inspection was performed. **WEB-005 remains incomplete/in progress; this desktop slice does not close its broader checks.** Keep current user-research, class-sharing and platform-admin gates unchanged.
