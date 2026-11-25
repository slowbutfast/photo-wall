## Automated Tests

Runner: `npx vitest run` (Node environment). For narrow loops, run the specific test file. Don't use `safe-test`.

- `src/components/wall/__tests__/pinchGesture.test.ts`:
  - a pure pinch (stationary midpoint) gives `pan = 0` and `zoomFactor = d1/d0`, anchored at the midpoint;
  - a slide with no spread gives `zoomFactor = 1` and `pan = Δmid`;
  - pinch plus slide (while the camera is unclamped): applying `pan` and then `zoom@mid(curr)` to a reference camera keeps the world point under `mid(prev)` mapped to `mid(curr)` (invariant test, epsilon 1e-6);
  - one-finger → two-finger → one-finger hand-off: dragging 1 finger (`dragged = true`), adding a 2nd finger, lifting the 2nd finger before `pointermove`, and moving the remaining finger preserves `dragged = true` and produces only the incremental `dx, dy` delta (zero jump back to `startX/startY`);
  - degenerate input (zero or non-finite distance) returns `null`.
- **Static audit** (`src/lib/__tests__/touchAudit.test.ts`):
  - every `:hover` selector in `wall.css` and `hud.css` sits inside an `@media` whose prelude contains `hover: hover` and `pointer: fine`;
  - `.album-editor-photo-media` declares `touch-action: manipulation`, `-webkit-touch-callout: none`, and `user-select: none`;
  - `touch-action: none` in `studio.css` is limited to `.studio-album-drag`;
  - `src/app/layout.tsx` exports `viewport` with `viewportFit: 'cover'` and no `userScalable: false` or `maximumScale`;
  - `SoundtrackPlaque.tsx`'s iframe URL contains `playsinline=1`;
  - `CuratorStudio.tsx` and `AlbumEditor.tsx` import `MouseSensor` and `TouchSensor` and no longer reference `PointerSensor`.
- **Existing suites stay green:** `cssBoundaryAudit`, `soundtrackState`, `photoOrderState`, `publicBoundaryAudit`, and the `rawUrlAudit` route tests.
- **Gates:** `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **Desktop no-regression:** the computed-style and pixelmatch harness from `gallery-style-and-canvas-refactor`, run with a fine pointer (default Playwright desktop), shows **0 diffs** on idle, album, print, Studio, **and hovered states** (`:hover` on regular and active `.hud-button`, lit and unlit `.photo-frame`, and `.museum-placard`).

## Manual Verification

Local dev on the LAN: `next dev -H 0.0.0.0`, with a local DB and `STORAGE_DRIVER=local`. Use a real iPhone (Safari) **and** a real Android phone (Chrome). Playwright mobile emulation is a supplement, not a substitute. Never write to the preview or production databases.

- **Safe area:**
  - **WHEN** you open `/photos` on an iPhone with a Dynamic Island, in portrait then landscape
  - **THEN** no HUD control sits under the sensor housing or the rounded corners, and the bottom bar clears the home indicator
- **Pinch and pan:**
  - **WHEN** you pinch while sliding two fingers across the wall
  - **THEN** the content under the fingers stays under them, and the page itself never zooms (check `visualViewport.scale === 1` via remote Web Inspector)
- **Finger lift:**
  - **WHEN** you lift one finger mid-pinch and keep dragging
  - **THEN** the pan continues without a jump, and no print opens on release
- **No sticky hover:**
  - **WHEN** you tap prints and placards, then lift your finger
  - **THEN** nothing stays tilted or lifted
- **Touch targets:**
  - **WHEN** you tap every HUD button and Focus Prev/Next with a thumb, and measure hit boxes in Web Inspector
  - **THEN** each is at least 44 × 44 px and no mis-taps occur
- **Inline soundtrack:**
  - **WHEN** you tap a soundtrack plaque on an iPhone
  - **THEN** playback is inline, with no full screen. Also record whether audio starts on the first tap. If it doesn't, log it as a follow-up in `verification.md` (it's out of scope here).
- **Studio scroll vs drag (no OS callout):**
  - **WHEN** you swipe across the Album Editor photo grid on a phone, or long-press a photo tile
  - **THEN** swiping scrolls, a 250 ms long-press drags and Save Order persists (local DB only), and long-pressing shows no iOS image callout, text selection, or Android `contextmenu`
- **Studio desktop:**
  - **WHEN** you reorder with a mouse and with the keyboard
  - **THEN** behaviour is unchanged
- **Memory (measurement only):**
  - **WHEN** you browse about 10 albums at print focus on an iPhone, with Web Inspector › Timelines › Memory recording
  - **THEN** record the peak, and note any tab reloads as a follow-up candidate
