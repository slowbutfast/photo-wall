## Why

Pinching across the macro↔album **zoom tier** boundary swaps every visible island between a `MacroIsland` canvas mosaic and the full `AlbumTier` DOM in a single frame, at a single scale (`scale < 0.25`, `zoomTier.ts:88-91`). The maintainer's recording shows three problems:

- **Oscillation.** The tier toggles back and forth when a pinch is held near the threshold.
- **Footprint mismatch.** A pale translucent square becomes a dark glass placard with a soundtrack cover beneath it.
- **A hard cut.** The swap happens in one frame.

This change fixes the first two. They're deterministic and verifiable in Chromium, which the hard-cut fade (slice 3) is not.

## What Changes

**Tier hysteresis** (slice 1)
- Islands **promote** from `macro` to a detail tier at `scale ≥ MACRO_PROMOTE_SCALE` (`0.25`, unchanged).
- They **demote** to `macro` only at `scale < MACRO_DEMOTE_SCALE` (`0.22`).
- Inside the **hysteresis band** `[0.22, 0.25)`, the **committed tier** is kept.
- `resolveZoomTier(scale, printFocused, previous?)` gains an optional `previous` argument. Without it, behaviour is exactly today's.
- `GalleryCanvas` keeps the committed tier in a ref that the camera rAF loop writes, and both tier call sites pass it as `previous`.

**Macro mosaic footprint parity** (slice 2). `MacroIsland` stops painting the pale `rgba(226,242,234,0.18)` square and paints instead:
- a **placard plate** at `grid.placard`, filled with the live placard material's background for the current mood and pointer type;
- **greeked lines** for the title and, when the album has a description, the caption (bars only, no `fillText`);
- a **soundtrack slot** at `grid.soundtrack` (the `#161616` plaque base), only when the album has a soundtrack.

The colours come from a pure **mosaic palette**:
- mirrored into `PlaygroundTheme` (acrylic per mood and pointer type), plus fixed aluminum and foamcore fills;
- included in the mosaic cache signature, so changing mood, material or pointer type repaints the mosaics through the existing replace-and-defer-disposal path;
- guarded by a source-text audit against `wall.css`.

**Out of scope:**
- the per-frame text and cover fade (slice 3, a separate change after device verification);
- dual-mount crossfade;
- pre-mounting `AlbumTier`;
- painting soundtrack thumbnails at macro.

No **BREAKING** changes: `MACRO_SCALE_THRESHOLD` stays exported as `0.25`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instanced-photo-renderer`:
  - The macro tier requirement changes from a single `scale < 0.25` cut to promote at `0.25` and demote below `0.22`, with a hold band between.
  - A new requirement: the macro mosaic reserves the album tier's placard and soundtrack footprint in the live material's colours.

## Impact

- **Code:**
  - `src/components/wall/zoomTier.ts`: thresholds and `resolveZoomTier`.
  - `src/components/wall/GalleryCanvas.tsx`: the committed tier ref, both tier call sites, and the `MacroIsland` props.
  - `src/components/wall/macroMosaic.ts`: the plan gains `soundtrack` and `placardLines`.
  - `src/components/wall/MacroIsland.tsx`: the palette, the painter and the signature.
  - `src/lib/lighting/playgroundTheme.ts`: a `macroPlate` field per mood.
- **Tests:**
  - extended: `zoomTier.test.ts`, `macroMosaic.test.ts`, `MacroIsland.test.tsx`;
  - new: `src/lib/__tests__/macroPaletteAudit.test.ts`.
- **Visual:**
  - Overview and macro islands change look: dark plates and soundtrack slots in place of pale squares.
  - Album and Print tiers are unchanged at rest; desktop parity is 0 px outside the placard and soundtrack rects.
- **Performance:**
  - The detail tier is held down to scale `0.22` while zooming out: about 29% more visible islands mounted at the demote point than at `0.25` today. Measured in the tests.
  - Painting cost per mosaic is unchanged in order: a few extra `fillRect` calls, `O(N)` `drawImage` calls as today.
- **Dependencies:** none.
