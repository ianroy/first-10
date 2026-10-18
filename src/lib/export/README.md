# Activity PDF engine (EXP-001)

This foundation generates actual downloadable PDF bytes. It does not acquire
records, authorize classroom access, submit work or wire every activity route.
EXP-002 owns activity adapters and EXP-003 owns complete selected portfolios.

## Integration

Use `ActivityPdfExport` from `@/components/export/ActivityPdfExport` with a
strict `ActivityExportV1` document and `permittedAudiences`. The caller must
read only the authorized owner data or intentionally submitted classroom
snapshot and construct the allowlisted document. `sourceScope` is trusted
adapter metadata, **not proof of authorization in arbitrary JSON**. Never
expose a teacher's broader service client or automatically fetch raw private
interviews. Audience selection cannot grant permission. Private source material
is accepted only for an owner copy; other audiences require submitted snapshots
or fictional examples plus an explicit permitted audience from the adapter.

Keys are globally unique selectors, not rendered IDs. Use descriptive local
keys rather than database identifiers. No account IDs, email fields or arbitrary
metadata are part of the strict schema. Only author-supplied text, scalar fields
and tables are accepted; there is no HTML, URL, image or remote-resource block.
URLs appearing in text are inert and are never fetched or made into PDF links.

```tsx
<ActivityPdfExport document={authorizedActivityDocument} permittedAudiences={["owner"]} />
```

For non-React use, call `freezeActivityExport(input, selection, policy)`, then
`createActivityPdf(snapshot, { fonts })`. Font bytes are optional; browser use
fetches only two fixed same-origin bundled fonts, without credentials or redirects.
An existing trusted server runtime can supply the same bundled font bytes and
make no network request. `createActivityPdf` returns `{bytes, pageCount, filename}`.
`downloadActivityPdf` uses a Blob URL and revokes it after the download begins.

The selected snapshot is detached and deeply frozen. Renderers accept only
snapshots created by this module in the current process. A changed source,
audience, selection or redaction invalidates the UI review; a changed source
or permission also discards a pending PDF before download. There is no browser
storage, autosave, analytics, external renderer or AI call.

## Privacy and meaning

Team alias is omitted by default. All exported text is NFC-normalized and obvious
email addresses and UUIDs are removed; optional exact case-sensitive phrases
become `[Redacted]`. This heuristic is not de-identification certification:
names, phone numbers, contextual identities and unusual address formats require
human review. Free text may contain private information. Downloaded PDFs leave
app access controls and cannot be remotely revoked. No automatic sharing occurs.

`null` prints `Unknown / not recorded`; blank text prints `Not entered`; numeric
0 stays 0; false prints `No`; an empty table prints `No rows recorded`. Each
activity retains draft/reviewed/submitted, fictional, source-updated and snapshot
dates. Draft/fictional reminders and page numbers recur in footers. These labels
describe supplied data, not verified evidence or educational outcomes.

## Rendering and limits

The PDF uses A4 pages, wrapped headings/paragraphs, repeated table headings,
continued long rows, new pages for each activity and a maximum of 120 pages.
The strict schema limits documents to 250,000 serialized characters, 50 activities,
six table columns and 200 rows per table. Select smaller exports for large classes.
Rendering is browser-side and may briefly use the main thread for long documents.

Noto Sans Regular/Bold is bundled under SIL OFL 1.1 (see `public/fonts/pdf`).
Latin, Greek and Cyrillic names are supported. Unsupported scripts, emoji and
directional controls fail with a visible explanation; no silent glyph substitution.
Full multilingual shaping/RTL and tagged PDF/PDF-UA accessibility are not delivered.
The component provides a selectable text preview as an accessible alternative.

Libraries: [pdf-lib](https://pdf-lib.js.org/) 1.17.1 and its fontkit adapter 1.1.1,
both pinned and included through the existing Bun lockfile. They are free local
libraries; generation uses no paid service. No application route is changed here.

## Verification

`npm test -- src/tests/exp-001 --maxWorkers=2` checks actual PDF parsing, long text
and row pagination, supported names, unsupported glyph rejection, inert hostile
strings, fixed font fetches, strict scopes, redaction, unknown/0 semantics, immutable
snapshots, preview invalidation and in-flight source changes. A production build,
typecheck and scoped lint are required at handoff. The QA fixture is entirely
fictional; rendering uses the exact engine and bundled fonts.
