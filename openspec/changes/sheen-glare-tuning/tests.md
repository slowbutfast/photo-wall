## Automated Tests

Runner: `npx vitest run` (Node environment). For narrow loops, run the specific file.

- `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts` (new static CSS audit of `src/styles/wall.css`). It verifies:
  - `.playground-wall-root` declares `--sheen-strength: 0.5` exactly once, and no other rule declares it;
  - the base `.playground-wall-root .photo-sheen` `background` is a `radial-gradient` positioned `at var(--sheen-anchor, 50% 50%)`, keeps `ellipse 46% 42%`, and its two non-zero stops are `calc(0.38 * var(--sheen-strength))` and `calc(0.14 * var(--sheen-strength))`, with the outer stop at `0`;
  - `--sheen-intensity: 0.44` is unchanged;
  - inside an `@media (pointer: coarse)` block, the rule whose selector list contains both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` declares `--sheen-anchor: 65% 35%`;
  - no rule outside a `(pointer: coarse)` block declares `--sheen-anchor`.
- `npx vitest run src/lib/__tests__/touchAudit.test.ts`: stays green **unchanged**. The coarse sheen rules still use the `normal` blend and never `screen`, and the Album View sheen is still hidden.
- `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts src/components/wall/__tests__/printSharpOverlaySync.test.ts`: stay green unchanged, since the gyro and overlay inline writes are untouched.
- **Full gates:** `npx vitest run` (serialized full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **Desktop scoped parity:** run the fine-pointer computed-style and pixelmatch harness used by `render-loop-efficiency` and `mobile-render-profile` against the pre-change build. Cover idle, album, print, hovered print, hovered placard and Studio. Pass when:
  - the only computed-style differences are `.photo-sheen` `background-image`;
  - every pixel difference falls inside `.photo-sheen`-covered regions;
  - with a temporary `--sheen-strength: 1` override, the result is **0 px** and identical computed values apart from the `calc()` serialization. That proves D1 is the only behavioural change.
- **Coarse emulated check** (Playwright `hasTouch` and `isMobile`, or `pointer: coarse` emulation), Print Focus at rest:
  - the focused sheen's and the overlay sheen's computed `background-image` contain the `65% 35%` position;
  - the overlay stays aligned with the frame (max ≤ 0.1 px, as in the existing overlay alignment check).

## Manual Verification

Local dev on the LAN (`next dev -H 0.0.0.0`, local DB, `STORAGE_DRIVER=local`) or read-only viewing of the preview. Use a real iPhone (Safari) and a real Android phone (Chrome), plus a desktop browser. Check all three moods (`chiaroscuro`, `concrete`, `alabaster`).

- **Mobile resting glare (no gyro):**
  - **WHEN** you enable Reduce Motion (or deny motion permission) and open a print in Print Focus
  - **THEN** the glare sits in the top-right corner of the photo, the subject in the centre is not veiled, and there's no seam or offset between the sharp overlay and the frame
- **Mobile gyro sweep:**
  - **WHEN** you grant motion permission, enter Print Focus holding the phone naturally, then tilt it slowly in every direction
  - **THEN** the glare starts top-right, moves opposite the tilt as smoothly as before, can be pulled across the photo by tilting, and slides off the edge without popping
- **Desktop hover:**
  - **WHEN** you hover and move the mouse across wall prints and a focused print
  - **THEN** the glare still follows the cursor, centred at rest, and is clearly softer (about half) without disappearing
- **Strength and anchor judgement (record in `verification.md`):**
  - **WHEN** you compare `--sheen-strength: 0.5` against `0.4` and `0.6` (in Web Inspector, by editing the variable), and, on mobile, compare the current anchor against a tighter `--sheen-size: 34% 30%`
  - **THEN** record which reads best per device and mood. Keep `0.5` and the current ellipse unless the device pass clearly prefers otherwise, and log any preferred change as a follow-up
