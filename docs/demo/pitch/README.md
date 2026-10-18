# First Ten workshop pitch

Editable Spaces presentation: **First Ten — Babson teaching and product pitch**.

- Page: `page_984affe9853c8191a5f8caf0d446aba3`
- Connected artifact: `artifact_external_9b2807b9-fea3-4aba-9682-f6d83e0f32fa`
- Thirteen slides, 1280 × 720, original First Ten logo and Field notebook palette.
- Native editable slide text, market and adoption diagrams, and source-bearing speaker notes. Slide 10 uses the owner-requested architecture illustration with editable exact model IDs.
- [Presenter script](presenter-script.md) and [claim/source map](source-map.md).

## Presentation order

1. First Ten, all six makers and Babson workshop context.
2. The teaching problem: approaching people and facing uncertain demand.
3. The solution: real conversations, features and bounded tests.
4. Value proposition: a clearer next move using fictional StudyLoop.
5. Qualitative market positioning against MIT Orbit / AI JetPack, Venturekit and facilitated alternatives.
6. Student workspace, actual deployed screen.
7. Saved manual $0 Marketing Lab, actual deployed screen.
8. Educator planner and fictional class preview, actual deployed screen.
9. Protected aggregate admin view, actual deployed screen.
10. Owner-requested architecture illustration, private data boundary, AI gateway, exact model IDs and the owner-stated pedagogy moat.
11. Six named pedagogical concepts with student activities.
12. Editable Crossing the Chasm adoption curve and planned timeline: October 2026 tests, November–December refinement, Spring 2027 release target of ten schools represented at the workshop.
13. Questions and founding-partner ask, verified QR and two semesters free offer.

## Delivery and fallback

`/pitch/index.html` presents the thirteen reviewed slide exports with keyboard navigation, readable captions, a text fallback and a viewport-fitted presentation mode. **Download offline deck** saves a self-contained HTML file containing every slide image. Its presentation works without login, a provider call, fonts or a script CDN. Live app and full-page capture links still require a connection.

The four full-page screenshots under `public/pitch/demo/` show the deployed app using the synthetic presenter. They contain authored fictional data. The tall educator page also has a readable viewport image for projection; its full-page capture remains available beside the slide and in the companion link. Do not interpret the planned capacity or fictional team examples as enrollment or live submissions.

The main lab saves manual work. Optional presenter-only AI practice now has one verified production response using a fixed fictional case. It is not necessary for the pitch, does not send private project input and does not enable general marketing AI. No live generation should be attempted as a requirement of the presentation.

## Refresh workflow

Keep the native Spaces deck as the primary editable source. `rebuild-live.mjs` exports its authorized thirteen-slide rebuild callback; run it inside the existing Artifact Session in small batches, using the current connected artifact reference. It is not a separate local deck generator. Inspect all rendered slides after any change.

Copy current session renders and update accessible captions:

```sh
node docs/demo/pitch/refresh-companion.mjs '/absolute/path/to/session/exports'
node docs/demo/pitch/build-offline.mjs
```

The first command copies `slide-1.png` through `slide-13.png` to `public/pitch/slides/01.png` through `13.png`. Then inspect the browser companion and offline file, including Home/End, arrow navigation and presentation mode. A previous render is not evidence of the current native deck.

The sources and limits remain in native speaker notes and the [source map](source-map.md). This presentation reports a working prototype and proposed classroom use, not verified demand, product-market fit, learning gains or institutional endorsement.

## Founding-partner QR

The final-slide QR encodes `https://first-10-three.vercel.app/founding-partners`. It has a white four-module quiet zone and is placed at 320 × 320 slide pixels. `build-qr.swift` uses macOS Core Image to generate it and Vision to decode and verify the exact URL. Rebuild on macOS with `swift docs/demo/pitch/build-qr.swift public/pitch/founding-partners-qr.png`. The offer of two semesters free is supplied by the owner; the ten-school target remains separate from confirmed partners.
