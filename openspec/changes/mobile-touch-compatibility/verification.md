# Verification — `mobile-touch-compatibility`

> Scope note: this session had **no physical iPhone or Android device attached** and was instructed not
> to run Playwright/headless browser suites. Every device-dependent claim below is marked
> `PENDING MANUAL DEVICE VERIFICATION` and must **not** be treated as passed. Section 7 gives the exact
> maintainer procedure.

---

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `mobile-touch-compatibility` |
| Branch | `feat/multi-20261125-0558` (cut from `main` @ `3e59548`, orchestrator-mandated name) |
| Status | **Implementation complete; automated + static audit gates green; device + browser-parity gates open** |
| Date | 2026-11-25 |
| OS | Linux (container, `linux`) |
| Node / runner | project-local `node_modules`; `npx vitest run` (vitest 5.1.1), `npx tsc --noEmit` (TypeScript 5.9.3), `npx eslint .` (ESLint 9.39.5), `npm run build` (Next 16.4.6) |
| Interpreter | no Python runtime involved; all commands run through `npx`/`npm` from the repo root |
| Test environment | `vitest.config.ts`: Node environment, `fileParallelism: false`, `maxWorkers: 1` |

**Totals (before → after):**

| Metric | Baseline (`main` @ `3e59548`) | Now | Delta |
| :--- | ---: | ---: | ---: |
| Test files passing | 31 | **33** | +2 |
| Tests passing | 463 | **482** | +19 |
| Tests removed / skipped | 0 | 0 | 0 |
| Failing tests | 0 | 0 | 0 |

Nothing was deleted or skipped, so the growth is additive: 9 tests in
`src/components/wall/__tests__/pinchGesture.test.ts` + 10 in `src/lib/__tests__/touchAudit.test.ts`.

**Files changed**

| Path | Change |
| :--- | :--- |
| `src/components/wall/pinchGesture.ts` | **new** — pure `pinchStep` + pointer hand-off state machine |
| `src/components/wall/__tests__/pinchGesture.test.ts` | **new** — 9 tests (TDD red first) |
| `src/lib/__tests__/touchAudit.test.ts` | **new** — 10 static-audit tests (TDD red first) |
| `src/components/wall/GalleryCanvas.tsx` | `gestureRef` replaces `pointersRef`/`pinchRef`/`draggedRef`; pan-then-zoom pinch; `gesturestart`/`gesturechange` guard |
| `src/app/layout.tsx` | `export const viewport` with `viewportFit: 'cover'` |
| `src/styles/hud.css` | `max(…, env(safe-area-inset-*))` offsets, 3 in-place `:hover` gates, `@media (pointer: coarse)` 44px hit areas |
| `src/styles/wall.css` | 4 in-place `:hover` gates |
| `src/styles/studio.css` | photo tiles `touch-action: manipulation` + callout/selection resets |
| `src/components/wall/FramedPrint.tsx` | tilt/sheen/leave gated on `pointerType === 'mouse'` |
| `src/components/wall/SoundtrackPlaque.tsx` | `&playsinline=1` |
| `src/components/admin/CuratorStudio.tsx` | `MouseSensor` + `TouchSensor` + `KeyboardSensor` |
| `src/components/admin/AlbumEditor.tsx` | `MouseSensor` + `TouchSensor` + `KeyboardSensor` |
| `openspec/changes/mobile-touch-compatibility/tasks.md` | checkboxes + evidence notes |
| `openspec/changes/mobile-touch-compatibility/verification.md` | this document |

---

## 2. Requirement Adherence Audit Matrix

Every scenario of the three delta specs. `PASS (automated)` = an executed unit test asserts it.
`PASS (audit)` = a static source/CSS assertion executed in `touchAudit.test.ts` (a capability that has no
runtime unit to test). Anything a browser or a physical device must observe is
`PENDING MANUAL DEVICE VERIFICATION`.

### 2.1 `specs/spatial-camera-navigation/spec.md`

