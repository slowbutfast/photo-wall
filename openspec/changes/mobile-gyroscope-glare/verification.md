# Verification — `mobile-gyroscope-glare`

> Scope note: this session had **no physical iPhone or Android device attached**, and was instructed
> not to run Playwright/headless browser suites. Every device-dependent claim below is marked
> `PENDING MANUAL DEVICE VERIFICATION` and must **not** be treated as passed. Section 8 gives the
> exact maintainer procedure; the browser pixel/computed-style parity run is `DEFERRED` to the
> orchestrator (section 9).

---

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `mobile-gyroscope-glare` |
| Branch | `feat/multi-20261125-0558` (orchestrator-mandated; prerequisite `mobile-touch-compatibility` committed at `0adbbb5`) |
| Status | **Implementation complete; automated gates green; device + browser-parity gates open** |
| Date | 2026-11-25 |
| OS | Linux (container, `linux`) |
| Node / runner | project-local `node_modules`; `npx vitest run` (vitest 5.1.1), `npx tsc --noEmit` (TypeScript 5.9.3), `npx eslint .` (ESLint 9.39.5), `npm run build` (Next 16.4.6) |
| Interpreter | no Python runtime involved; all commands run through `npx`/`npm` from the repo root |
| Test environment | `vitest.config.ts`: Node environment, `fileParallelism: false`, `maxWorkers: 1` |

**Totals (before → after):**

| Metric | Baseline (after `mobile-touch-compatibility`) | Now | Delta |
| :--- | ---: | ---: | ---: |
| Test files passing | 33 | **35** | +2 |
| Tests passing | 482 | **520** | +38 |
| Tests removed / skipped | 0 | 0 | 0 |
| Failing tests | 0 | 0 | 0 |

Nothing was deleted or skipped, so the growth is additive: `19` in
`src/components/wall/__tests__/gyroTilt.test.ts` + `19` in
`src/components/wall/__tests__/useGyroTilt.test.ts` = `482 + 38 = 520`.

**Files changed**

| Path | Change |
| :--- | :--- |
| `src/components/wall/gyroTilt.ts` | **new** — `DEFAULT_GYRO_MAX_DEG = 22`, `DEFAULT_GYRO_TAU_MS = 85`, `wrapAngleDelta`, `computeGyroTilt` (explicit sign table), time-based `smoothTilt`. Zero DOM, zero React |
| `src/components/wall/useGyroTilt.ts` | **new** — `GyroAdapter` seam, `createGyroController(adapter, onTilt)`, `createDefaultGyroAdapter`, `createGyroPermissionRequester`, `requestGyroPermission`, `useGyroTilt(tier, focusedPhotoId)` |
| `src/components/wall/__tests__/gyroTilt.test.ts` | **new** — 19 tests (TDD red first) |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | **new** — 19 tests (TDD red first) |
| `src/components/wall/GalleryCanvas.tsx` | canvas-level `useGyroTilt(tier, focusedPhotoId)`; `gyroSubscribe` + `requestGyroPermission` threaded through `AlbumTier` to every `FramedPrint`. No per-tick state |
| `src/components/wall/FramedPrint.tsx` | imperative `(nx, ny)` subscription: full tilt + shadow + sheen on the focused print, glare-only sheen in Album View, style reset on unsubscribe/tier change; `requestGyroPermission()` fired synchronously from the Print Focus tap on coarse pointers |
| `src/styles/wall.css` | `@media (pointer: coarse)` shortens `.photo-frame` / `.photo-sheen` transitions so frame, shadow and glare track the wrist. No new `:hover`; desktop timing untouched |
| `openspec/changes/mobile-gyroscope-glare/tasks.md` | checkboxes + evidence notes |
| `openspec/changes/mobile-gyroscope-glare/verification.md` | this document |

No new dependency, no `.env`, no DB/API change, no file outside `src/` and the change directory.

---

## 2. Requirement Adherence Audit Matrix

Requirement: **Coarse-pointer gyroscope rotational glare and physical print-focus tilt**
(`specs/instanced-photo-renderer/spec.md`, ADDED).

`PASS (automated)` = an executed unit test asserts it.
`PASS (audit)` = a static source/CSS assertion or a read of the exact code path (a capability with no
runtime unit to test in Node).
Anything a browser or a physical device must observe is `PENDING MANUAL DEVICE VERIFICATION`.

