## Why

On a phone, the gyro-driven glare in Print Focus sometimes sits right over the part of the photo the visitor wants to see, and there's no way to get rid of it short of holding the phone at an angle. Tapping the focused print does nothing today (research.md, Verified facts), so that tap is free to become a glare toggle.

## What Changes

- On `(pointer: coarse)` devices, a **focused print tap** in Print Focus toggles **glare off** and on for the rest of the session.
  - The tap no longer re-enters the same print, so it no longer creates a redundant soundtrack state object.
- `useWallStore` gains a session-only `glareOff` flag and `toggleGlare()`.
- `.wall-viewport` gets `data-glare="off"` while the flag is set. A single coarse-gated `wall.css` rule sets `background: none` on `.photo-sheen` beneath it, which covers both the frame sheen and the `PrintSharpOverlay` sheen.
- Gyro tilt and the cast shadow are unchanged. The gyro and overlay sync code is untouched.
- A brief `aria-live` hint, "Glare off · tap photo to restore" or "Glare on", confirms each toggle.
- Desktop `(pointer: fine)` is unchanged, byte for byte.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `instanced-photo-renderer`: adds the requirement "Coarse-pointer tap on the focused print toggles glare".

## Impact

- **Code:**
  - `src/store/useWallStore.ts` (the `glareOff` key)
  - `src/components/wall/FramedPrint.tsx` (the `onClick` only)
  - `src/components/wall/GalleryCanvas.tsx` (the root attribute and the hint element)
  - `src/styles/wall.css` (the coarse rule and hint styles)
- **Tests:** `sheenGlareAudit.test.ts` (extended), plus new store and `FramedPrint` tap tests.
- **APIs, DB, dependencies:** none.
- **Shares `useWallStore.ts` with `soundtrack-playback-sync`,** on a different key.
- **Device risk:** WebKit compositing. iPhone verification is required before merge (PR #18 postmortem).