**Requirement: Two-finger pinch zooms and pans together, and never zooms the page**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *Pinch while sliding pans the wall* — pinch outward + both fingers 120px right ⇒ zoom about the moving midpoint + translate 120px right, content stays under the midpoint | `pinchGesture.test.ts` › “moves the wall 120px right when a widening pinch also slides 120px right” (`zoomFactor 1.8`, `panDx 120`, anchored world point lands exactly on `mid(curr)`, ε = 1e-6). Wiring: `GalleryCanvas` `size >= 2` branch calls `panByPixels(panDx, panDy)` then `zoomBy(anchor − rect, zoomFactor)` | **PASS (automated)** |
| S2 | *Pure pinch keeps zoom-only behaviour* | `pinchGesture.test.ts` › “zooms by the distance ratio about a stationary midpoint with no pan” (`panDx = panDy = 0`, `zoomFactor = d1/d0`, anchor = midpoint) | **PASS (automated)** |
| S3 | *Lifting one finger hands off to a one-finger pan* — no jump, no click on release | `pinchGesture.test.ts` › “hands a 1 → 2 → 1 finger sequence off without a positional jump” (next move = `dx 10`, not `60`) and “keeps the drag latch through release so the click that follows a pan is ignored”. `GalleryCanvas.onClick` returns early while `gestureRef.current.dragged` | **PASS (automated)** for the state machine; the *finger-on-glass* smoothness/click suppression is **PENDING MANUAL DEVICE VERIFICATION** |
| S4 | *Page zoom is suppressed over the wall* | `GalleryCanvas` registers non-passive `gesturestart`/`gesturechange` `preventDefault()` on the wall container with matching cleanup (`touchAudit` does not cover event wiring; verified by code read + `tsc`) | **PENDING MANUAL DEVICE VERIFICATION** (WebKit may ignore `preventDefault` on `gesture*` in some versions — see §6) |

**Requirement clause — “while the camera is unclamped”:** the invariant tests use `z = 38` with a
`1.4`–`1.8` factor, i.e. inside `[ZOOM_MIN, ZOOM_MAX]`, and the reference camera application mirrors
`GalleryCanvas` exactly (pan with `worldPerPixel(camera.z)` then `zoomToCursor`), so no clamp is engaged.

### 2.2 `specs/gallery-hud-and-curator-ui/spec.md`

**Requirement: Safe-area-aware HUD under a viewport-fit=cover viewport**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *iPhone notch and home indicator do not cover the HUD* | `touchAudit.test.ts` › “exports a viewport with viewport-fit=cover” (`width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`) + compiled HTML emits `content="width=device-width, initial-scale=1, viewport-fit=cover"` (§3.5). The `max()` offsets themselves | Static half **PASS (audit)**; physical clearance (portrait/landscape Dynamic Island, home indicator) **PENDING MANUAL DEVICE VERIFICATION** |
| S2 | *Desktop layout unchanged* | Every offset keeps its pre-change literal as the `max()` floor with an `env(…, 0px)` fallback: `max(24px, …)`/`max(22px, …)` base, `max(12px, …)`/`max(14px, …)` ≤ 767px ⇒ computed `24px`/`22px`/`12px`/`14px` when insets are `0`. Verified in the built CSS (§3.5) | **PASS (audit)**; computed-style/pixel parity run **DEFERRED** to the orchestrator (§8) |

**Requirement: Coarse-pointer touch targets of at least 44 by 44 CSS pixels**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *HUD buttons are comfortably tappable* — ≥ 44×44, adjacent targets do not overlap | Built CSS: `@media (pointer:coarse){.hud-button{position:relative}.hud-button:before{content:"";width:max(100%,44px);height:max(100%,44px);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}}`. Out-of-flow, transparent ⇒ no visible-size change; `max(100%, …)` never widens past the button, so neighbours keep their gutters | **PASS (audit)** for the rule; measured hit boxes **PENDING MANUAL DEVICE VERIFICATION** |

**Requirement: HUD hover effects only for fine hover-capable pointers**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *Active HUD button retains active fill when hovered on desktop* | `touchAudit.test.ts` › “src/styles/hud.css wraps every :hover rule…” (exactly **3** hover rules, each inside its own `@media (hover: hover) and (pointer: fine)`) — wrapped **in place**, so `.hud-button:hover` still precedes `.hud-button.active` and `.photo-focus-bar .hud-button-primary:hover` still follows `.hud-button-primary` | **PASS (audit)**; hovered computed-style/pixel comparison **DEFERRED** to the orchestrator (§8) |