### 2.1 Scenario matrix

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *Print Focus physically tilts frame, shadow, and glare with phone orientation* — focused print tilts `±4°` `rotateX`/`rotateY`, `--tilt-sx`/`--tilt-sy` shift opposite the tilt, `.photo-sheen` sweeps in 2D, `PrintSharpOverlay` mirrored | Feed: `useGyroTilt.test.ts` › “emits wrapped, clamped and smoothed screen-space tilt” (`ny → +0.25` for `+11°` from baseline, `nx → 0`, time-smoothed). Mapping: `gyroTilt.test.ts` › “clamps each axis to ±22°…” + sign-vector table. DOM write: `FramedPrint` `print` branch sets `translateZ(58px) rotateY(nx*8deg) rotateX(-ny*8deg)`, `--tilt-sx = -rotY*2.4px`, `--tilt-sy = rotX*2.4px`, sheen `translate3d(-nx*38%, -ny*38%, 0)` + `opacity: 0.92` (code read; `PrintSharpOverlay` already copies `getComputedStyle(frame).transform` and the sheen inline styles every rAF — unchanged) | Feed **PASS (automated)**; DOM mapping **PASS (audit)**; physical feel / overlay alignment **PENDING MANUAL DEVICE VERIFICATION** |
| S2 | *Album View sweeps subtle glare without wobbling frames* — `.photo-sheen` at 30% amplitude, frame rotation and cast shadows stationary | Unit test “emits wrapped, clamped and smoothed screen-space tilt” proves the feed in `album` tier. Code read: the album branch of `FramedPrint`’s subscription writes **only** `sheen.style.transform = translate3d(-nx*11.4%, -ny*11.4%, 0)`; it never touches `frame.style.transform`, `--tilt-sx` or `--tilt-sy`. `11.4 = 38 * 0.3` is the single constant `ALBUM_SHEEN_PERCENT` | **PASS (automated + audit)**; visual gentleness **PENDING MANUAL DEVICE VERIFICATION** |
| S3 | *Screen orientation change rebases baseline without jumping* — smoother reset to `{0,0}`, baseline cleared, next valid sample is the new neutral, remap with the new angle, no jump | `useGyroTilt.test.ts` › “resets the smoother, emits zero, and rebases on the next sample” (fires the `screen.orientation` `'change'` listener, asserts explicit `{0,0}`, then a sample at the same physical angle stays `{0,0}`, then `+11°` at `90°` yields `nx = -0.25` per the landscape sign table) and › “rebases even if the orientation event never arrives” (angle polled per sample). Sign table: `gyroTilt.test.ts` `0°/90°/180°/270°` table + `-90 → 270` alias | **PASS (automated)**; real-device rotation feel **PENDING MANUAL DEVICE VERIFICATION** |
| S4 | *Reduced motion and desktop fine-pointer browsers stay unaffected* — no tilt/glare, desktop computed styles and hover identical | `useGyroTilt.test.ts` › “attaches zero listeners on a (pointer: fine) desktop browser” and › “attaches zero listeners under prefers-reduced-motion: reduce” (both assert `0` orientation listeners, `0` screen-orientation listeners, `0` frames, `0` emissions). No inline style is ever written on desktop because `FramedPrint` only writes inside the subscription callback, which never fires without a controller listener. CSS untouched for fine pointers (compiled probe §5.5) | **PASS (automated + audit)**; computed-style/pixel parity **DEFERRED** to the orchestrator (§9) |

### 2.2 Requirement clause checklist

