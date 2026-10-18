# First Ten brand directions

**BR-001 decision, 2026-10-17: select A — Field notebook.** The owner authorized autonomous selection for tomorrow’s Babson workshop. This chooses a visual direction; it does not claim research validation, Babson endorsement or implementation in the app. BR-002 owns the theme integration.

Open [the interactive study](previews/index.html), choose A or B, and switch light/dark. Each direction shows the same hero, mobile interview and lesson card so the visual comparison does not depend on different copy. The examples use the clearly fictional StudyLoop case from [the pitch brief](../demo/babson-pitch-brief.md). No account, database write or AI call is involved. Notes exist only in the preview page and disappear on reload.

To serve the study locally:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/brand/previews
```

Then open `http://127.0.0.1:8766`. It also opens as a local HTML file. Google Fonts supplies the two families already used by the app; system sans-serif fallbacks remain declared if those requests fail. The preview is standalone and does not require a product build.

## Two directions

|              | A — Field notebook, selected                                                  | B — Learning ledger                                                                  |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Character    | Curious, human, practical                                                     | Precise, composed, analytical                                                        |
| Palette      | Pine ink, warm paper, sage surfaces, ochre decisions                          | Indigo ink, cool paper, blue surfaces, apricot decisions                             |
| Shape        | Small notebook mark, a ruled source sheet, softly rounded working cards       | Squarer panels, restrained rules, numbered records                                   |
| Hierarchy    | People's words lead to an explicit next move                                  | A clear sequence of records leads to an explicit next move                           |
| Founder fit  | Makes a conversation feel approachable                                        | Makes a working record feel organized                                                |
| Educator fit | Familiar to fieldwork, reflection and discussion                              | Familiar to assessment and structured review                                         |
| Tradeoff     | Can become nostalgic or decorative if overdone; keep rules and shadows sparse | Can feel like an administrative dashboard; keep evidence and people ahead of metrics |

The notebook fits the [values charter](../company-values.md) most closely. A source quote has generous space, a counterexample remains visible, and an ochre card marks a decision rather than a victory. The mark suggests a place to record and reconsider. Warm paper supports a calm working context without using a university seal, institutional color claim, robot imagery or a glowing AI motif. The ledger is a credible alternative, but its stricter grid contributes less warmth to the first conversation.

The lesson specimen makes the requested pedagogy visible: experiential learning through pair interviews, scaffolded prompts, student-written interpretation before AI, formative peer challenge, reflection and revision, and responsible AI as a source of alternatives. Its Next 50 $0 marketing-lab concept connects channel mapping, content and funnel learning. These are design and teaching intentions, not measured learning gains or a claim that the planned lesson product is shipped.

Both directions preserve the same commitments: people decide; AI drafts are labeled; a refusal can be useful evidence; saved/error states describe actual system outcomes when implemented. Neither direction uses a success score, trophy, fabricated testimonial or acquisition guarantee.

## Semantic palette

[The exact token file](previews/tokens.json) owns all four preview palettes. These are opaque sRGB colors; avoid opacity modifiers on text, controls or semantic pairs without recalculating the blended contrast. [Generated theme CSS](previews/themes.css) is derived from those tokens.

| Role                     | Notebook light        | Notebook dark         | Ledger light          | Ledger dark           |
| ------------------------ | --------------------- | --------------------- | --------------------- | --------------------- |
| Background / main text   | `#F7F5EC` / `#173D35` | `#102820` / `#F7F5EC` | `#F3F5FA` / `#252C47` | `#171D32` / `#F3F5FA` |
| Card                     | `#FFFEF9`             | `#17382E`             | `#FFFFFF`             | `#202A43`             |
| Primary / on-primary     | `#245B49` / `#FFFFFF` | `#A9D4B6` / `#102820` | `#354F88` / `#FFFFFF` | `#B8C9F0` / `#171D32` |
| Muted surface / text     | `#EAEDE3` / `#53665C` | `#284D3D` / `#B8CABB` | `#E7ECF6` / `#57617D` | `#303D5E` / `#C0C8DB` |
| Secondary / on-secondary | `#DFEADF` / `#24483A` | `#284D3D` / `#DCEADD` | `#E3EAF7` / `#354F88` | `#303D5E` / `#E3EAF7` |
| Decision accent / text   | `#F2CB6B` / `#443516` | `#F2CB6B` / `#443516` | `#FFD3A6` / `#593819` | `#FFD3A6` / `#593819` |
| Draft / text             | `#F7E6B2` / `#63490B` | `#594920` / `#FFE5A3` | `#FFF0C2` / `#654A0C` | `#574923` / `#FFE9AB` |
| Saved / text             | `#DFEADF` / `#20543D` | `#244A36` / `#BDE5BE` | `#E0EEE8` / `#25543F` | `#274A3D` / `#C1E4D0` |
| Error / text             | `#FBE4DF` / `#9B3324` | `#57332E` / `#FFD2C7` | `#FBE4DF` / `#9B3324` | `#57332E` / `#FFD2C7` |
| Control outline          | `#718479`             | `#839C89`             | `#7F8BA8`             | `#8799BF`             |
| Focus ring               | `#A44426`             | `#F2CB6B`             | `#A24E1D`             | `#E3B78D`             |
| Decorative separator     | `#BCC6B9`             | `#456353`             | `#B8C3D8`             | `#4B5B7A`             |