**Requirement: Touch-safe drag reordering in the Curator Studio**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *Swiping over the photo grid scrolls the editor* — no drag starts | `touchAudit` › “.album-editor-photo-media uses touch-action: manipulation without OS callouts” (+ list-row variant) and “keeps touch-action: none only on the dedicated drag handle” (built CSS: exactly one `touch-action:none`, owned by `.studio-album-drag`) | **PASS (audit)**; swipe feel **PENDING MANUAL DEVICE VERIFICATION** |
| S2 | *Long-press drags a photo* — 250ms, ≤5px, reorder, Save Order persists | `touchAudit` › “src/components/admin/{CuratorStudio,AlbumEditor}.tsx reorders with MouseSensor + TouchSensor” (`useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })`, no `PointerSensor`) | **PASS (audit)**; persistence on a real phone **PENDING MANUAL DEVICE VERIFICATION** |
| S3 | *Mouse and keyboard reordering unchanged* | Same test asserts `useSensor(MouseSensor, { activationConstraint: { distance: 4 } })` and the existing `KeyboardSensor` remains; `photoOrderState` + route tests green | **PASS (audit)**; mouse/keyboard smoke **PENDING MANUAL DEVICE VERIFICATION** |

### 2.3 `specs/3d-pbr-wall-and-lighting/spec.md`

**Requirement: Hover effects only for fine hover-capable pointers**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *Tapping a print does not tilt or stick* | `FramedPrint.onPointerMove` / `onPointerLeave` return early unless `event.pointerType === 'mouse'`; `touchAudit` › “src/styles/wall.css wraps every :hover rule…” (exactly **4** rules gated in place: `museum-placard.mat-aluminum`, `soundtrack-plaque`, `photo-frame`, `photo-frame.is-lit`) | **PASS (audit)** for the gates; “no stuck lift after a tap” **PENDING MANUAL DEVICE VERIFICATION** |
| S2 | *Mouse hover tilt unchanged on desktop* | `onPointerEnter` prefetch still runs for **all** pointer types; the mouse branch body is byte-identical to `main` apart from the new guard | **PASS (audit)**; visual parity **DEFERRED** to the orchestrator (§8) |

**Requirement: Inline YouTube playback on soundtrack plaques**

| # | Scenario | Verifying evidence | Status |
| :-- | :--- | :--- | :--- |
| S1 | *iPhone plays the soundtrack inside the plaque* | `touchAudit` › “adds playsinline=1 to the public embed URL” — the extracted `youtube-nocookie.com/embed/…` URL is `…?autoplay=1&rel=0&modestbranding=1&playsinline=1` (existing parameter order preserved, one appended parameter) | **PASS (audit)**; actual inline-vs-full-screen behaviour **PENDING MANUAL DEVICE VERIFICATION** |

---

## 3. Empirical Execution Logs (verbatim)

### 3.1 TDD red phase — before any implementation (task 1.3)

```
$ npx vitest run src/components/wall/__tests__/pinchGesture.test.ts src/lib/__tests__/touchAudit.test.ts
 FAIL  src/components/wall/__tests__/pinchGesture.test.ts
Error: Cannot find module '../pinchGesture' imported from
  …/src/components/wall/__tests__/pinchGesture.test.ts
     × src/styles/wall.css wraps every :hover rule in @media (hover: hover) and (pointer: fine)
     × src/styles/hud.css wraps every :hover rule in @media (hover: hover) and (pointer: fine)
     × .album-editor-photo-media uses touch-action: manipulation without OS callouts
     × .album-editor-photo.is-list-row .album-editor-photo-media uses touch-action: manipulation without OS callouts
     × keeps touch-action: none only on the dedicated drag handle
     × exports a viewport with viewport-fit=cover
     × adds playsinline=1 to the public embed URL
     × src/components/admin/CuratorStudio.tsx reorders with MouseSensor + TouchSensor
     × src/components/admin/AlbumEditor.tsx reorders with MouseSensor + TouchSensor

 Test Files  2 failed (2)
      Tests  9 failed | 1 passed (10)
```