| Clause | Evidence | Status |
| :--- | :--- | :--- |
| Relative-to-entry baseline `(beta0, gamma0)` captured on the first valid finite sample after entering `album`/`print` | `useGyroTilt.test.ts` › “captures the first valid sample as the relative baseline” (baseline at `beta 50 / gamma -8` emits nothing — it *is* neutral) and `gyroTilt.test.ts` › “treats the entry holding angle as neutral” | **PASS (automated)** |
| Rebase + smoother reset when `tier`, `focusedPhotoId` or live `screen.orientation.angle` changes | `useGyroTilt.test.ts` › “resets the baseline when entering Print Focus…”, › “resets the baseline when the focused photo changes”, › orientation-change tests | **PASS (automated)** |
| `screen.orientation.angle` `0°/90°/180°/270°` mapping into `[-0.5, +0.5]` with `DEFAULT_GYRO_MAX_DEG = 22` | `gyroTilt.test.ts`: four-vector table (`nx +0.25`, `ny -0.25` for every angle), clamp test (`±0.5` exact), constants test | **PASS (automated)** |
| `null` / non-finite `beta`/`gamma` ignored without corrupting baseline or smoother | `useGyroTilt.test.ts` › “ignores null and non-finite readings without corrupting baseline or smoother” (`null`, `NaN`, `±Infinity` → no frame, no emission; the original baseline still yields `ny +0.25` afterwards, and every emitted value is finite) + `wrapAngleDelta` non-finite guard test | **PASS (automated)** |
| Macro tier (`scale < 0.25`): sensor listening and tilt/glare off | `useGyroTilt.test.ts` › “detaches every listener and emits an explicit zero in macro tier” (0 listeners, pending rAF cancelled, explicit `{0,0}`, late flush emits nothing) and `FramedPrint`’s effect returns early for `tier === 'macro'` | **PASS (automated + audit)** |
| Print Focus: `±4°` + `translateZ(58px)` + `--tilt-sx/sy` + full 2D sheen, `PrintSharpOverlay` mirrored automatically | Code read (§2.1 S1). `PrintSharpOverlay` is unmodified and already mirrors `getComputedStyle(frame).transform` + sheen inline styles every rAF | **PASS (audit)**; visual **PENDING MANUAL DEVICE VERIFICATION** |
| Album tier: 30% glare only, no frame rotation, no shadow shift | Code read (§2.1 S2) | **PASS (audit)**; visual **PENDING MANUAL DEVICE VERIFICATION** |
| iOS 13+ `requestPermission()` synchronously inside the tap entering Print Focus, at most once per session, silent on deny/unsupported | `useGyroTilt.test.ts`: granted (called once across two calls), denied (once), rejected → `'denied'` with no unhandled rejection (once), no `requestPermission` → `'granted'`, default export callable with no arguments. Wiring: `FramedPrint.onClick` calls it with `void …` on the same stack as `onSelectPhoto` when `matchMedia('(pointer: coarse)').matches` | **PASS (automated)** for the permission logic; native sheet behaviour **PENDING MANUAL DEVICE VERIFICATION** |
| Desktop `(pointer: fine)` unchanged | §2.1 S4 + compiled CSS probe §5.5 + `npx tsc`/`eslint`/`build` green | **PASS (automated + audit)**; pixel parity **DEFERRED** |

**Not gated by a width breakpoint:** capability is `matchMedia('(pointer: coarse)')` and
`matchMedia('(prefers-reduced-motion: reduce)')` only, matching the change-1 contract.

---

## 3. Resolved Assumptions & Empirical Proof

From `research.md` “Unverified assumptions”:

| Assumption | Resolution | Proof status |
| :--- | :--- | :--- |
| “Exact feel of `DEFAULT_GYRO_MAX_DEG = 22` and `smoothTilt` `alpha = 0.18`” | The revision replaced the fixed `alpha = 0.18` with the time-based filter `alpha = 1 - exp(-clamp(dt,0,100)/85)`; at 60Hz that is `0.175`, i.e. numerically the old constant while staying frame-rate independent. `±22°` kept. | Math **PASS (automated)** (30Hz/120Hz parity, dt cap, monotonicity, bounds). *Feel on hardware* **PENDING MANUAL DEVICE VERIFICATION** |
| iOS 17/18 Safari fires `deviceorientation` inside the rewritten `/photos` top-level document | Untested — code path is a plain `window.addEventListener('deviceorientation')` on the top-level document with no iframe involved. | **PENDING MANUAL DEVICE VERIFICATION** |
| `PrintSharpOverlay` mirrors the frame/sheen without changes | Re-read at `PrintSharpOverlay.tsx:L77-L96`: it copies `getComputedStyle(frame).transform` and `sheenIn.style.transform`/`opacity` every rAF. Left unmodified (no fork). | **Verified by code read** |
| `FramedPrint` mouse tilt keeps working on desktop | The mouse branch is byte-identical to `main`; the new subscription writes nothing on fine pointers. | **PASS (audit)**; hover parity **DEFERRED** |

New facts established by this change (empirical, reproducible):

| Claim | Value | How verified |
| :--- | :--- | :--- |
| `wrapAngleDelta` is seam-correct | `179 → -179` yields `+2°` (`nx = 2/44`), not `-358°` | `gyroTilt.test.ts` |
| Smoothing is frame-rate independent | 6×33.3ms and 24×8.3ms land within `1e-12` | `gyroTilt.test.ts` |
| Long frame gaps do not snap | `dt = 5000ms` ≡ `dt = 100ms` | `gyroTilt.test.ts` |
| No sensor listeners on desktop | `0` orientation + `0` screen listeners after `setContext('album'/'print')` | `useGyroTilt.test.ts` |
| Permission is one prompt per session | `requestPermission` called exactly once across repeated calls, in all three outcomes | `useGyroTilt.test.ts` |

---

## 4. Nomenclature & Code Symbol Audit

Glossary terms from `research.md`, and the code that must mean the same thing:

| Glossary term | Code symbol / selector | Consistent? |
| :--- | :--- | :--- |
| **Relative-to-Entry Baseline (`beta0, gamma0`)** | `GyroSample` + controller `baseline: GyroSample \| null` (captured at first valid sample, cleared on reset) | ✅ single owner, never raw absolute `beta = 0` |
| **Normalized Tilt (`nx, ny`)** | `TiltVector { nx, ny }` in `[-0.5, +0.5]`, produced by `computeGyroTilt` (`±DEFAULT_GYRO_MAX_DEG`, `/ (2 * 22)`) and consumed by `FramedPrint` exactly as the mouse path already did | ✅ same coordinate space as hover |
| **Album-Tier Glare-Only Sweep** | `ALBUM_SHEEN_PERCENT = 38 * 0.3` → `translate3d(-nx * 11.4%, …)`; no `transform` / `--tilt-sx` / `--tilt-sy` write on the frame | ✅ 30% of the Print Focus travel, zero frame motion |
| **Print-Focus Full Physical Tilt** | `translateZ(58px) rotateY(nx * 8) rotateX(-ny * 8)`, `--tilt-sx = -rotY * 2.4px`, `--tilt-sy = rotX * 2.4px`, sheen `38%` + `opacity 0.92` — the same curve the mouse uses when `focused` | ✅ ±4° at ±0.5, identical to hover |
| **Coarse pointer** | `matchesMedia('(pointer: coarse)')` in the controller; `matchMedia('(pointer: coarse)')` for the tap prompt; `@media (pointer: coarse)` for the transition tuning | ✅ capability-gated, no UA sniffing, no width breakpoint |
| **Reduced motion** | `matchesMedia('(prefers-reduced-motion: reduce)')` (listeners never attach) | ✅ |
| Smoothing time constant | `DEFAULT_GYRO_TAU_MS = 85`; `MAX_SMOOTH_DT_MS = 100` (private cap) | ✅ one constant, one cap |
| Sensor lifecycle seam | `GyroAdapter` (7 methods) / `createGyroController(adapter, onTilt)` / `GyroController { setContext, destroy }` | ✅ DOM-free, React-free |

No new colour, type, spacing token or CSS class was introduced. Every new identifier is either a
glossary term or a pure-maths/plumbing name: `wrapAngleDelta`, `computeGyroTilt`, `smoothTilt`,
`TiltVector`, `GyroSample`, `GyroReading`, `GyroAdapter`, `GyroController`, `GyroTiltListener`,
`GyroSubscribe`, `GyroTiltHandle`, `GyroPermissionRequester`, `createGyroController`,
`createDefaultGyroAdapter`, `createGyroPermissionRequester`, `useGyroTilt`, `ALBUM_SHEEN_PERCENT`,
`isCoarsePointer`, `MIN_EMIT_DELTA`.

---

## 5. Empirical Execution Logs (verbatim)

### 5.1 TDD red phase — before any implementation (tasks 1.1–1.3)

```
$ npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts

 ❯ src/components/wall/__tests__/useGyroTilt.test.ts (0 test)
 ❯ src/components/wall/__tests__/gyroTilt.test.ts (0 test)

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/wall/__tests__/gyroTilt.test.ts [ src/components/wall/__tests__/gyroTilt.test.ts ]
Error: Cannot find module '../gyroTilt' imported from
  …/src/components/wall/__tests__/gyroTilt.test.ts

 FAIL  src/components/wall/__tests__/useGyroTilt.test.ts [ src/components/wall/__tests__/useGyroTilt.test.ts ]
Error: Cannot find module '../useGyroTilt' imported from
  …/src/components/wall/__tests__/useGyroTilt.test.ts

 Test Files  2 failed (2)
      Tests  no tests
```

### 5.2 Transitional red inside the math (kept as evidence that the assertions bite)

After the first `gyroTilt.ts`, one assertion failed on signed zero rather than on the physics — a real
bug (`-0` leaks into `nx`/`ny` for negated zero deltas):

```
AssertionError: expected { beta: 50, gamma: -8 }, BASELINE, 90) to deeply equal { nx: 0, ny: 0 }

- Expected
+ Received
  {
-   "nx": 0,
+   "nx": -0,
    "ny": 0,
  }
```

Fixed with `noNegativeZero()`; the suite then passed.

### 5.3 Targeted green (post-implementation, required command)

```
$ npx vitest run src/components/wall/__tests__/gyroTilt.test.ts \
    src/components/wall/__tests__/useGyroTilt.test.ts \
    src/lib/__tests__/touchAudit.test.ts

 Test Files  3 passed (3)
      Tests  48 passed (48)
   Duration  554ms
```