A low-contrast decorative separator must not be the only indication of an input or selected state. Use the stronger control outline for inputs, text plus icon for states, and an underline or shape alongside color for links and selections. The amber decision accent never means validated or successful.

## Typography, layout and behavior

- **Display:** existing Bricolage Grotesque, weight 700–800. Hero 48–80 px depending on viewport; section headings 30–34 px; interview question 25 px with a 1.2 line height. Avoid a long sentence in oversized display type.
- **Reading and controls:** existing Figtree, weight 400–700. Body 17 px with a 1.55 line height; introduction 19–20 px; input 16 px; supporting text generally 13–15 px. Labels carrying fictional, draft or proposed meaning stay at least 12 px. Do not shrink body text to make a layout fit.
- **Measures:** reading copy around 35–65 characters per line; single interview card at most 390 px; desktop content at most 1280 px. At 680 px and below, columns stack in the same reading order. At 320 px the content still fits without horizontal scrolling.
- **Spacing:** use a 4 px base with 8/12/16/24/32/48/64 steps; cards generally 24 px padding, reduced to 18–22 px on narrow screens. Keep labels attached to controls. Default radii: 6–8 px controls, 14 px cards; modest notebook shadow, no floating glow.
- **Targets and focus:** preview controls and navigation links have a minimum 44 px target height, with main actions 48 px. Use a 3 px visible focus outline and 4 px offset; let it extend beyond the component rather than clipping it. Mobile inputs remain 16 px. Keep a skip link, semantic heading order, visible labels and keyboard-operable theme/direction controls.
- **Motion:** the preview has no decorative animation or automatic motion. Implementation may use short opacity/color transitions up to 150 ms; no bounce, parallax or continuous pulsing. Disable transitions/animations and smooth scrolling for `prefers-reduced-motion: reduce`.
- **Themes:** both light and dark have explicit colors and `color-scheme`. Light is the selected presentation default. Dark is supported by this preview; the product must not offer a dark-mode claim until BR-002 checks actual routes, components, forms and overlays with it.
- **State language:** saved requires confirmed persistence; pending says “Saving…”; failure says what remains available and offers a next action. Draft, saved and error states carry text and symbols. The preview state strip is explicitly illustrative and never announces a real save.

## Contrast and readability verification

Run `node docs/brand/previews/contrast.mjs` for the check, or append `--write` to regenerate theme CSS and [the complete results table](previews/contrast-results.md). The calculation converts the exact sRGB channels to relative luminance and compares unrounded ratios. Black/white and identical-color reference checks run first.

**76 pair checks passed, zero failures.** Normal text is checked at 4.5:1 even where large-type exceptions could apply. Focus and control boundaries are checked at 3:1. These targets follow W3C's explanations for [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). This is a palette check, not a complete accessibility certification.

For the selected light direction: body on paper is **10.95:1**, muted text on paper **5.62:1**, primary button **7.87:1**, error text **5.97:1**, input boundary on card **3.94:1**, and focus ring on card **6.06:1**. Dark body on background is **14.28:1** and dark primary button **9.49:1**. The minimum text ratio across the four palettes is **5.18:1**; the minimum measured non-text ratio is **3.12:1**.

Browser review on 2026-10-17 used Chrome at desktop, 390 × 844 and 320 × 740 sizes. The two directions and both theme controls rendered; the mobile interview, lesson and example states remained readable. At 390 and 320 px, document scroll width equaled viewport width. A keyboard Tab from notes reached Back with a computed solid 3 px focus outline. Fonts reported loaded. Static screenshots: [selected desktop](previews/notebook-desktop.png), [selected mobile interview](previews/notebook-mobile.png), [alternative desktop](previews/ledger-desktop.png).

No participant usability test, screen-reader audit, 200%/400% browser-zoom audit or real projector check was performed. Recheck those alongside live route integration. Projector appearance depends on the room and equipment; use the light theme and avoid relying on subtle rules to convey meaning.

## BR-002 handoff

Adopt notebook tokens through the existing semantic CSS variables; preserve the app's font imports and component APIs. Inspect actual uses of foreground/background utilities before mapping names: these preview `success` and `destructive` values are **container backgrounds**, while `success_foreground` and `destructive_foreground` are their text colors. Existing `.text-success` or `.text-destructive` uses need an appropriate standalone text token; do not turn them into pale text by copying names blindly. Audit opacity modifiers, hover/disabled states, charts and gradients separately.

Apply the visual rules to the hero, authenticated shell and common cards/buttons/inputs before expanding the surface area. Preserve keyboard behavior, saved-data rules, stage logic and uncertainty labels. A dark theme requires full component token coverage, including popovers and sidebars. Keep the previous theme available as a normal revert commit if readability regresses. BR-003 owns wider voice and state-copy review; WEB/EDU tasks own production content and teaching materials.
