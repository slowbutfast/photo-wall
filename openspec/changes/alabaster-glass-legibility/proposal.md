## Why

The default Beveled Glass placard is hard to read in the `alabaster` mood, which is the daytime and brightest one.

The Alabaster **glass ink** is still dark `#1D1E1C` with a white `0 1px 1px` halo. It was tuned for a pale frosted plate that no longer renders. Meanwhile the live `.mat-acrylic` plate is dark smoked glass in every mood. The result is **1.81:1** title contrast on phones and **3.08:1** on desktop, against WCAG AA's 4.5:1 (research.md, Verified facts).

## What Changes

- **Alabaster glass ink becomes light and loses its halo** (in `PLAYGROUND_THEMES.alabaster`):
  - `glassInk: '#F4F6F4'`
  - `glassCap: 'rgba(240, 244, 241, 1)'`
  - `glassShadow: 'none'`

  Title, caption, meta, track name and timecode all pick this up through the existing `--glass-*` variables.
- **One Alabaster plate for both pointer profiles.** The darker Alabaster plate tint moves out of `@media (pointer: coarse)` into an unconditional mood-scoped rule. Its middle stop goes from 0.70 to 0.74. Desktop and phone then share it, and every text line clears 4.5:1 over the Alabaster **composited plate colour**.
  - Desktop keeps its `backdrop-filter: blur(2.5px)`.
  - The coarse profile keeps `backdrop-filter: none`.
- **Delete the dead `[data-material=…]` rules** (`wall.css:229-322`). No element carries `data-material`. The leftover pale-glass Alabaster rule is what hid this mismatch.
- **Unchanged:**
  - Chiaroscuro and Concrete glass ink, shadow and plate;
  - Brushed Aluminum and Archival Foamcore;
  - the soundtrack footer, its divider, the track marquee and the timecode;
  - placard geometry;
  - the `placardInk` mood token.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `3d-pbr-wall-and-lighting`:
  - **ADDED** "Beveled Glass placard text is legible in every lighting mood": light glass ink, no text-shadow in Alabaster, at least 4.5:1 for every placard text line, and one Alabaster plate shared by both pointer profiles.
  - **MODIFIED** "Offline suncalc NYC solar circadian gallery lighting with per-mood tokens": the Alabaster scenario no longer implies dark ink on the Beveled Glass placard. `#1D1E1C` stays the `placardInk` mood token.

## Impact

- **Code:** `src/lib/lighting/playgroundTheme.ts` (3 values) and `src/styles/wall.css`. That means one new unconditional Alabaster `.mat-acrylic` rule, one coarse-block rule removed, and the dead `[data-material]` block removed.
- **Tests:** a new source-text audit, `src/lib/__tests__/placardGlassLegibility.test.ts`. Existing tests stay unchanged, including `touchAudit.test.ts`.
- **Visual:**
  - The Alabaster Beveled Glass placard changes on every pointer type.
  - Chiaroscuro and Concrete, and every non-glass material, are pixel-identical.
- **No impact on:** data, API, dependencies or storage.
