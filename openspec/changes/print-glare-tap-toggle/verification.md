# Verification: print-glare-tap-toggle

## 1. Executive summary

On a coarse pointer, tapping the focused print in Print Focus now toggles the glare for the session.

- **Mechanism:** `useWallStore` holds a session-only `glareOff` flag. `GalleryCanvas` puts `data-glare="off"` on `.wall-viewport`, and one rule inside `@media (pointer: coarse)` sets `background: none` on `.photo-sheen` beneath it. That hides the focused frame's sheen and the `PrintSharpOverlay` sheen together.
- **Untouched:** the gyro subscription, the overlay sync, `PrintSharpOverlay`, and every fine-pointer rule. A wiring audit pins that glare state never appears in those files.
- **Feedback:** a 1.6 s `aria-live` pill reads `Glare off · tap photo to restore` the first time, then `Glare off` or `Glare on`.

**Result:** full suite 795/795 across 55 files; tsc, eslint and the production build exit 0. Coarse-touch emulation on local dev passes all nine checks. Fine-pointer behaviour is unchanged: `wall.css` has 41 insertions and 0 deletions, all inside the coarse block.

**Not verified:** nothing WebKit. The compositing behaviour on a real iPhone (the PR #18 risk area) and the gyro tilt, which can't run headless, are `PENDING MANUAL DEVICE VERIFICATION` (§6).

## 2. Environment

- **Base:** `origin/main` @ `5188316`. **Branch:** `feat/multi-20261128-0606`. **Commit:** `7b14ca2`.
- **Node:** v22.23.2. **Next.js:** 16.4.6 (Turbopack). **Vitest:** 5.1.1.
- **Local dev:** `next dev -p 3217`, `STORAGE_DRIVER=local`, local SQLite, demo manifest (`?demo=4&mood=chiaroscuro`). Nothing ran against preview or production.
- **Browser:** Playwright Chromium (headless). Coarse: 393×852, `deviceScaleFactor` 2, `hasTouch`, `isMobile` (confirmed `matchMedia('(pointer: coarse)')` true). Fine: 1440×900, mouse.

## 3. Requirement Adherence Audit Matrix

All scenarios are from `specs/instanced-photo-renderer/spec.md`, requirement "Coarse-pointer tap on the focused print toggles glare".

| Scenario | Verified by | Result |
| :--- | :--- | :--- |
| Tapping the focused print hides the glare and keeps the tilt | `FramedPrintGlareTap.test.tsx` › toggles glare on the focused print in Print Focus, without re-selecting it (toggle count 1, `onSelectPhoto` not called, `requestGyroPermission` once); Playwright: after the tap both the frame sheen and the overlay sheen compute `background-image: none`, `focusedFrame` still true (`logs/3.2-glare-toggle.log`); `glareToggleWiring.test.ts` › blast radius (no glare state in the overlay, its sync, `useGyroTilt` or the gyro effect), so tilt and shadow code is untouched | PASS for hiding and routing. Tilt under real gyro input: `PENDING MANUAL DEVICE VERIFICATION` |
| Tapping again restores the glare | Same unit test (second tap gives `glareOff` false, count 2); Playwright: `data-glare` removed and both sheens back to `radial-gradient(46% 42% at 65% 35%, …)`, the top-right anchor | PASS |
| Glare stays off across prints | `glareToggle.test.ts` › survives navigation between overview, albums and prints, and › survives a manifest reset | PASS (store). Not clicked through NEXT in a browser |
| Neighbour taps and drags keep their meaning | `FramedPrintGlareTap.test.tsx` › still navigates when the print is not focused; › does not toggle outside Print Focus; › ignores a tap that ended a drag | PASS |
| Desktop is unaffected | `FramedPrintGlareTap.test.tsx` › fine pointer keeps the old behaviour (`onSelectPhoto` called, no toggle, no gyro permission request); Playwright fine control: no `data-glare`, sheen `background-image` unchanged, inline opacity still `0.92`; CSS diff is 41 insertions, 0 deletions, at lines 1217–1257 inside the coarse block (1191–1324) | PASS |
| The rule is coarse-gated and only hides the sheen background | `sheenGlareAudit.test.ts` › exactly one `[data-glare='off'] .photo-sheen` rule inside `(pointer: coarse)`; › declares only `background: none`; › keeps every glare-toggle and hint rule inside `(pointer: coarse)`; › can fail (a moved rule is detected); the pre-existing "declares `--sheen-strength: 0.8` exactly once" assertion is unedited and green | PASS |

Also covered, from the requirement text:
- **Hint copy and duration:** `glareHint.test.ts` (`Glare off · tap photo to restore`, `Glare off`, `Glare on`, 1600 ms). Playwright shows the pill text and `data-visible="true"` after the first tap, `"false"` about 2 s later, and `Glare on` after the second tap.
- **No storage:** `glareToggle.test.ts` › never writes to browser storage.
- **Attribute and hint wiring:** `glareToggleWiring.test.ts` (data-glare bound to `glareOff` on the viewport, the status element after the overlay and so outside `.wall-world`).

## 4. Resolved assumptions and empirical proof

| Assumption / finding | Outcome | Evidence |
| :--- | :--- | :--- |
| One CSS rule covers both the focused frame's sheen and the overlay sheen | **Verified.** The overlay sits inside `.wall-viewport` inside `.playground-wall-root`, so the selector reaches both. After the tap both read `background-image: none`. | `logs/3.2-glare-toggle.log` |
| The overlay doesn't intercept the tap | **Verified** by the same run: the tap on the focused frame toggled the glare rather than being swallowed. | `logs/3.2-glare-toggle.log` |
| Setting `--sheen-strength: 0` was the plan | **Superseded.** `sheenGlareAudit.test.ts` requires exactly one rule in `wall.css` to declare `--sheen-strength`, and that is the right invariant. The change uses a higher-specificity `background: none` instead, with no `!important`. research.md, proposal, spec, architecture, design, tests, tasks and the handoff were corrected in the implementation commit. | `git show 7b14ca2` |
| WebKit repaints correctly when the attribute flips under a composited overlay | **Unverified.** Chromium only. | §6 |

**Screenshots** (`parity/coarse-glare-on.png`, `parity/coarse-glare-off.png`), inspected: with glare on there's a soft wash in the top-right corner of the print; with glare off the print is clean, with the tilt, mat, shadow and layout unchanged, and the pill at the top. The Next.js dev badge overlapping PREV is a dev-only overlay, not part of this change.

**Edited existing assertions:** none. `sheenGlareAudit.test.ts` gained a new `describe` block only.

## 5. Nomenclature audit (research.md glossary)

| Term | Where used | Consistent? |
| :--- | :--- | :--- |
| **glare / sheen** | `.photo-sheen` only; "glare" in user-facing copy and store names (`glareOff`) | Yes |
| **glare off** | `useWallStore.glareOff`, `data-glare="off"`, hint copy | Yes |
| **focused print tap** | `FramedPrint` branch `tier === 'print' && focused && isCoarsePointer()` | Yes |
| **session** | In-memory store only; reset by reload; asserted not to touch storage | Yes |

## 6. Pending manual checks

`PENDING MANUAL DEVICE VERIFICATION` (iPhone, Safari, portrait, local dev over the LAN):
- Toggle off in Print Focus with motion granted: the glare vanishes from the sharp print with no flicker, seam or ghost frame at the tap. Tilt and shadow keep following the phone.
- Toggle on: the glare returns at the top-right anchor and follows the gyro.
- Persistence: off across NEXT and PREV and across Album View then a new print; on again after a reload.
- Neighbour taps, wall taps and drags still navigate, return and pan.
- Desktop: a click on a focused print behaves as on `main`.

## 7. Verbatim logs

All under `logs/` (screenshots and the harness under `parity/`):
- `1.4-tdd-red.log`: the red run (12 failed, 15 passed).
- `3.1-safe-test.log`: `safe-test` aborting with `RangeError: WebAssembly.instantiate(): Out of memory`.
- `3.1-vitest-full.log`: 55 files, 795 tests passed.
- `3.1-tsc.log`, `3.1-eslint.log`, `3.1-build.log`: all exit 0.
- `3.2-glare-toggle.log`: coarse and fine Playwright run with the verdict block.
