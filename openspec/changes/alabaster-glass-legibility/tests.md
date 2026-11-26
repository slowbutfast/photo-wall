## Automated Tests

Runner: `npx vitest run` (Node environment). For narrow loops, run the specific file.

- `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts` is a new source-text audit. It reads `src/styles/wall.css` with `readFileSync` the way `touchAudit.test.ts` does, and imports `PLAYGROUND_THEMES`.
  - **Alabaster glass ink:** `glassInk === '#F4F6F4'`, `glassCap === 'rgba(240, 244, 241, 1)'` and `glassShadow === 'none'`.
  - **Other moods unchanged:** the Chiaroscuro and Concrete `glassInk`, `glassCap` and `glassShadow` equal their current literals.
  - **Shared Alabaster plate:**
    - exactly one Alabaster `.mat-acrylic` rule exists outside any `@media`, with the three `rgba` stops `0.78 / 0.74 / 0.78`;
    - no Alabaster `.mat-acrylic` rule exists inside `@media (pointer: coarse)`;
    - the coarse generic rule still sets `backdrop-filter: none`.
  - **Contrast floor:** for each mood, every plate stop is alpha-composited over that mood's `wallBase`. Each text line is then measured at its rendered opacity, with title and caption at 1, track name at 0.92 and meta/timecode at 0.72. The opacities are parsed from the `.playground-wall-root .placard-meta`/`.placard-track-name`/`.placard-timecode` rules. Every WCAG ratio must be at least 4.5.
    - Alabaster uses the new unconditional rule.
    - Chiaroscuro and Concrete use the desktop base `.mat-acrylic` rule, plus the coarse Concrete rule for Concrete-on-phone.
  - **Regression guard for the bug:** the same contrast function, fed the pre-change Alabaster ink (`#1D1E1C`) and the old coarse plate, returns less than 4.5. This proves the test can fail.
  - **Dead selectors gone:** `wall.css` contains no `[data-material`.
  - **Footer kept:** `.playground-wall-root .placard-soundtrack` still declares `border-top`. `AlbumPlacard.tsx` still renders `placard-track-name` and `placard-timecode`.
- `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts` must stay green unchanged.
- **Full gates:** `npx vitest run` (the serialized full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`.
- **Desktop parity:** build pre-change (`b3cceff`) and head, and serve both on local dev (`STORAGE_DRIVER=local`). Use Playwright at a fine pointer, 1440×900, with `?demo=4&mood=<m>`. Set the placard material through `localStorage['photo-wall:placard-material']` for each of `acrylic`, `aluminum` and `foamcore`, then run the matrix:
  - **Chiaroscuro and Concrete × every material, and Alabaster × `aluminum`/`foamcore`:** expect 0 differing pixels and identical `.museum-placard` computed styles.
  - **Alabaster × `acrylic`:** expect a difference confined to the placard boxes. Record the computed `color`, `text-shadow`, `background-image` and `backdrop-filter` for `.placard-title`, `.placard-caption`, `.placard-meta`, `.placard-track-name` and `.placard-timecode`. Crop and save before/after placard images.
  - **Alabaster × `acrylic` on coarse emulation** (`hasTouch`, `isMobile`, 393×852): record the same computed styles. `background-image` must equal desktop's, and `backdrop-filter` must be `none`.
  - **Pixel sample:** sample the plate pixel next to the timecode in the Alabaster desktop screenshot and record the measured contrast of the timecode glyph colour against it. This resolves the research.md spot-lit-wall assumption.

## Manual Verification

Use local dev on the LAN (`next dev -H 0.0.0.0`, local DB, `STORAGE_DRIVER=local`) or read-only viewing of the preview. Use a real iPhone (Safari) and a desktop browser.

- **Alabaster legibility:**
  - **WHEN** you open `?demo=4&mood=alabaster` with Beveled Glass and look at a placard whose album has a soundtrack
  - **THEN** the title, caption, track name and `0:00 / 1:47` read crisply in light ink, with no halo, edge vibration or blur at the timecode size
- **Footer crowding:**
  - **WHEN** you look at the soundtrack footer above the two standoff pins
  - **THEN** record whether it still reads as crowded. If it does, note it as a follow-up (more bottom padding). Don't change it in this change.
- **Other moods:**
  - **WHEN** you switch to `?mood=concrete` and `?mood=chiaroscuro`
  - **THEN** the placards look exactly as in production
- **Other materials:**
  - **WHEN** you switch Curator Settings to Brushed Aluminum, then to Archival Foamcore, in Alabaster
  - **THEN** both look exactly as in production
- **Marquee:**
  - **WHEN** you play a soundtrack whose track line overflows
  - **THEN** the ticker scrolls with its edge fades intact, in light ink