`touchAudit.test.ts` is still 10/10: wall.css keeps exactly **4** `:hover` rules and hud.css **3**,
each wrapped in `@media (hover: hover) and (pointer: fine)` (see §5.5).

### 5.4 Full suite (task 4.1)

```
$ npx vitest run
 Test Files  35 passed (35)
      Tests  520 passed (520)
   Duration  10.05s (tests 68%, import 26%, worker 3%, transform 3%)
```

Baseline was `33 / 482`; the delta is exactly the two new files (`19 + 19`), with **0** removed or
skipped tests.

### 5.5 TypeScript, ESLint, production build, compiled CSS probes

```
$ npx tsc --noEmit
tsc exit=0

$ npx eslint .
eslint exit=0

$ npm run build
✓ Compiled successfully in 1774ms
build exit=0
```

Compiled wall CSS chunk (`.next/static/chunks/26avka53zfimz.css`) — desktop timing intact, coarse
override present, hover gating unchanged:

```
/* base (desktop fine pointers) — unchanged from main */
.playground-wall-root .photo-frame{… transition:transform .24s cubic-bezier(.22,1,.36,1),
  box-shadow .24s cubic-bezier(.22,1,.36,1), padding .25s, background-color .25s; …}
.playground-wall-root .photo-sheen{… transition:opacity .25s, transform .18s cubic-bezier(.22,1,.36,1);}

/* added — coarse pointers only */
@media (pointer:coarse){
  .playground-wall-root .photo-frame{transition:padding .25s,background-color .25s}
  .playground-wall-root .photo-sheen{transition:opacity .25s}
}

/* hover audit invariant */
@media (hover:hover) and (pointer:fine)   × 4 blocks
[^}]*:hover[^{]*{                        × 4 selectors
```

### 5.6 OpenSpec validation

```
$ openspec validate mobile-gyroscope-glare --strict
Change 'mobile-gyroscope-glare' is valid
validate exit=0
```

---

## 6. Scope / Spec Deviations (recorded, not silent)

1. **Branch name.** Task 1.0 says “branch `feat/mobile-gyroscope-glare` from `main`”; the orchestrator
   mandated `feat/multi-20261125-0558` (cut from `main`, prerequisite committed at `0adbbb5`). No
   branch was created or switched by this session, and nothing was committed.
2. **Controller surface.** Task 2.2’s wording is `createGyroController(adapter, onTilt)` with
   “`onTilt`/subscriber callback”. The controller exposes `setContext` + `destroy` and takes the
   `onTilt` sink; the **hook** owns the subscriber set and returns the stable
   `{ subscribe, requestGyroPermission }`. This keeps the controller free of React concerns and is
   what the tests drive.
3. **Transition tuning is CSS-only.** Rather than toggling a `data-gyro` attribute from React state,
   the transition shortening is `@media (pointer: coarse)` — the same capability the JS gates on. This
   guarantees **zero** desktop computed-style change (no extra attribute, no extra inline style at
   rest) and keeps `touchAudit`’s hover counts exact.
4. **Album sheen does not touch `opacity`.** `design.md` §4 specifies only the `translate3d` for Album
   View (the base `.photo-sheen` already has `--sheen-intensity`); only Print Focus forces `0.92`, as
   specified.
5. **Reset emits are broader than the two named events.** Tier exit and orientation rebase are the
   spec’s named zero emits; `enter/leave Print Focus` and `focusedPhotoId` changes emit an explicit
   `{0,0}` too, because those resets must also clear a previously tilted frame. Tested explicitly.
6. **`-90` alias.** `ScreenOrientation.angle` is spec’d as `0/90/180/270`, but some engines report
   `-90`; `screenAngleQuadrant()` folds it to `270` (one extra unit test).
7. **Permission prompt under Reduce Motion.** The tap requests permission on any coarse pointer (as
   task 3.2 words it); the controller is independently gated on `prefers-reduced-motion`, so no tilt
   or glare follows. If a maintainer prefers to suppress the prompt itself under Reduce Motion, gate
   the `isCoarsePointer()` call in `FramedPrint.onClick` on the media query too — one line, no test
   change.
8. **No extra control state.** Everything is derived from `tier`/`focusedPhotoId` and the sensor
   stream; no new store slice, context provider or CSS custom property was introduced.

---

## 7. Hardware / Device Reality Check — what is *not* proven

The unit tests prove the **math, gating, lifecycle and permission policy**. They cannot prove:

- that iOS Safari actually delivers `deviceorientation` after the native prompt (HTTPS required — iOS
  blocks motion sensors on plain `http://LAN-IP`);
