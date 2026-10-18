# Field notebook tokens

BR-002 applies the selected [Field notebook direction](directions.md) to the shared application theme and common controls. Pine, paper and a warm yellow annotation color support the learning loop: observe, reflect, decide, test. Figtree remains the reading face; Bricolage Grotesque is the display face. These are interface foundations, not claims of pedagogical validation.

## Color contract

The canonical values live in `src/styles.css`. Light is the default; the `.dark` class defines a complete alternate palette. This change does not introduce an application theme switch. The verification fixture has one for inspection.

| Role                    | Light                 | Dark                  | Usage                                                 |
| ----------------------- | --------------------- | --------------------- | ----------------------------------------------------- |
| Canvas / text           | `#f7f5ec` / `#173d35` | `#102820` / `#f7f5ec` | Page surface and reading text                         |
| Card                    | `#fffef9`             | `#17382e`             | Forms, lessons and evidence cards                     |
| Primary / text          | `#245b49` / `#ffffff` | `#a9d4b6` / `#102820` | Principal action; also readable standalone text       |
| Primary hover           | `#1b4939`             | `#c6e5ce`             | Opaque hover color, preserving text contrast          |
| Secondary / text        | `#dfeadf` / `#24483a` | `#284d3d` / `#dceadd` | Supporting actions                                    |
| Secondary hover         | `#d4e2d3`             | `#345d49`             | Supporting action hover                               |
| Muted / text            | `#eaede3` / `#53665c` | `#284d3d` / `#b8cabb` | Secondary copy and disabled controls                  |
| Accent / text           | `#f2cb6b` / `#443516` | Same                  | Annotation and focused options                        |
| Success / text          | `#20543d` / `#ffffff` | `#bde5be` / `#102820` | Filled badge or standalone status text                |
| Success soft / text     | `#dfeadf` / `#20543d` | `#244a36` / `#bde5be` | Success notice surface                                |
| Draft / text            | `#f7e6b2` / `#63490b` | `#594920` / `#ffe5a3` | AI output awaiting review                             |
| Destructive / text      | `#9b3324` / `#ffffff` | `#ffd2c7` / `#102820` | Filled action or standalone error text                |
| Destructive hover       | `#7c291d`             | `#ffe3dc`             | Error action hover                                    |
| Destructive soft / text | `#fbe4df` / `#9b3324` | `#57332e` / `#ffd2c7` | Error notice surface                                  |
| Input boundary          | `#718479`             | `#839c89`             | Editable field boundaries                             |
| Focus                   | `#a44426`             | `#f2cb6b`             | Three-pixel visible outline                           |
| Decorative border       | `#bcc6b9`             | `#456353`             | Card separators; not the sole indication of a control |

Keep `text-success` and `text-destructive` for status text. Their strong tokens deliberately remain readable on paper and cards. Use the `*-soft` pairs for larger notices. Do not replace strong tokens with pale fills: existing routes use them directly as text colors. Popover/sidebar roles alias the same surface and action pairs in each theme.

The legacy `bg-warm` utility now blends primary into primary-hover. It still accepts `text-primary-foreground`, including the dashboard action card. Chart marks have five theme-specific colors tested against the card surface; charts still need labels or shapes to convey their meaning without color.

## Controls and interaction

- Body text uses 16 px with 1.55 line height. Shared input, textarea, select and default button text stays 16 px at all viewport sizes; the small button variant uses 14 px. Page-specific captions can still override this and require their own review.
- Input and select triggers are 48 px high. Default buttons are at least 48 px, small and icon buttons at least 44 px; larger button variants are 52 and 56 px. Labels wrap instead of forcing a fixed height. This does not claim every specialized control in the component library meets the same dimensions.
- Keyboard focus uses a three-pixel solid outline with a three-pixel offset. The unlayered focus rule survives utility outline resets. Input boundaries and focus colors pass the tested non-text contrast threshold on paper and cards.
- Disabled shared fields and buttons use a readable muted pair instead of a translucent opacity layer. Callers remain responsible for actual `disabled`, loading labels and `aria-busy` state. A loading spinner alone does not explain progress.
- Destructive alerts and Sonner notifications use semantic surface/text pairs. Status meaning still requires words and, where useful, an icon; color is supplementary.
- Reduced-motion preferences suppress lengthy transitions and animations and disable smooth scrolling. The change does not add decorative motion.

## Reproduce verification

From the repository root, with installed dependencies:

```sh
bun run test
bun run typecheck
bun run lint
NITRO_PRESET=vercel bun run build
./node_modules/.bin/vite --config src/tests/br-002/vite.config.ts
```

Open `http://127.0.0.1:8767/src/tests/br-002/preview.html`. The fixture renders the actual shared components and stylesheet using fictional examples. It does not load an account, save data or call AI. Toggle both themes, tab through the form, choose a select item with the keyboard, and trigger each example notification. Resize to 390 and 320 px to inspect wrapping.

`src/tests/br-002/contrast.test.ts` reads the production CSS tokens and checks 72 color pairs across both themes: 52 normal-text pairs at 4.5:1 or higher, and 20 boundary/focus/chart pairs at 3:1 or higher. A reference calculation checks black/white and identical colors. The lowest actual text ratios are 5.18:1 light and 5.50:1 dark; the lowest non-text ratios are 3.64:1 light and 4.31:1 dark. These are opaque sRGB calculations, not a blanket accessibility certification.

Verification on this branch: all 24 Vitest tests passed (including five new token tests); TypeScript passed; ESLint passed with six pre-existing warnings; the Vercel build passed. The build retains existing chunk-size, TanStack input-validator deprecation and tsconfig-paths plugin notices. No dependencies or lockfiles changed.

Chrome inspection covered light/dark desktop layouts, 390 px and 320 px widths without horizontal overflow, keyboard select interaction, visible focus, and actual success/error notification colors. Computed input/select heights were 48 px with 16 px type. This is not a complete screen-reader, projector, route-by-route or zoom audit. Route-specific tiny captions and navigation remain follow-up work.

Saved evidence: [light mobile](../../src/tests/br-002/screenshots/light-mobile.png), [dark desktop](../../src/tests/br-002/screenshots/dark-desktop.png).

## Rollback

Revert the BR-002 commit to restore the prior shared theme and controls. This change has no database migration, saved-data format change, provider call or application behavior dependency.
