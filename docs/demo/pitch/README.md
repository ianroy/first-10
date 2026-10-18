# First Ten workshop pitch

Editable Spaces presentation: **First Ten — Babson teaching and product pitch**.

- Page: `page_984affe9853c8191a5f8caf0d446aba3`
- Artifact: `artifact_external_43c311e5-4001-4eb5-8456-4536a8049edf`
- Nine slides, 1280 × 720; Field notebook colors, editable text and speaker notes.
- [Presenter script](presenter-script.md) and [claim/source map](source-map.md).

## Presentation order

1. Customer conversations. Student decisions.
2. The classroom question: what changed the student's next move?
3. Fictional StudyLoop evidence, counterexample and proposed decision.
4. The Next 50 / $0 Marketing Lab workflow.
5. Six pedagogical concepts with observable student activities.
6. A proposed 60-minute lesson plus one-week follow-up.
7. Current technology and access boundaries.
8. Invitation to explore and adapt.
9. Sources and limits, available as an appendix.

## Release checklist

- [x] Author all slides and inspect the rendered pages for fit and readability.
- [x] Add the original First Ten logo after BR-004 lands.
- [x] Reconcile current/proposed feature labels with the tested release. Slides4/5/7 refreshed after manual Marketing Lab and aggregate admin release; reviewed all changed renders.
- [ ] Rehearse the `/demo` handoff after WEB-002 is deployed.
- [ ] Rehearse the teaching-page link after EDU-002 is deployed.
- [ ] Record actual presentation and fallback timing.
- [x] Verify browser navigation, presentation mode and a self-contained offline companion.

The deck is a draft until those release-dependent checks are complete. It must remain usable as a narrative if the network, sign-in or AI provider is unavailable. The presentation does not require a live AI call. Keep the fictional example labels visible when showing a screenshot or skipping to the demo.

## Static and offline companion

`/pitch/index.html` is a keyboard-accessible presentation companion with visible captions, nine reviewed slide images, a text fallback and a viewport-fitted presentation mode. Its **Download offline deck** link saves a self-contained HTML file with all slide images embedded; no login, provider call, fonts or script CDN is required. Keep the editable Spaces deck as the primary source.

To refresh after live-deck edits, copy its nine reviewed PNG exports to `public/pitch/slides/01.png` through `09.png`, then run `node docs/demo/pitch/build-offline.mjs`. Inspect the changed slides and both the online/offline companion. Do not confuse an old export with the current live artifact.