- that `±4°` / `22°` / `85ms` *feel* like handling a real print;
- that the `PrintSharpOverlay` stays pixel-aligned during wrist movement on a real GPU;
- that rotating the phone mid-session feels jump-free on real hardware.

All four are `PENDING MANUAL DEVICE VERIFICATION` (section 8).

---

## 8. PENDING MANUAL DEVICE VERIFICATION (exact maintainer steps)

Prerequisites: a local DB (`DATABASE_URL` → local file), `STORAGE_DRIVER=local`, and an **HTTPS**
origin reachable from the phone (e.g. `cloudflared tunnel --url http://localhost:3000`). iOS will not
fire `DeviceOrientationEvent` on plain HTTP. Never point the phone at production for the interactive
checks.

```bash
# from the repository root
npm run dev                          # http://localhost:3000
cloudflared tunnel --url http://localhost:3000   # open the printed https://…trycloudflare.com on the phone
```

On **iPhone Safari** (record model, iOS version, Safari version) and **Android Chrome** (record
model, Android/Chrome version), open
`https://<tunnel>/photos?demo=4&mood=chiaroscuro`:

1. **Permission prompt (iOS only).** Tap any print to enter Print Focus.
   Pass when the native “Motion & Orientation Access” sheet appears on that first tap, and appears
   **only once per page load** (return to Album View, tap another print → no second sheet).
   Then deny it in a fresh tab: pass when nothing errors (console clean) and the wall still navigates.
2. **Print Focus physical handling.** Accept the prompt, then tilt the phone forward/backward and
   left/right about the angle you were holding it at.
   Pass when: the focused print tilts up to ~`±4°`, lifts, its wall cast shadow shifts **opposite** the
   tilt, and the radial glare sweeps across the glass. The full-resolution overlay must stay sharp and
   aligned with the frame (no doubled/ghost edge).
3. **Neutral on entry.** Enter Print Focus while holding the phone at an unusual angle (e.g. lying on
   your side, phone tilted ~45°). Pass when the print is neutral (`0°`) on entry, not pre-tilted.
4. **Album View = glare only.** Return to Album View and tilt the phone.
   Pass when **only** the sheen drifts (gentle, ~30% of the Print Focus travel); no print rotates and
   no cast shadow moves.
5. **Orientation change mid-tier.** In Album View, rotate the phone portrait → landscape (and back)
   while tilting. Pass when the screen axes follow the new orientation (tilting screen-right still
   moves the glare right) and there is **no jump** at the moment of rotation.
   Repeat inside Print Focus.
6. **Reduce Motion.** Enable OS “Reduce Motion” (iOS: Accessibility › Motion; Android: Remove
   animations), reopen `/photos`, tilt. Pass when there is no tilt/glare at all. With remote Web
   Inspector, confirm `getEventListeners(window).deviceorientation` is empty.
7. **Macro tier off.** Zoom out to the mosaic overview and tilt. Pass when no glare/tilt is applied
   and no `deviceorientation` listener remains attached.
8. **Desktop unchanged (manual spot check).** On a desktop browser with a mouse, hover a print:
   pass when the hover tilt/lift/glare matches `main` exactly (the orchestrator runs the automated
   parity pass, §9).
9. **Android has no prompt.** On Android Chrome the effect must start on the first tap into Print
   Focus with no permission UI.

Record per item: device model, OS version, browser version, pass/fail, and a screen recording for
items 2–5. Until then S1–S4 remain open against `specs/instanced-photo-renderer`.

---

## 9. Orchestrator Browser Parity (task 4.2) — PASS

Run by the orchestrator against production `next start` builds: change-1 baseline `0adbbb5` and this
change (same branch), Chromium headless `1440×900`, DPR 1, fine pointer,
`?demo=4&mood=chiaroscuro`, CSS animations/transitions frozen. Same 11 states as the change-1 parity
run (idle Row 0, active-HUD hover, album, placard/frame hover, print, focused-frame hover, Photo Focus
regular + primary hover, `/photos/admin/login`), 47 computed properties on the HUD, focus bar,
placard, frame, sheen, `.gallery-root` and `.wall-world`, plus full-viewport PNGs.

| Check | Result |
| :--- | :--- |
| `pixelmatch` (threshold `0.1`, no anti-alias) across 11 states | **0 pixels differ in every state** (0.0000%) |
| Computed-style JSON | identical in 10/11 states; the `print` entry is the same run-to-run `PrintSharpOverlay` `.photo-sheen` settle jitter already reproduced between two change-1 head runs, with **0 changed pixels** |
| Fine-pointer `deviceorientation` listeners | **0** (probe below) |
| Fine-pointer sheen inline style after emitting two orientation samples | empty (`""`) |
| Desktop transition timing | byte-identical; 4 wall `:hover` rules remain in 4 fine-hover media blocks |

