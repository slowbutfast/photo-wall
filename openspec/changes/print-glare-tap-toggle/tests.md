## Automated Tests

Runner: `npx vitest run`. Try `safe-test` first, and fall back to the direct serialized command if it aborts on WebAssembly.

- **`npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts` (extended):** source audit of `wall.css`, reusing its rule parser.
  - Exactly one rule's selector contains `[data-glare='off'] .photo-sheen`. It sits inside an `@media (pointer: coarse)` prelude and declares `--sheen-strength: 0`.
  - No rule outside a coarse prelude mentions `data-glare` or `.glare-hint`. Either the hint rules are coarse-gated, or the hint is hidden on fine pointers by a rule that is.
  - The existing assertions (`--sheen-strength: 0.8` declared once on `.playground-wall-root`, the anchor rules) are unchanged.
  - **Can-fail guard:** an in-memory copy with the new rule moved out of the media block must fail the coarse-gating matcher.
- **Store test** (`src/store/__tests__/glareToggle.test.ts` `[NEW]`):
  - `glareOff` defaults to `false`.
  - `toggleGlare()` flips it and increments `glareToggleCount`.
  - `enterPrint`, `enterAlbum`, `goOverview` and `stepPhoto` leave `glareOff` unchanged.
  - The manifest reset path leaves it unchanged.
- **`FramedPrint` tap test** (`src/components/wall/__tests__/FramedPrintGlareTap.test.tsx` `[NEW]`, jsdom with a `matchMedia` stub):
  - **Coarse:** a click on a frame with `tier='print'` and `focused` calls `toggleGlare` once, doesn't call `onSelectPhoto`, and still calls `requestGyroPermission`.
  - **Coarse, `focused=false`:** calls `onSelectPhoto`, not `toggleGlare`.
  - **`wasDragged()` true:** neither is called.
  - **Fine pointer, focused print:** `onSelectPhoto` is called (the old behaviour) and `toggleGlare` isn't.
- **`GalleryCanvas` attribute and hint:**
  - Preferred: a source audit, in the style of the existing `galleryTierCommit` audit, that `data-glare` is bound to the `glareOff` selector on the `containerRef` element.
  - If `GalleryCanvas` can't be rendered headlessly, extract a pure `glareHintText(count, glareOff)` and table-test it:
    - `(0, false)` gives `null`;
    - `(1, true)` gives `Glare off · tap photo to restore`;
    - `(2, false)` gives `Glare on`;
    - `(3, true)` gives `Glare off`.
- **Guard group** (must stay green and unchanged):
  - `touchAudit.test.ts`
  - `cssBoundaryAudit.test.ts`
  - `wallCanvasDpr.test.ts`
  - `cameraMath.test.ts`
  - `islandLayout.test.ts`
  - the PrintSharpOverlay sync tests
- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **Playwright (coarse emulation, 393×852, `hasTouch`, `isMobile`, local dev `?demo=4`):**
  - Enter Print Focus, then tap the focused print.
  - Assert that `.wall-viewport[data-glare=off]` exists, and that `getComputedStyle(.print-sharp-overlay .photo-sheen).getPropertyValue('--sheen-strength')` and the frame sheen's value are both `0`.
  - Tap again: the attribute is gone and the value is `0.8`.
  - **Fine pointer (1440×900):** computed styles of `.photo-frame`, `.photo-sheen` and `.print-sharp-overlay` are identical to base `5188316` at rest and on a focused-print click.

## Manual Verification

Use an iPhone (Safari, portrait) on local dev over the LAN (`next dev -H 0.0.0.0`, `STORAGE_DRIVER=local`, `?demo=4`). Mark anything not run `PENDING MANUAL DEVICE VERIFICATION`.

- **Toggle off:**
  - **WHEN** you open Print Focus, grant motion, tilt to see the glare, then tap the photo.
  - **THEN** the glare vanishes from the sharp print and "Glare off · tap photo to restore" shows at the top for about 1.6 s. Tilt and shadow still follow the phone. There's no flicker, seam or ghost frame at the moment of the tap.
- **Toggle on:**
  - **WHEN** you tap the photo again.
  - **THEN** the glare returns at its top-right anchor and follows the gyro. "Glare on" shows.
- **Persistence:**
  - **WHEN** glare is off and you swipe NEXT twice, go back to the album, open another print, then reload.
  - **THEN** the glare stays off until the reload, and is on after it.
- **Navigation is intact:**
  - **WHEN** you tap a neighbour print, tap the wall, or drag.
  - **THEN** they navigate, return and pan as before, and never toggle the glare.
- **Desktop:**
  - **WHEN** you click a focused print with a mouse.
  - **THEN** nothing changes compared with `main`.
