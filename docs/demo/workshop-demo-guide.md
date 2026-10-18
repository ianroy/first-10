# Babson workshop demo guide

Use the desktop version at https://first-10-three.vercel.app. The reserved presenter username is `ianroy`; use the password supplied privately by the owner. No credential belongs in this file or in presentation materials.

## Open the three views

1. Open `/auth`. An existing browser session no longer skips the sign-in form.
2. Choose **Student**, **Educator** or **Admin**, enter the presenter login and sign in. When the presenter is already signed in, use **Open student demo**, **Open educator demo** or **Open admin demo**.
3. Each presenter launch selects the seeded StudyLoop workspace. It changes the selected project, not saved database records.

| View                 | What to show                                                                                                                                 | What the audience should understand                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student `/dashboard` | Five fictional conversations, a reviewed learning and a proposed experiment; People, Learnings and Marketing Lab in the sidebar              | The student carries observations and counterexamples into a next decision. Counts alone do not establish demand.                                                                    |
| Educator `/teacher`  | Four authored team examples; inspect a counterexample and next step, then the saved workshop lesson, agenda, rubric and student task preview | The examples make reasoning discussable. They are not enrolled students or live submissions. Capacity 45 is a planning estimate. Feedback practice is temporary, not saved or sent. |
| Admin `/admin`       | Server-verified operational counts and the presenter's contribution                                                                          | These are saved records, including synthetic fixtures. Visits, conversion and retention are explicitly unavailable until instrumented.                                              |
| Account `/account`   | StudyLoop and the fictional CampusSwap second idea; switch and resume                                                                        | Ideas are private and separate. CampusSwap has no inherited interviews or contacts.                                                                                                 |

## Suggested product walkthrough

- Start at the landing page and the no-login `/demo`. Follow the observation → interpretation → counterexample → decision → proposed-test sequence.
- In the signed Student view, show the saved learning and its underlying fictional conversations.
- Open Marketing Lab: **Think first → Map channels → Make content → Plan the test → Review learning**. Show the two channels, access unknowns, honest unsent draft and proposed seven-day test. No experiment outcome is fabricated.
- The content step offers an optional, bounded AI practice draft for the fixed fictional StudyLoop case. Review and question it. It does not read private notes, post, send, or insert itself into the saved plan. The prepared example remains available if the provider fails.
- Open the Educator view to show how an instructor discusses reasoning and prepares a lesson. Do not imply class enrollment, grading, shared submissions or live student monitoring are implemented.
- Finish with the proposed Brandeis classroom pilot and the next evidence to gather: whether students take a useful action, explain their decision and return voluntarily.

## Stage fallback

The public `/demo`, `/teach` and static `/pitch/index.html` do not require sign-in or a live AI request. `public/pitch/offline.html` is self-contained for local presentation. The pitch includes real screenshots of the synthetic workspaces. If sign-in or a provider is slow, use those screenshots and continue the story; do not repeatedly trigger AI calls on stage.

The intended pilot in BUS131 and BUS232 and other fall classes is the owner's go-to-market proposal, not an institution's endorsement or a completed adoption study. The prototype does not prove product-market fit or willingness to pay.
