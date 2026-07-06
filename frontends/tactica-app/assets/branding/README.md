# Tactica branding

The brand has three marks:

- **Wordmark** (top bar): a gold crown, letter-sized, leading TACTICA in heavy spaced caps.
- **Ascent** (auth screens): three pawns stepping up, the last one crowned in gold,
  above a welcome heading ("Welcome back" / "Create your account").
- **Coronation** (favicon): a single pawn wearing the gold crown (promotion — where
  good coaching takes you).

Files:

- `coronation.svg` — the crowned-pawn glyph on its own (also the favicon source).
- `../favicon.png` — 64×64 render of the glyph, wired up via `web.favicon` in `app.json`.

In-app, the marks are rendered as components (`src/branding/`) built from shared SVG
strings in `src/branding/logo.ts`, so sizes and ink colors are props; the crown always
stays gold (`BRAND_GOLD`).