Coarse-pointer probe (`hasTouch: true`, `isMobile: true`, 390×844, Chromium — synthetic
`DeviceOrientationEvent`s, baseline `beta 50 / gamma -8`, delta `+22 / +18`):

```
album: 1 deviceorientation listener, (pointer: coarse)=true, (prefers-reduced-motion)=false
       frame transform   = matrix3d(… translateZ 22)   (unchanged; no tilt)
       .photo-sheen      = translate3d(-4.7%, -5.7%, 0px)   (30% of Print Focus travel)
print: focused frame       translateZ(58px) rotateY(3.27°) rotateX(-3.98°)  (within ±4°)
       --tilt-sx = -7.84px, --tilt-sy = -9.59px, .photo-sheen opacity 0.92
reduced-motion coarse: 0 listeners; sheen untouched
```

(`orientationchange` stays `0` in Chromium because the adapter uses `screen.orientation` `change`;
the rebase/reset path is covered by `useGyroTilt.test.ts`.)

---

## 10. PATCH-01 — Merge Conflict, Silent Gyro Fallback, Nits (RESOLVED)

Triggered by the PR #13 review (`REQUEST CHANGES`). Scope and root cause are recorded in
`patch.md`; this section is the executed evidence.

**Merge.** `git merge origin/main` brought PR #12 (`daa6ad0`) in as `f4bdb21` without rebasing, so the
commit SHAs referenced above are intact. The only conflict was
`openspec/specs/gallery-hud-and-curator-ui/spec.md`: resolved by keeping
`#### Scenario: Measurement disagreement never oscillates` at the end of the marquee requirement,
followed by the four `mobile-touch-compatibility` requirements. `openspec validate --specs --strict`
→ **9 passed, 0 failed**.

**Silent fallback fix.** `createGyroController` now tracks `hasEmittedSinceReset`. A context reset only
announces `{ nx: 0, ny: 0 }` when `announce && hasEmittedSinceReset`, so a device that never streamed a
sample (denied iOS permission, no gyroscope) never receives a synthetic hover pose. Two TDD guards were
added to `useGyroTilt.test.ts`; the `album → print` one failed before the fix with
`expected [ { nx: 0, ny: 0 } ] to deeply equal []`.

**Gates after the patch:**

```
$ npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts
 Test Files  1 passed (1) / Tests  21 passed (21)     # 19 existing + 2 new

$ npx vitest run
 Test Files  35 passed (35) / Tests  536 passed (536) # merged baseline 534 + 2

$ npx tsc --noEmit      # exit 0
$ npx eslint .          # exit 0
$ npm run build         # ✓ Compiled successfully, exit 0
$ openspec validate mobile-gyroscope-glare --strict   # valid
$ openspec validate --specs --strict                  # 9/9 passed
```

**Browser probe (coarse 390×844, no synthetic sensor events), then with samples:**

```
no sensors:   inline transform = "" (none), --tilt-sx/--tilt-sy = ""
              computed frame  = matrix3d(… translateZ 22)   # CSS rest pose, not the 58px hover pose
              sheen           = no inline style, opacity 0.44
with sensors: transform        = translateZ(58px) rotateY(3.27deg) rotateX(-3.99deg)
              --tilt-sx = -7.84px, --tilt-sy = -9.59px
              sheen translate3d(-15.5%, -19%, 0px), opacity 0.92
```

This is the exact regression the review named: denied/no-gyro stays at rest, while granted sensors still
drive the full Print Focus pose. No CSS changed and the fine-pointer path never emits, so the desktop
parity in §9 remains valid.

**Task tracking.** `4.3` is now the automated/Playwright/synthetic scope (`[x]`); `4.4` is the real
iPhone Safari / Android Chrome LAN/HTTPS check (`[ ]`, deferred to the maintainer). In
`mobile-touch-compatibility/tasks.md`, `5.3`/`5.4` stay unchecked and explicitly say physical-device
verification is deferred to the maintainer's local LAN run, distinct from automated/CI completion.

---

## 11. PATCH-02 — Gyro Dead-Band, No-Op Writes, Gesture-Scoped rAF (RESOLVED)

Triggered by real-device Safari Web Inspector A/B profiling on the PR #13 preview at `133dd21`
(iPhone 16 Pro, `S2` pan and `S4` print-idle, with Reduce Motion on/off). Full feedback trace is in
`patch.md`.

**Changes:**

