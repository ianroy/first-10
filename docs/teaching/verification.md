# Teaching kit verification

EDU-001 · 2026-10-18 · kit version 1.0 · source baseline `d6931694d43d04b0bfdb78dafe1c3ba035366c3d`.

## Content review

The 60-minute guide uses the pitch's 10/20/20/10 timing. Students preserve their own structure before seeing scaffolds or choosing optional AI. Four named fictional StudyLoop sources include Nora's counterexample. The instructor reveals model reasoning only after students choose. The one-week assignment uses two specific routes, a truthful asset/destination/action, time/resource limits, manual measures and repeat/revise/stop reflection. Field outcomes remain unknown until actually observed. No real interview, classroom delivery, completed test, adoption or learning gain is claimed.

The four-criterion rubric assesses question quality, source versus interpretation, revision/decision and participant respect. It excludes customers, network, spending and AI usage. Paper, accessible text, dictation, oral work, self-check and a private/simulated alternative are supported without changing the reasoning criteria. This review is not a screen-reader audit or an accessibility certification.

The six concept names match the [pedagogy map](pedagogy-map.md). Source attribution includes the owner's BUS131 Week 6 page references and the Babson/EEF primary sources with their applicability limits. No institutional endorsement is implied. The app link is the recorded production URL; its live availability was not established in this check. App feature status is tied to the source baseline and must be checked before class.

## Rendering checks performed

- Rendered the self-contained HTML in Google Chrome 155.0.8059.85 with isolated temporary profiles, no product server or account.
- Printed A4, 100% scale, browser headers/footers off: exactly **9 pages**, each with the correct numbered footer; no blank or overflow pages. Inspected all pages as rendered PNGs, including the dense guide and rubric at higher resolution. The committed PDF is that browser output.
- Inspected the desktop document at 1440 × 1100 and mobile emulation at 390 × 844. Mobile document/client widths both measured **390px**; no page-wide horizontal overflow. All nine tables scroll within their own 332px containers and have keyboard-focusable regions. Inspected the mobile table and text layouts visually.
- PDF links contain no local `file:` targets. The printable document needs no external font, image, script, AI or network resource to render. External reference links are optional.
- Checked local Markdown links, manifest resource paths and HTML anchors; verified the Python renderer is deterministic and parses successfully. Formatting and `git diff --check` passed.

Browser rendering used temporary files outside the repository. No application build, paid API call, participant contact, real student upload or deployment was performed for this task. Human delivery and educator feedback remain future work.

## Reproduction and artifact fingerprints

Run `python3 docs/teaching/build-kit.py`. Open [the HTML](../../public/teaching/first-ten-teaching-kit.html), print using its stated settings, replace [the PDF](../../public/teaching/first-ten-teaching-kit.pdf), render all pages and inspect again. Editable sources and download metadata are listed in [the kit index](README.md).

- HTML SHA-256: `fd4376025852214b6567426bd6df3165876699194dfbb88366cc1f6e8ec420fc`
- PDF SHA-256: `8a9a04a029a909431b9153bce173fb97d265fbdd3c208d021d60878f99d5d402`

Regeneration refreshes HTML only. Re-export and recheck the PDF after source/layout changes; these fingerprints describe the reviewed version, not a permanent guarantee.
