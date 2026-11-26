## MODIFIED Requirements

### Requirement: Offline suncalc NYC solar circadian gallery lighting with per-mood tokens
The gallery SHALL automatically compute NYC (`40.7128, -74.0060`) solar moods using offline **`suncalc`** in SSR and a 60-second local timer (`alabaster` from `sunrise + 90m` to `goldenHour`, `concrete` from `dawn` to `sunrise + 90m` and `goldenHour` to `dusk`, `chiaroscuro` from `dusk` to `dawn`) with a **60-second smooth crossfade** when crossing a boundary and explicit per-mood render tokens (`ambientLevel`, `spotIntensity`, `poolAlpha`, `shadowOpacity`, `placardInk`). Public visitors SHALL have no manual mood override; dev/admin mode SHALL provide a client-local-only Lighting Preview selector inside the Curator Drawer. The `placardInk` mood token SHALL NOT determine Beveled Glass (`.mat-acrylic`) placard text colour; that colour comes from the playground theme's glass ink (`glassInk`, `glassCap`, `glassShadow`) as defined by "Beveled Glass placard text is legible in every lighting mood".

#### Scenario: Public visitor sees NYC solar mood without network requests or manual override
- **WHEN** a public visitor opens the gallery while NYC is in daytime (`sunrise + 90m` to `goldenHour`)
- **THEN** the SSR and client SHALL compute `alabaster` identically via `suncalc` with zero external solar API calls, a `placardInk` mood token of `#1D1E1C`, and SHALL NOT expose a manual `Mood` button in the HUD

#### Scenario: March and November DST transitions select the correct solar mood
- **WHEN** `determineAutoMood(date)` is evaluated across March spring-forward and November fall-back DST dates in `America/New_York`
- **THEN** solar boundaries SHALL remain aligned to UTC `suncalc` timestamps without off-by-one-hour drift

## ADDED Requirements

### Requirement: Beveled Glass placard text is legible in every lighting mood
The Beveled Glass placard (`.playground-wall-root .museum-placard.mat-acrylic`) SHALL render its title, caption, meta, track name and timecode in light glass ink on its dark smoked plate in every lighting mood (`chiaroscuro`, `concrete`, `alabaster`), on both `(pointer: fine)` and `(pointer: coarse)`.

- **Alabaster glass ink:** `PLAYGROUND_THEMES.alabaster` SHALL set `glassInk: '#F4F6F4'`, `glassCap: 'rgba(240, 244, 241, 1)'` and `glassShadow: 'none'`. No Beveled Glass text in Alabaster SHALL carry a text-shadow, light halo or stroke.
- **Shared Alabaster plate:** a single unconditional mood-scoped rule SHALL give the Alabaster Beveled Glass plate the gradient `linear-gradient(138deg, rgba(30, 36, 33, 0.78) 0%, rgba(22, 27, 24, 0.74) 55%, rgba(34, 40, 36, 0.78) 100%)` on both pointer profiles. `@media (pointer: coarse)` SHALL NOT redefine the Alabaster plate background. Desktop SHALL keep its `backdrop-filter: blur(2.5px)`, and the coarse profile SHALL keep `backdrop-filter: none`.
- **Contrast floor:** every Beveled Glass text line, at its rendered opacity (`.placard-meta` and `.placard-timecode` at `0.72`, `.placard-track-name` at `0.92`), SHALL reach a WCAG 2.x contrast ratio of at least **4.5:1** against every gradient stop of its mood's plate, alpha-composited over that mood's `wallBase`.
- **Unchanged surfaces:**
  - Chiaroscuro and Concrete glass ink, shadows and plates;
  - Brushed Aluminum (`.mat-aluminum`) and Archival Foamcore (`.mat-foamcore`);
  - the soundtrack footer, its divider, the track marquee and the timecode;
  - placard geometry.

  All of these SHALL be unchanged.
- **No dead material selectors:** `src/styles/wall.css` SHALL contain no `[data-material=…]` selectors, because no rendered element carries that attribute.

#### Scenario: Alabaster Beveled Glass title is light with no halo
- **WHEN** a placard with the default Beveled Glass material renders in `alabaster` on any pointer type
- **THEN** `.placard-title` SHALL compute `color` `rgb(244, 246, 244)` and `text-shadow: none`, and caption, meta, track name and timecode SHALL compute `color` `rgb(240, 244, 241)` and `text-shadow: none`

#### Scenario: Every Beveled Glass text line clears 4.5:1 in every mood
- **WHEN** each mood's glass ink, at each line's rendered opacity, is measured against each of that mood's plate gradient stops composited over its `wallBase`
- **THEN** every ratio SHALL be at least `4.5:1`, including Alabaster `.placard-meta` and `.placard-timecode` at opacity `0.72`

#### Scenario: Desktop and phone share the Alabaster plate tint
- **WHEN** an Alabaster Beveled Glass placard renders on `(pointer: fine)` and on `(pointer: coarse)`
- **THEN** both SHALL compute the same `background-image` gradient, desktop SHALL compute `backdrop-filter: blur(2.5px)`, and coarse SHALL compute `backdrop-filter: none`

#### Scenario: Other moods and materials are pixel-identical
- **WHEN** desktop parity screenshots are taken before and after this change for `chiaroscuro` and `concrete` with Beveled Glass, and for every mood with Brushed Aluminum and Archival Foamcore
- **THEN** they SHALL show zero differing pixels

#### Scenario: Soundtrack footer is kept
- **WHEN** an album with a soundtrack renders its Beveled Glass placard in `alabaster`
- **THEN** `.placard-soundtrack` SHALL still render its divider, its `.placard-track-name` line and its `.placard-timecode`, at the same geometry as before this change