Representative failure messages (each names the exact missing implementation, not a broken test):

```
AssertionError: .playground-wall-root .museum-placard.mat-aluminum:hover in src/styles/wall.css
  is not inside @media (hover: hover) and (pointer: fine): expected false to be true
AssertionError: .hud-button:hover in src/styles/hud.css
  is not inside @media (hover: hover) and (pointer: fine): expected false to be true
AssertionError: .album-editor-photo-media: expected [ 'position: relative', …(7) ]
  to include 'touch-action: manipulation'
AssertionError: expected [ '.studio-album-drag', …(1) ] to deeply equal [ '.studio-album-drag' ]
AssertionError: expected 'import type { Metadata } from \'next\'…' to match /export const viewport: Viewport = \{/
AssertionError: expected 'youtube-nocookie.com/embed/${soundtra…' to contain 'playsinline=1'
AssertionError: expected '\'use client\';\n\n/**\n * Persistent…' to contain 'MouseSensor'
```

(The single pre-pass — “never pins the page zoom” — is a negative assertion that is trivially true
before the `viewport` export exists; it becomes meaningful alongside the positive one.)

### 3.2 Targeted green (post-implementation)

```
$ npx vitest run src/components/wall/__tests__/pinchGesture.test.ts \
    src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
 Test Files  3 passed (3)
      Tests  27 passed (27)
   Duration  553ms
```

`cssBoundaryAudit` stays green with the hover rules wrapped in place: its “one owner for every
normalized top-level selector” and globals/wall/hud boundary assertions are unaffected.

### 3.3 Full suite (tasks 4.3, 5.1)

```
$ npx vitest run
 Test Files  33 passed (33)
      Tests  482 passed (482)
   Duration  9.79s (tests 67%, import 25%, transform 5%, worker 3%)
```

Dependent suites named in `tasks.md` 4.3, run individually:

```
$ npx vitest run src/components/admin/__tests__/photoOrderState.test.ts \
    src/lib/__tests__/publicBoundaryAudit.test.ts src/lib/__tests__/rawUrlAudit.test.ts
 Test Files  3 passed (3)
      Tests  29 passed (29)
```

### 3.4 TypeScript

```
$ npx tsc --noEmit
tsc exit=0
```

### 3.5 Build, emitted viewport meta, compiled CSS probes

```
$ npm run build
✓ Compiled successfully in 1911ms
✓ Generating static pages using 2 workers (13/13) in 513ms
build exit=0
```

Emitted viewport meta (`/` and `/admin`):

```
$ grep -rho 'name="viewport" content="[^"]*"' .next/server/app/index.html .next/server/app/admin.html | sort -u
name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"
```

