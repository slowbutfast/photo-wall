# Architecture: Mobile Gyroscope Rotational Glare

> [!NOTE]
> This document specifies **technical system architecture only** (sensor math, orientation axis mapping, iOS permission lifecycle, and rAF throttling).
> Visual behavior and per-tier amplitudes are specified in `design.md`.

## Context

`FramedPrint.tsx` already maps normalized `(nx, ny)` in `[-0.5, +0.5]` to 3D `rotateY`/`rotateX`, `--tilt-sx`/`--tilt-sy` wall shadows, and 2D `.photo-sheen` `translate3d(-nx * 38%, -ny * 38%, 0)` for mouse hover. `PrintSharpOverlay.tsx` mirrors `frame`'s computed transform and `.photo-sheen` every rAF during Print Focus. After `mobile-touch-compatibility` gates mouse hover tilt to `pointerType === 'mouse'`, mobile devices have no continuous tilt/glare driver.

## System Architecture Diagram

```mermaid
flowchart LR
  Tap["Tap FramedPrint (iOS)"] -->|user gesture| Perm["DeviceOrientationEvent.requestPermission()"]
  Perm -->|granted / non-iOS| Hook["useGyroTilt(tier, focusedPhotoId)"]
  Hook -->|coarse pointer & !reduced-motion| Ev["window deviceorientation (beta, gamma)"]
  Ev --> Math["gyroTilt.ts\n1. capture/rebase baseline (beta0, gamma0)\n2. wrap delta & map signs by screen.orientation.angle\n3. clamp ±22° -> [-0.5, +0.5]\n4. time-based smooth (tau=85ms)"]
  Math -->|rAF throttled| Canvas["GalleryCanvas -> AlbumTier -> FramedPrint"]
  Canvas -->|album tier| Sheen["Glare-only .photo-sheen (30% amp)"]
  Canvas -->|print tier (focused)| Full["rotateX/Y (±4°) + --tilt-sx/sy + .photo-sheen (100%)"]
  Full -->|automatic rAF mirror| Sharp["PrintSharpOverlay"]
```

## Goals / Non-Goals

**Goals:**
- Pure, deterministic sensor math (`gyroTilt.ts`) decoupled from DOM/React and 100% unit-tested in Node Vitest.
- Zero React state re-renders per sensor tick — `useGyroTilt` updates via rAF-throttled refs/callbacks or lightweight CSS custom properties (`--gyro-nx`, `--gyro-ny`) / ref subscription so 60fps mobile scrolling/zooming stays smooth.
- Zero impact on `(pointer: fine)` desktop browsers and automatic opt-out under `prefers-reduced-motion: reduce`.

**Non-Goals:**
- Adding a custom permission modal or HUD toggle button in v1.
- Running gyroscope effects at Macro tier (`scale < 0.25`).

## Technical Decisions

### D1. Relative-to-Entry Baseline, Explicit Orientation Signs, & Time-Based Smoothing (`gyroTilt.ts`)
- **Decision:** Capture `(beta0, gamma0)` on the first valid finite `deviceorientation` sample after entering `album` or `print` focus, and reset both the baseline (`baseline = null`) and smoother (`{ nx: 0, ny: 0 }`) whenever `tier`, `focusedPhotoId`, or `screen.orientation` changes (listening to `screen.orientation` `'change'` with `window` `'orientationchange'` fallback). Ignore any event where `beta` or `gamma` is `null` or non-finite. Compute wrapped angular deltas `dBeta`, `dGamma` in `[-180, 180]`, map them by `screen.orientation?.angle ?? 0` using the explicit sign table below, clamp to `±22°` (`DEFAULT_GYRO_MAX_DEG`), divide by `2 * 22` to produce `(nx, ny)` in `[-0.5, +0.5]`, and apply time-based exponential smoothing `smoothTilt(prev, next, dtMs, tauMs = 85)` where `alpha = 1 - Math.exp(-clamp(dtMs, 0, 100) / tauMs)`:

| `screenAngleDeg` | `screenXDeg` (mapped to `nx`, `rotY`) | `screenYDeg` (mapped to `ny`, `-rotX`) |
| :--- | :--- | :--- |
| `0` (portrait) | `+dGamma` | `+dBeta` |
| `90` (landscape CCW) | `-dBeta` | `+dGamma` |
| `180` (upside-down) | `-dGamma` | `-dBeta` |
| `270` (landscape CW) | `+dBeta` | `-dGamma` |

- **Rationale:** Visitors hold phones at `35°–60°`, not flat; relative calibration + explicit orientation signs ensure tilting the right edge of the screen down always yields `nx > 0` (`rotY > 0`) and tilting the top of the screen toward the viewer always yields `ny < 0` (`rotX > 0`). Rebasing on live `screen.orientation` changes prevents sudden jumps when rotating mid-session, and time-based smoothing keeps responsiveness uniform across 30Hz, 60Hz, and 120Hz displays.

### D2. Testable Sensor Lifecycle Seam & First-Tap iOS `requestPermission()` (`useGyroTilt.ts`)
- **Decision:** Separate sensor orchestration into a framework-free `createGyroController(adapter: GyroAdapter, onTilt)` factory (with production defaults for `matchMedia`, `DeviceOrientationEvent`, `screen.orientation`, and `requestAnimationFrame`), wrapped by `useGyroTilt` in React. Export `requestGyroPermission()` (memoizing the session result once asked and swallowing rejections into `'denied'`). Call it synchronously inside `FramedPrint`'s `onClick` handler alongside `onSelectPhoto(albumId, photo.id)` on `(pointer: coarse)` devices when `DeviceOrientationEvent.requestPermission` is a function.
- **Rationale:** iOS Safari requires `requestPermission()` inside a synchronous user-gesture call stack; extracting `createGyroController` makes permission states, capability gating, tier attach/detach, live orientation-change rebasing, and null-reading resilience 100% unit-testable in Vitest (`jsdom` / Node) without extra React testing dependencies.

### D3. Imperative DOM / CSS Variable Updates Without React Re-Render Loops
- **Decision:** Keep sensor updates off React `setState` on every `deviceorientation` event (which fires at 60–120Hz). Instead, `useGyroTilt` writes smoothed `(nx, ny)` to a shared ref and triggers a rAF callback (or updates CSS custom properties `--gyro-nx`, `--gyro-ny` on the container / subscribed `FramedPrint` refs) only when `Math.abs(dx) + Math.abs(dy) > 1e-3`.
- **Rationale:** Prevents 60Hz React reconciliation across 12–20 `FramedPrint` components in Album View.

## Risks / Trade-offs

- **[Risk] Gimbal lock when phone is held vertically near `beta = 90°`.** → **Mitigation:** Clamp `±22°` around the entry baseline and wrap deltas safely to `[-180, 180]`; `smoothTilt` prevents sudden sign-flip spikes.
- **[Risk] iOS `deviceorientation` blocked on non-HTTPS LAN dev (`http://192.168...`).** → **Mitigation:** Test on LAN via HTTPS tunnel (e.g. `cloudflared` quick tunnel) or production Vercel preview URL.

## Migration & Rollback Plan

- Pure frontend addition sequenced after `mobile-touch-compatibility`; rollback is a single `git revert`.