- `MIN_EMIT_DELTA` raised `1e-3` → `0.004` (≈0.2° combined normalized movement), above resting MEMS
  noise. TDD red at `1e-3`: a converged `beta 50 → 50.1` sample emitted
  `ny = 0.00157…`, failing `expected [ … ] to deeply equal []`; green at `0.004`.
- `FramedPrint` compares the last formatted `transform`, `--tilt-sx`, `--tilt-sy`, sheen `transform`
  and `opacity` strings and skips identical writes. Album View compares the sheen transform only and
  never writes opacity.
- `GalleryCanvas` now runs a gesture-scoped rAF loop: `pointerdown` starts it; `pendingPanRef` /
  `pendingPinchRef` accumulate raw input; `flushPendingInputRef` applies one pan then one zoom per
  vsync (zoom factors multiplied, latest midpoint anchor); the loop stays alive while
  `gestureRef.current.pointers.length > 0`; both `will-change` teardown checks require zero pointers;
  `endPointer` re-arms `markGesture()` on the last lift. Wheel zoom, keyboard navigation,
  `wasDragged` tap suppression and the `2 → 1` hand-off are unchanged.

**Gates after the patch:**

```
$ npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts \
    src/components/wall/__tests__/pinchGesture.test.ts
 Test Files  2 passed (2) / Tests  31 passed (31)   # useGyroTilt 22 + pinch 9

$ npx vitest run
 Test Files  35 passed (35) / Tests  537 passed (537)  # 536 + the dead-band case

$ npx tsc --noEmit      # exit 0
$ npx eslint .          # exit 0
$ npm run build         # ✓ Compiled successfully, exit 0
$ openspec validate mobile-gyroscope-glare --strict   # valid
```

**Headless browser probes:**

```
gesture (1440×900, mouse down, 400ms stationary hold):
  loop alive: 6 frames (software SwiftShader PBR ≈15fps; a trivial rAF probe in the same
  page runs at 60fps, so the wall render is the limiter, not the loop)
  will-change = "transform" during hold
  after release + 700ms: 0 frames in the next 400ms, will-change = "auto"
  drag changed .wall-world transform to translate3d(237.311px, -280.576px, 0px)
  checks: loop alive ✓, will-change pinned ✓, auto after settle ✓, loop stopped ✓

gyro (390×844 coarse, synthetic DeviceOrientationEvent):
  sub-dead-band jitter (beta 50 → 50.1): no inline transform, sheen opacity 0.44 (rest)
  real tilt (beta 72 / gamma 10): translateZ(58px) rotateY(3.27deg) rotateX(-3.99deg),
  sheen opacity 0.92
```

**3-way `S2` preview verification — PENDING MANUAL DEVICE VERIFICATION.** On the PR #13 preview in
iPhone Safari, run the same 5-second pan three times and record fps / missed vsyncs in Web Inspector:

1. **Gyro ON** — expect ~60 fps while panning (baseline at `133dd21` was 36–39 fps / 36–43% missed).
2. **Reduce Motion ON** — expect ~60 fps; `createGyroController` must not be in the timeline at all.
3. **Motion & Orientation Access DENIED** — expect ~60 fps; no synthetic print pose (PATCH-01 guard).

`S4` with Reduce Motion may still show `PrintSharpOverlay`'s 60 commits/s; that is out of scope here.
Record device model, iOS/Safari version, and the timeline screenshot for each of the three runs.

---

## 12. Quick Re-Verification (60-second audit)

```bash
# 1) the change's own tests + the touch-audit invariant
npx vitest run src/components/wall/__tests__/gyroTilt.test.ts \
  src/components/wall/__tests__/useGyroTilt.test.ts src/lib/__tests__/touchAudit.test.ts
# expect: Test Files 3 passed (3) / Tests 51 passed (51)

# 2) types + lint + full suite + production build
npx tsc --noEmit                    # expect: no output, exit 0
npx eslint .                        # expect: no output, exit 0
npx vitest run                      # expect: Test Files 35 passed (35) / Tests 537 passed (537)
npm run build                       # expect: ✓ Compiled successfully, exit 0

# 3) the change artifacts still validate
openspec validate mobile-gyroscope-glare --strict
# expect: Change 'mobile-gyroscope-glare' is valid

# 4) the coarse-only transition block exists exactly once, desktop timing untouched
grep -c "@media (pointer: coarse)" src/styles/wall.css   # expect: 1
grep -c "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)" src/styles/wall.css  # expect: 1
```

If any of those drift, the invariants to protect are: **the entry holding angle is neutral, the four
screen orientations map to the same screen-intuitive signs, the smoother is time-based, no listener
ever attaches on a fine pointer or under Reduce Motion, permission is asked once inside the tap, and
Album View moves nothing but the glare.**
