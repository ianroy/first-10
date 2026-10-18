# First Ten identity

BR-004 introduces an original **10 + conversation** mark. A firm numeral one sits beside a rounded zero with a short speech tail. The name remains the strongest signal at small sizes; the conversation detail connects it to listening and learning. A warm tail adds character without gradients, glow or decoration that disappears in a browser tab.

The mark is drawn directly as SVG paths. The wordmark uses Bricolage Grotesque 700, matching the existing display face, with outlined letterforms so slides, screenshots and exports do not depend on web fonts. No image-generation model or paid API was used.

## Pick an asset

All runtime paths below begin at the site root. Their source files live in `public/`.

| Asset                                                                              | Use                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/brand/wordmark.svg`                                                              | Pine lettering and terracotta tail on paper or white; default landing/deck identity |
| `/brand/wordmark-on-dark.svg`                                                      | Ivory lettering and warm yellow tail on pine or another dark surface                |
| `/brand/wordmark-mono.svg`                                                         | One pine ink; print, embossing and simple reproduction                              |
| `/brand/wordmark-mono-inverse.svg`                                                 | One white ink on a dark surface                                                     |
| `/brand/mark.svg`                                                                  | Transparent standalone mark; use where the company name is already present          |
| `/brand/mark-on-dark.svg`                                                          | Transparent inverse-color mark                                                      |
| `/brand/mark-mono.svg`, `/brand/mark-mono-inverse.svg`                             | Single-color mark variants                                                          |
| `/brand/icon.svg`                                                                  | Pine rounded tile, ivory 10 and warm yellow tail; app/avatar use                    |
| `/brand/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-180.png`, `icon-512.png` | Raster icon exports at their named pixel dimensions                                 |
| `/brand/wordmark.png` and matching `-on-dark`, `-mono`, `-mono-inverse` PNGs       | Transparent 1156 × 256 exports for presentation tools                               |

The four wordmarks have a 289 × 64 SVG viewBox; the standalone mark and icon use 64 × 64. Prefer SVG in the website and a supported slide editor. Use PNG when an importer does not preserve SVG geometry/transparency.

## Placement

- Keep at least 8 units of clear space around the 64-unit mark: one eighth of its nominal height. Give the wordmark the same clear space based on its height.
- Use the tile at 16 px only for familiar browser/favicon recognition. Use the transparent mark at 24 px or larger. For an introductory wordmark, use at least 144 px wide; for a projected title, 360 px or wider is a useful starting point.
- Preserve aspect ratio. Do not crop, squeeze, rotate, add shadows, put the pine version on pine, or recolor individual letterforms. Use the supplied inverse variant on dark surfaces.
- Light mark/wordmark ink is `#245b49`, with `#a44426` for the tail. Dark ink is `#f7f5ec`, with `#f2cb6b` for the tail. The favicon tile is `#245b49`, with `#fffef9` and `#f2cb6b`. Monochrome uses `#173d35` or white.
- Use `alt="First Ten"` when the logo is the only company label or home-link content. Use an empty alt when adjacent visible text already says First Ten. Keep the link's focus treatment and sufficient clickable area; the logo artwork alone is not a touch-target specification.

The icon tail is a brand detail, not a status indicator. Product success, warning, draft and error messages still need their own text and semantics.

## Favicon integration

`src/routes/__root.tsx` includes an ICO fallback (16/32/48), a 32 px PNG, a scalable SVG with `sizes="any"`, and a 180 px Apple touch icon. The icon hrefs include `?v=first-ten-1` to refresh previously cached generic favicons. The old `public/favicon.ico` is replaced. The root head also identifies First Ten as the application and uses pine as its theme color.

Root description/Open Graph copy describes conversations leading to an explainable decision. The existing landing route has its own title/description override; that route's copy remains the landing-page task's responsibility. Lovable integration/error-reporting code is preserved.

## Editable sources and provenance

- The mark's three paths and wordmark placement settings are in `/brand/source/mark-geometry.json`.
- `/brand/source/wordmark-editable.svg` retains editable text for design-tool refinement. Install the font when editing that file; use the outlined exports for delivery.
- Bricolage Grotesque comes from the [official Google Fonts source](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque), under its bundled [SIL Open Font License](../../public/brand/source/Bricolage-OFL.txt). The used variable instance has weight 700, width 100, optical size 48. The wordmark is set at 52 units, baseline 49, origin x80 and −0.65 tracking.
- FontTools produced the letter outlines; the bundled Sharp renderer exported the SVGs at 4× for wordmark PNGs and at exact icon sizes. Pillow assembled the multi-size ICO. These are build-time asset operations; no runtime dependency or lockfile changed.

Font source SHA-256: `413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682`.

## Verification and limits

- All delivery SVGs parse and the wordmarks contain only outlined paths, with no external font/image requests. PNGs decode, and the ICO contains 16, 32 and 48 px images.
- TypeScript and scoped ESLint passed. The Vercel production build passed using explicit, non-secret local-only public Supabase placeholders for anonymous rendering. No real account, participant data or AI call was used.
- The actual built SSR page returned the four expected icon links. Each returned HTTP 200 with the appropriate icon/image MIME type. Browser inspection showed all 11 specimen images loaded, including exact 16/32 px renders, transparent/monochrome variants, and a 970 px-wide wordmark. The 320 px viewport had no horizontal overflow.
- The generic `vite preview` command targets an absent `dist/server/server.js` under this Vercel preset. Inspection used a temporary local Bun adapter around the emitted Vercel handler and static output instead; this does not change production code.
- The browser automation extension temporarily badges managed-tab favicons. The unmodified SSR response and displayed icon assets were verified independently. Final deployed-tab acceptance remains the coordinator's release check; this task does not claim a deployment or universal browser-cache refresh.

Open `/brand/preview.html` for the static verification sheet. [Saved desktop evidence](../../public/brand/verification.png) includes small icons and projected wordmarks. A physical projector and OS home-screen installation were not tested.

## Rollback

Revert the BR-004 commit to restore the prior head and icon assets. No application data, schema, authentication or AI behavior depends on this identity change. Keep later landing/deck asset references aligned if reverting after those integrations.
