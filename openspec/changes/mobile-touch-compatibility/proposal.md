## Why

The wall and the Studio were built and verified mouse-first. A code audit (research: Verified facts) finds several mobile defects that don't depend on screen width:

- the HUD's safe-area padding is silently zero on iPhones;
- a pinch zooms but can't pan;
- touch triggers mouse-only hover tilt and leaves sticky hover states;
- the public YouTube embed omits `playsinline`;
- in the Studio's Album Editor, swiping over the photo grid starts a drag instead of scrolling.

Phones are the most likely way anyone sees a shared gallery link, so these defects affect the main audience.

## What Changes

- **Viewport:** add a Next 16 `viewport` export with `viewportFit: 'cover'`, so `env(safe-area-inset-*)` takes effect. Use `max()` safe-area insets on `.hud-top-right` (top/right) and `.photo-focus-bar` (left/right/bottom) so landscape iPhones clear the Dynamic Island cleanly.
- **Two-finger pan:** while pinching, moving the touch midpoint pans the camera, combined with the existing midpoint-anchored zoom, and lifting one finger hands off cleanly without resetting drag state or jumping.
- **Hover only on fine pointers:**
  - `FramedPrint` tilt and sheen run only for `pointerType === 'mouse'`;
  - wall and HUD `:hover` visual rules are wrapped **in place** under `@media (hover: hover) and (pointer: fine)`, so touch taps never leave a print or placard stuck lifted and desktop cascade order is preserved.
- **Touch targets:** on coarse pointers, `.hud-button` and Photo Focus Prev/Next/Back controls meet a **44 × 44 px** minimum hit area. The visible styling doesn't change.
- **Inline YouTube:** the public plaque iframe adds `playsinline=1`, matching the Studio probe players.
- **Studio touch reordering:**
  - replace `PointerSensor` with `MouseSensor { distance: 4 }` + `TouchSensor { delay: 250, tolerance: 5 }` + `KeyboardSensor` in `CuratorStudio` and `AlbumEditor`;
  - photo tiles switch from `touch-action: none` to `touch-action: manipulation` with `-webkit-touch-callout: none` and `user-select: none`, so a swipe scrolls and a long-press drags without triggering OS image callouts.
- **Device verification:** iPhone Safari and Android Chrome checks for every item, plus measurements of the open device questions (sound on first tap, page pinch-zoom, memory). Anything confirmed broken but out of scope is recorded for a follow-up.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spatial-camera-navigation`: ADDED requirement for two-finger pan during a pinch, and for blocking page zoom over the wall.
- `gallery-hud-and-curator-ui`: ADDED requirements for safe-area-aware HUD, coarse-pointer touch targets, HUD hover gating, and touch-safe Studio reordering.
- `3d-pbr-wall-and-lighting`: ADDED requirement for fine-pointer-only wall hover effects, and for inline YouTube playback on the plaque.

## Impact

- **Code:**
  - `src/app/layout.tsx` (`viewport` export)
  - `src/styles/hud.css` (safe-area, coarse-pointer hit areas, hover gating)
  - `src/styles/wall.css` (hover gating)
  - `src/styles/studio.css` (`touch-action`, `-webkit-touch-callout`, `user-select`)
  - `src/components/wall/GalleryCanvas.tsx` (pinch pan, clean 2→1 finger hand-off, unconditional `gesturestart`/`gesturechange` guard)
  - `src/components/wall/FramedPrint.tsx` (pointer-type gate)
  - `src/components/wall/SoundtrackPlaque.tsx` (`playsinline`)
  - `src/components/admin/{CuratorStudio,AlbumEditor}.tsx` (sensors)
  - a new pure `src/components/wall/pinchGesture.ts` with tests
- **Dependencies:** none. `@dnd-kit/core` already ships `MouseSensor`/`TouchSensor`.
- **Ordering:** the `SoundtrackPlaque` single-player fix lands first. This change rebases on it.
- **Desktop:** no behaviour change, and the idle-state pixelmatch must show 0 diffs at a fine-pointer emulation.
