# Embedded PDF fonts

Noto Sans Regular and Bold, unmodified TTF files, downloaded 2026-10-18 from
the Noto project's archived distribution:

- https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans
- https://github.com/notofonts/noto-fonts/blob/main/LICENSE

Copyright 2018 The Noto Project Authors. SIL Open Font License 1.1; the full
license is included in OFL.txt. The fonts are bundled and subset-embedded in
downloaded PDFs. They are never fetched from an external font provider at runtime.

The export currently supports the bundled Latin, Greek and Cyrillic glyphs.
It does not provide full CJK, Arabic, Hebrew, Indic or emoji coverage, or
bidirectional paragraph layout. Unsupported glyphs and directional controls
block the export with code points and an explanation; they are not silently
replaced with boxes. Source data is unchanged. A reviewed supported alias or
redaction can be used until broader font/layout coverage is implemented.