(`_global-error.html` keeps Next's own built-in viewport meta — it does not render this layout.)

Compiled `hud.css` (media queries preserved, hit area intact):

```
@media (hover:hover) and (pointer:fine)
@media (max-width:767px)
@media (pointer:coarse)
.hud-button:before{content:"";width:max(100%,44px);height:max(100%,44px);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.hud-top-right{top:max(24px, env(safe-area-inset-top,0px));right:max(24px, env(safe-area-inset-right,0px));…}
.photo-focus-bar{padding:11px max(22px, env(safe-area-inset-right,0px)) calc(11px + env(safe-area-inset-bottom,0px)) max(22px, env(safe-area-inset-left,0px));…}
```

Compiled `wall.css` chunk: `4` `:hover` rules and `4` `@media (hover:hover) and (pointer:fine)` blocks —
i.e. one block per rule, in the original source positions.

Compiled `studio.css` chunk:

```
.album-editor-photo.is-list-row .album-editor-photo-media{touch-action:manipulation;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;flex:0 0 64px;width:64px}
.album-editor-photo-media{aspect-ratio:1;cursor:grab;touch-action:manipulation;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;background:#e9e6df;…overflow:hidden}
.studio-album-drag{color:#1a1b1966;cursor:grab;touch-action:none;…}
```

Exactly **one** `touch-action:none` survives, and it is `.studio-album-drag`. The grid tile did **not**
inherit the list-row `flex`/`width` (checked explicitly — minifier output is semantics-preserving).

### 3.6 ESLint

```
$ npx eslint .
eslint exit=0
```

The earlier implementation session saw 929 errors from a local, `.gitignore`d
`test-results/parity-baseline/.next/**` build tree (scratch output from the parity harness, not part of
the repository). The orchestrator removed that scratch tree before the final gate; a clean checkout has
no such directory. All first-party source, including the 12 changed/new files, is clean.

---

## 4. Nomenclature & Code-Symbol Audit

Glossary terms from `research.md`, and the code that must mean the same thing:

| Glossary term | Code symbol / selector | Consistent? |
| :--- | :--- | :--- |
| **Coarse pointer** | `@media (pointer: coarse)` (`hud.css`); `event.pointerType !== 'mouse'` (`FramedPrint`); `TouchSensor` (`CuratorStudio`, `AlbumEditor`). Never a width breakpoint | ✅ capability-gated, no UA sniffing |
| **Fine hover** | `@media (hover: hover) and (pointer: fine)` — 4 blocks in `wall.css`, 3 in `hud.css`; `isFineHoverPrelude()` in `touchAudit.test.ts` requires both features in the prelude | ✅ |
| **Two-finger pan** | `PinchStep.panDx` / `panDy` (`pinchGesture.ts`) ⇒ `panByPixels(panDx, panDy)`; `PinchStep.anchor` ⇒ `zoomBy(anchor − rect, zoomFactor)` | ✅ pan and zoom are separate, pan applied first |
| **Safe area** | `export const viewport: Viewport = { viewportFit: 'cover' }` (`layout.tsx`); `max(<design>, env(safe-area-inset-*, 0px))` (`hud.css`) | ✅ design padding never shrinks |
| **Touch target** | `.hud-button::before` with `width/height: max(100%, 44px)`, centred, transparent | ✅ invisible; visible boxes untouched |
| **Inline playback** | `playsinline=1` on the plaque iframe `src` | ✅ matches the Studio probe players |
| Drag latch (D2) | `GestureState.dragged`, cleared on `0 -> 1` only (`beginPointer`), preserved on `2 -> 1` (`releasePointer` + `startX/startY` rebase) | ✅ |
| Drag threshold | `DRAG_THRESHOLD_PX = 5`, now exported from `pinchGesture.ts` (was a `GalleryCanvas` local) | ✅ single owner, default arg of `movePointer` |

No new colour, type, spacing token or class name was introduced; every new identifier is either a
glossary term or a pure-maths name (`pinchStep`, `beginPointer`, `movePointer`, `releasePointer`,
`createIdleGesture`, `PinchPoints`, `PinchStep`, `GesturePointer`, `GestureState`, `PointerMove`).

---

## 5. Scope / Spec Deviations (recorded, not silent)

1. **Branch name.** Task 1.0 says “branch from it as `feat/mobile-touch-compatibility`”; the orchestrator
   mandated `feat/multi-20261125-0558` cut from `main` @ `3e59548`. The prerequisite itself **is**
   satisfied: `SoundtrackPlaque.tsx` on `main` calls `showsIframeFor(state, album.id)`.
2. **`GalleryCanvas` ref shape.** Task 2.2 words it as “have `pinchRef` store both points”; the
   implementation instead collapses `pointersRef` + `pinchRef` + `draggedRef` into one
   `gestureRef: GestureState` owned by the pure helpers (which *do* store both points in
   `state.pinch`). Behaviourally identical, and it is what makes the hand-off unit-testable.
3. **One extra unit test** beyond the five bullets in task 1.1: a scenario-shaped “120px slide during a
   widening pinch ⇒ 120px on-screen translation” case, so the matrix can cite the spec scenario
   literally rather than by analogy.
4. **`touchAudit` comment stripping.** The “no `userScalable` / `maximumScale`” assertions run against
   the source with block comments stripped, because `layout.tsx`'s doc comment legitimately names both
   forbidden options while explaining why they are absent. The assertion still fails if either key is
   added to the `viewport` object.
5. **`npx eslint .`** cannot be green in this working copy for the pre-existing, out-of-scope reason in
   §3.6. Replacement evidence: `npx eslint src` (exit 0) and `npx eslint . --ignore-pattern
   'test-results/**'` (exit 0).
6. **Task 5.2 browser harness not run** — explicit session instruction. Its static half is recorded in
   §2.2 (safe-area floors, in-place hover gating); the computed-style + pixelmatch run is listed as
   DEFERRED for the orchestrator.

---

## 6. Resolved Assumptions & Empirical Proof

From `research.md` “Unverified assumptions”. **None can be closed from this session** — the code changes
are the mitigation, not the proof:

| Assumption | What the change does | Proof status |
| :--- | :--- | :--- |
| iPhone Safari without `playsinline` may go full screen | Appends `playsinline=1` | Mitigation in place; **PENDING MANUAL DEVICE VERIFICATION** |
| Sound may not start on the first tap inside a cross-origin iframe | Unchanged (out of scope; the public CSP forbids the IFrame API that could detect it) | **PENDING MANUAL DEVICE VERIFICATION**; if confirmed, log as a follow-up |
| iOS Safari may still pinch-zoom the page despite `touch-action: none` | Adds non-passive `gesturestart`/`gesturechange` `preventDefault()` on the wall container (inert off WebKit) | Mitigation in place; **PENDING MANUAL DEVICE VERIFICATION** (`visualViewport.scale === 1`) |
| 250 ms long-press feels right for reordering | `TouchSensor { delay: 250, tolerance: 5 }` | **PENDING MANUAL DEVICE VERIFICATION** on both platforms |
| Memory with ~10 albums at DPR 3 stays below the iOS tab-kill threshold | Untouched (measurement only) | **PENDING MANUAL DEVICE VERIFICATION** |

No claim was moved to `Superseded claims` — no device evidence exists to supersede anything.

---

## 7. PENDING MANUAL DEVICE VERIFICATION (exact maintainer instructions)

Prerequisites: a local DB (`DATABASE_URL` pointing at a local file), `STORAGE_DRIVER=local`, and the
phone on the same LAN. **Never** point the phone at preview/production; read-only viewing of production
`/photos` is acceptable for the final visual check only.

```bash
# from the repository root
next dev -H 0.0.0.0          # note the LAN URL printed, e.g. http://192.168.1.24:3000
```

Then, on **iPhone Safari** and on **Android Chrome** (record OS + browser version for each):

1. **Safe area** — open `/photos?demo=4&mood=chiaroscuro`, rotate portrait → landscape.
   Pass when `.hud-top-right` (top-right `Overview`) and `.photo-focus-bar` (Prev / Next / Return +
   caption) never sit under the Dynamic Island, rounded corners or home indicator.
   Extra: in Web Inspector, confirm the meta tag reads
   `width=device-width, initial-scale=1, viewport-fit=cover`.
2. **Pinch + pan** — two-finger pinch while sliding both fingers across the wall.
   Pass when the print/placard under the midpoint stays under it. Then check
   `visualViewport.scale === 1` in remote Web Inspector (it must **not** exceed 1).
3. **Finger lift** — start a two-finger pinch/pan, lift one finger, keep dragging.
   Pass when the pan continues smoothly with no jump and **no print opens** on release
   (the click must be swallowed).
4. **No sticky hover** — tap several prints, a placard, the soundtrack plaque and each HUD button,
   then lift. Pass when nothing stays lifted/tilted and no sheen remains.
5. **Touch targets** — measure `.hud-button` boxes in Web Inspector (or DevTools “Show tap highlight”).
   Pass when every one is ≥ 44 × 44 px and thumb taps on `Overview`, `← PREV`, `NEXT →`, `RETURN [ESC]`
   never miss or hit a neighbour.
6. **Inline soundtrack** — tap a soundtrack plaque on iPhone.
   Pass when playback is inline with no native full-screen player. **Record whether audio starts on the
   first tap**; if it does not, add it to `verification.md` as an out-of-scope follow-up.
7. **Studio scroll vs drag** — `/photos/admin` → Exhibitions → Photos. Swipe vertically across the photo
   grid: the panel must scroll and no drag may start. Then long-press a tile ~250 ms without moving and
   drag: the tile must pick up, reorder, and **Save Order** must persist it (local DB only).
   Long-press must show **no** iOS image callout, **no** text selection and **no** Android `contextmenu`.
8. **Studio desktop** — with a mouse (4 px movement) and with the keyboard sensor, reordering must feel
   exactly as before.
9. **Memory (measurement only)** — browse ~10 albums at print focus with Web Inspector › Timelines ›
   Memory recording; record the peak and note any tab reload as a follow-up candidate.

Record per item: device model, OS version, browser version, pass/fail, and a screenshot or screen
recording where the item is visual. Until then, items 2–4 and 6–7 remain open against
`specs/spatial-camera-navigation`, `specs/gallery-hud-and-curator-ui` and
`specs/3d-pbr-wall-and-lighting`.

---

## 8. Orchestrator Browser Parity (task 5.2) — PASS, 0 diffs

Run by the orchestrator after the automated gates, using production `next start` builds of
`main` @ `3e59548` (baseline) and `feat/multi-20261125-0558` (head). Chromium headless,
`1440×900`, DPR 1, fine pointer, `?demo=4&mood=chiaroscuro`; CSS animations/transitions frozen before
each capture. Captured states: idle Row 0, active-HUD hover, album focus, `.museum-placard` hover,
`.photo-frame` hover, print focus, focused-frame hover, Photo Focus regular + primary-button hover,
and `/photos/admin/login`. For each state the harness recorded `getComputedStyle` for 47 properties on
the HUD, focus bar, placard, frame, sheen, `.gallery-root` and `.wall-world`, plus a full-viewport PNG.

| Check | Result |
| :--- | :--- |
| `pixelmatch` (threshold `0.1`, no anti-alias) across all 11 states | **0 pixels differ in every state** (0.0000%) |
| Computed-style JSON, 10 of 11 states | **identical** |
| Computed-style JSON, `print` state | 1 transient entry: the `PrintSharpOverlay` `.photo-sheen` rect/size (≈0.7%). Reproduced between two consecutive **head** runs, while the corresponding screenshot stayed at **0 pixels**; it is rAF/`PrintSharpOverlay` settle jitter, not a style change. |
| Verdict | **PASS — no desktop computed-style or visual regression** |

Coarse-pointer pass (same build, `hasTouch: true`, `isMobile: true`):

```
390×844:  (pointer: coarse)=true, (pointer: fine)=false, (hover: hover)=false
          viewport meta = width=device-width, initial-scale=1, viewport-fit=cover
          .hud-button "Overview": visible 93×44, ::before 93.05×44, position absolute
1024×800: (pointer: coarse)=true
          .hud-button "Overview": visible 93×30, ::before 93.05×44
Touch tap on a print: transform and sheen before === after (no tilt, no stuck hover).
```

Why 0-diff was expected and confirmed: every gated `:hover` rule keeps its declarations and its position
in the cascade (only the enclosing `@media` is new), and every safe-area value degrades to its previous
literal through the `max()` floor when `env()` is `0px`.

---

## 9. Quick Re-Verification (60-second audit)

```bash
# 1) the change's own tests + the CSS boundary audit
npx vitest run src/components/wall/__tests__/pinchGesture.test.ts \
  src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
# expect: Test Files 3 passed (3) / Tests 27 passed (27)

# 2) types + lint + full suite + production build
npx tsc --noEmit                                   # expect: no output, exit 0
npx eslint .                                       # expect: no output, exit 0
npx vitest run                                     # expect: Test Files 33 passed (33) / Tests 482 passed (482)
npm run build                                      # expect: ✓ Compiled successfully, exit 0

# 3) the emitted viewport meta
grep -rho 'name="viewport" content="[^"]*"' .next/server/app/index.html | sort -u
# expect: name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"
```

If any of those drift, the invariant to protect is: **hover effects never reach touch, the pinch keeps
the world point under the fingers, the finger-lift hand-off never jumps, and no HUD control hides under
an inset.**
