## Source material

### 2026-11-26: maintainer, first report (mobile NEXT recording, iPhone Safari, portrait)

Quoted verbatim:

```text
I now want to start a new change to fix some of the animations and clean them up. This is the start of that, as I want to fix some of the mobile rendering artifacts. Can you investigate this and propose some fixes? During the mobile NEXT transitions in your recording, there are five distinct visual artifacts caused by how iOS Safari composites CSS 3D transforms, shadows, and camera panning on a narrow portrait viewport:
1. End-of-Transition Perspective "Pop" (Trapezoid Skew Snap)
 * What happens: Mid-transition (0:00.50, 0:01.50, 0:02.50, 0:03.50, 0:04.50, 0:05.50), the incoming frame visibly skews into a 3D trapezoid as it slides toward center, and then abruptly "pops" flat a fraction of a second later (0:00.75, 0:01.75, 0:02.75, 0:03.75, 0:04.75) when the easing finishes.
 * Why it happens: Either the 3D perspective origin shifts unevenly while the wall container translates, or a residual hover/touch rotateX/rotateY tilt state is resetting at the end of the camera spring—causing the frame's extruded side bevels and drop shadow to visibly jump once the motion stops.
2. Mitered Mat Corner Seams & Subpixel Aliasing
 * What happens: Across the four diagonal corners of each white mat board (0:00.75, 0:01.75, 0:02.75, 0:04.75), faint dark/gray hairline seams appear along the 45-degree bevel angles, and the inner edge of the mat shimmers slightly during horizontal movement.
 * Why it happens: On high-DPR mobile Retina screens, WebKit subpixel-rounds angled CSS gradients/borders when an element is moving along fractional translate3d coordinates, exposing 1px anti-aliasing seams between adjacent bevel layers.
3. Wall Shadow & Spotlight Banding During Pan (iOS WebKit Layer Re-rasterization)
 * What happens: While the wall slides horizontally (0:00.25, 0:01.25, 0:02.25, 0:05.25), the soft drop shadows behind neighboring frames momentarily thicken or flicker, and the radial spotlight gradient over the plaster texture exhibits subtle color banding.
 * Why it happens: Mobile Safari dynamically promotes and demotes preserve-3d / box-shadow layers during active animations to save GPU memory, re-rasterizing blurred shadows at lower precision until the frame comes to rest. Adding will-change: transform and backface-visibility: hidden to the frame cards prevents mid-pan layer drops.
4. High-Speed Diagonal Whip on Row Wraps (0:03.00–0:03.50)
 * What happens: Pressing NEXT at the end of row 1 (the brick garage at 0:03.00) to reach the first photo of row 2 (the foggy skyscraper at 0:03.50) slingshots the camera diagonally down-left across the entire wall in ~0.35 seconds, causing intermediate frames to streak across the screen.
 * Why it happens: The camera interpolates linearly in (x, y) world space using the same fixed duration for a 1-column step as for a multi-column + row-jump diagonal travel. Scaling transition duration slightly by distance (or easing row wraps cleanly) eliminates the jarring streak.
5. Portrait Viewport Framing & Desktop Label Artifacts
 * What happens: Because the zoom level is calibrated for a wide desktop aspect ratio, parts of 3–4 neighboring frames crowd the top, bottom, and sides of the active print throughout the sequence, and the bottom bar still displays desktop-only RETURN [ESC] text just above the Safari URL bar.
 * Fix: Scale the Tier 3 single-photo zoom target dynamically against Math.min(viewportWidth, viewportHeight) so the active frame fills ~80–85% of the mobile screen width cleanly, and swap RETURN [ESC] to RETURN on touch viewports.```

### 2026-11-26: maintainer, second report (stilted cadence)

Quoted verbatim:

```text
That stilted, mechanical rhythm happens because lighting/elevation state changes are decoupled from the camera's movement—firing as abrupt boolean snaps rather than interpolating smoothly across the pan:
1. Instant State Flip on Click (Outgoing Photo Drops Immediately)
 * What happens in the video: The moment NEXT is tapped (0:01.00, 0:02.00, 0:03.00, 0:04.00), activePhotoId updates immediately. Before the camera has even finished leaving the current print, the outgoing frame's isActive styling turns off—snapping its 3D elevation (translateZ / scale) back flush against the wall and immediately applying the inactive dimming filter (brightness / shadow overlay) while it is still center-screen (0:01.25, 0:02.25, 0:05.25).
 * Why it feels jarring: Your eye is still locked on the current print when it suddenly goes dark and sinks backward, making the transition feel like a UI state reset rather than a continuous camera glide.
2. Delayed "Pop-Out" on Arrival (Incoming Photo Snaps Forward at the End)
 * What happens in the video: As the next print slides into view (0:00.50, 0:01.50, 0:02.50, 0:04.50), it travels across the screen in its dimmed, flat resting state. Only after the horizontal pan settles (0:00.75, 0:01.75, 0:02.75, 0:04.75) does the frame abruptly brighten and pop forward with its deeper 3D bevel and shadow.
 * Why it feels stilted: Splitting the motion into two sequential phases—(1) slide flat while dark → (2) pop forward and light up—breaks momentum and creates the stop-and-go cadence you see between every photo.
3. Binary Focus Dimming Instead of Spatial Spotlight Falloff
 * What happens in the video: Every non-active print on the wall is treated with a uniform "unfocused/dark" state, while only activePhotoId gets full brightness. Because that brightness is tied to a boolean ID rather than the spotlight's actual position in world space, illumination jumps between frames instead of sweeping smoothly across the wall as the camera moves.
How to Make the Transition Continuous & Fluid
 * Drive Elevation & Brightness from Camera Proximity (Continuous Interpolation):
   * Instead of toggling an isActive boolean class on click, compute a continuous focusWeight (0.0 to 1.0) for each frame every animation tick based on its distance from the current camera center (distance = hypot(frameX - cameraX, frameY - cameraY)).
   * Map focusWeight smoothly to translateZ, scale, shadow depth, and brightness. As the camera pans from Photo A to Photo B, Photo A gradually settles back and dims proportionally as it leaves center, while Photo B smoothly rises and brightens as it enters center.
 * Tie the Spotlight to the Camera / Interpolated Target:
   * Move the inspection spotlight smoothly along the (x, y) camera trajectory rather than snapping its coordinates on click. That way, the pool of light glides across the plaster and sweeps naturally from the outgoing frame onto the incoming frame.
 * Unify the Easing Curve:
   * Ensure the camera pan, frame translateZ lift, and brightness transition share the exact same spring or cubic-bezier duration (~450–550ms, cubic-bezier(0.22, 1, 0.36, 1)) with zero transition-delay, eliminating the end-of-move "pop."
```

### 2026-11-26: maintainer decisions (answers to the four scoping questions)

| Question | Answer |
| :--- | :--- |
| Focus hand-off driver | **Flight progress, two prints.** Only the outgoing and incoming prints animate, driven by the flight's progress `t`, using transform/opacity only. |
| Easing | **Distance-scaled ease-in-out.** Duration from the flight's path length, from about 450 ms (adjacent) up to about 1 s (row wrap). |
| Scope | **Both desktop and touch** for flight timing, constant-zoom short steps and the focus hand-off. Desktop parity applies to resting states only. |
| Neighbours | **Dim neighbours on touch.** Wire the unused `focusDimming` flag, touch only. There is no camera-following light. |

### Raised but not acted on

| Raised | Why not |
| :--- | :--- |
| `will-change: transform` + `backface-visibility: hidden` on every frame card | It promotes 20+ compositing layers per album. `mobile-render-profile` measured compositing at 75–86% of main-thread time on iPhone and fixed it by *cutting* layers. This would revert that work and risks WebKit dropping layers under GPU-memory pressure. The world container already gets `will-change` for flights and gestures (`GalleryCanvas.tsx:373-379`, `:421-438`). |
| A per-frame `focusWeight` for every print from camera proximity | Writing style to 20+ prints every frame forces style recalc each frame, and animated `box-shadow` forces repaint each frame. On a row wrap, every print the camera passes over would also rise and brighten mid-flight, which is a new flicker. Replaced by the flight-progress hand-off (maintainer chose it). |
| Moving an "inspection spotlight" along the camera path | No focus-tied spotlight exists (see Verified facts). A camera-following light pool would be a new feature. It's deferred to its own change. |
| A fixed 450–550 ms `cubic-bezier(0.22, 1, 0.36, 1)` | That's a strong ease-out, front-loading motion into the first ~150 ms, which worsens the row-wrap whip. A fixed duration also conflicts with path-scaled timing. Replaced by path-scaled smoothstep (maintainer chose it). |
| The claim that the camera interpolates linearly in (x, y) | It doesn't: the camera follows a van Wijk–Nuij arc (`cameraMath.ts:352`). The whip comes from the fixed duration plus the arc's zoom-out, not from linear interpolation. |
| Rebuilding the mat bevel without differently coloured borders | Device-pixel snapping at rest fixes the resting seams without restyling. Shimmer while moving is inherent anti-aliasing on a moving layer. Revisit only if seams persist after snapping. |
| Archiving `alabaster-glass-legibility`, `gyro-relative-recenter`, `sheen-glare-tuning` | These are separate pending changes, unrelated to this one. |

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Flight | A `flyTo` camera animation held in `flightRef` (`GalleryCanvas.tsx:522`). It runs from `from` to `to` over `durationMs`. | Damped pan/zoom easing toward `targetRef` (the 0.24-per-frame non-flight path), or a pinch/drag gesture |
| Flight progress `t` / eased progress `e` | `t = clamp((now − startedAt) / durationMs, 0, 1)`. `e = flightEase(t)`, the same smoothstep the camera uses. | Wall-clock time since the tap, or a separate CSS transition timeline |
| Path length `S` | The van Wijk–Nuij path length between two camera states (`S = (r1 − r0)/ρ`; `|ln(w1/w0)|/ρ` when `d ≈ 0`). The duration is derived from it. | The Euclidean world distance between the two centres |
| Arc flight | A flight sampled with `interpolateZoom`. It zooms out mid-path in proportion to the distance. | A constant-zoom pan |
| Pan flight | A flight that keeps zoom constant (z interpolated geometrically, x/y linearly by `e`). It's used for short same-zoom steps. | A drag pan by the visitor |
| Focus hand-off | The animated visual transfer of the focused look from the **outgoing** print to the **incoming** print, driven by `e` | The `focusedPhotoId` store change, which still happens at the tap |
| Focus weight `w` | A per-frame number in `[0, 1]`, written as the `--focus-w` CSS custom property on the participating `.photo-frame`. `1` is the full resting focused look and `0` is the full resting unfocused look. | A proximity weight computed for every print, or a React prop |
| Participants | The (at most two) frames currently being handed off: outgoing and incoming. They carry `.is-handoff` while `0 < w < 1`, or while the hand-off runs. | Every print in the album |
| Semantic focus | The `.focused` / `.is-focused-cell` classes and `focusedPhotoId`. They drive click routing, ARIA, LOD and the gyro scope. | The visual focused look, which follows `w` |
| Print Focus weight `p` | `--print-w` on the focused album's `.album-grid`. It ramps `0→1` on an album→print flight and `1→0` on print→album; it's `1` at rest in Print Focus. It drives neighbour dimming. | The zoom tier string, which still flips at the tap |
| Neighbour dimming | A touch-only opacity veil over non-participant prints in Print Focus | A `filter: brightness()`, the light-falloff overlay, or wall-lighting changes |
| Light falloff overlay | `.photo-frame.is-lit::after` (`wall.css:941-968`): the per-print gradient darkening from baked `--lit-*`, hidden on the focused print | "Dimming": it's a lighting simulation, not focus dimming |
| Crisp overlay | `PrintSharpOverlay`: the device-resolution `<img>` mirrored over the focused frame outside the scaled world | The in-world `.photo-img` |
| Device-pixel settle snap | On the settled frame (touch only), rounding the world's on-screen translation to `1 / devicePixelRatio` CSS px | Rounding the camera state, or snapping during motion |
| Gyro hold | During a flight, `useGyroTilt` discards readings: no baseline capture, no emits. The baseline is captured from the first valid reading after the flight settles. | Detaching the sensor, or the 3 s stillness recentre |
| Touch / coarse | `(pointer: coarse)`: the CSS media query, or the `coarsePointer` `useSyncExternalStore` value in JS | Viewport width `< 768px` |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| van Wijk & Nuij, "Smooth and efficient zooming and panning", IEEE InfoVis 2003 | The optimal zoom/pan path; the path length `S` is a perceptual cost, and duration ∝ `S` gives a constant perceived speed | Paper (algorithm only, already implemented in `cameraMath.ts`) | 2026-11-26 (from implementation notes, not re-fetched) |
| Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH 2014), interleaved gradient noise | `IGN(p) = fract(52.9829189 · fract(dot(p, vec2(0.06711056, 0.00583715))))`: cheap per-pixel dither that hides 8-bit banding | Formula (not copyrightable); no code copied | 2026-11-26 (from memory, not re-fetched) |
| CSS Transforms 1: `transform-origin: 0 0` composition | `scale(s) translate(a)` ≡ `translate(s·a) scale(s)` for origin `0 0`, which allows the reorder for pixel snapping | W3C spec | 2026-11-26 (from memory) |
| `cubic-bezier(1/3, 0, 2/3, 1)` | Exactly the smoothstep `3t² − 2t³` (x(t) = t is linear), so CSS and JS can share the camera easing | Maths | 2026-11-26 (derived) |
| Playwright WebKit | **Failed lookup:** no WebKit build is installed (`~/.cache/ms-playwright` has only chromium and firefox), so iOS compositing can't be reproduced locally | n/a | 2026-11-26 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| A JS flight-progress hand-off writing `--focus-w` to two frames | **Adopted** | It's exactly synchronised with the camera, survives interruption, and only touches two elements per frame. Maintainer chose it. | 2026-11-26 |
| CSS transitions sharing `cubic-bezier(1/3,0,2/3,1)` with `transition-duration` equal to the flight duration | Rejected | They'd start one React commit off the flight, couldn't follow a cancelled or retargeted flight, and would still transition `box-shadow` (repaint). | 2026-11-26 |
| Per-print proximity `focusWeight` | Rejected | See Raised but not acted on. | 2026-11-26 |
| Web Animations API on the participants | Rejected | It'd need a timeline synced to a rAF-driven camera; it adds a second clock. | 2026-11-26 |
| `@property --focus-w` registration | Not needed | It's written every frame from JS; nothing transitions it in CSS. | 2026-11-26 |
| Spring physics for flights | Rejected | It has no closed-form duration, so the hand-off can't share a clock with it. | 2026-11-26 |
| A new npm dependency | None | All pure maths/CSS. | 2026-11-26 |

## Patterns adopted

- **Duration ∝ van Wijk `S`** (van Wijk & Nuij 2003). Lands in `src/lib/camera/flightPlan.ts` (`[NEW]`) as `flightDurationMs = clamp(300 + 380·S, 450, 1100)`.
- **Interleaved gradient noise dither** (Jimenez 2014). Lands in the `PlaygroundPbrWall.tsx` fragment shader, ±0.5/255 before output, gated by a `uDither` uniform.
- **Separating semantic state from a visual weight**, the usual "logical state flips, presentation animates" split. It lands as the `.focused` class plus the `--focus-w` custom property.
- **Device-pixel snapping at rest**, as used by map renderers for crisp tiles. It lands in `applyCamera` on settled frames.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Every focus flight uses a fixed duration | `flyTo(target, 720)`; the entry uses `620` | Read `GalleryCanvas.tsx:548` and `:589` | 2026-11-26 | stable |
| The flight easing is smoothstep over van Wijk | `eased = t*t*(3-2*t)`; `interpolateZoom(from, to, eased)` | Read `GalleryCanvas.tsx:318-320` | 2026-11-26 | stable |
| The path length `S` is computed but not exported | It's local to `interpolateZoom` | Read `cameraMath.ts:352-391` | 2026-11-26 | stable |
| Row-wrap NEXT at 720 ms whips | Adjacent peak is 3.8 viewport-widths/s with a 4% zoom-out; a 5-column wrap peaks at **13.5 vw/s** with a **57%** zoom-out | `tsx` script sampling `interpolateZoom` at 393×852, z = 6.2, step 1.82 (`CELL_SIZE + GUTTER`) | 2026-11-26 | decays (layout constants) |
| The proposed duration formula | `300 + 380·S`, clamped 450–1100 ms: adjacent S 0.409 → 455 ms; wrap4 S 1.173 → 746 ms; wrap5 S 1.446 → 849 ms (peak ≈ 5.7 vw/s); album→print S 0.926 → 652 ms; overview→album S 1.138 → 732 ms | Same script, which computes `S` exactly as `interpolateZoom` does | 2026-11-26 | decays |
| An adjacent NEXT is a short same-zoom step | Screen distance 0.92 vw, `z0 = z1` | Same script | 2026-11-26 | decays |
| The focus classes flip at the tap | `focused={focusedPhotoId === photo.id}` → `.focused` / `.is-focused-cell` | Read `GalleryCanvas.tsx:1032-1045` and `FramedPrint.tsx:161-165` | 2026-11-26 | stable |
| Touch has no `transform` or `box-shadow` transition on frames | The coarse `.photo-frame` transition is only `padding` and `background-color` | Read `wall.css:1098-1103` | 2026-11-26 | stable |
| The touch focused shadow differs from the resting one | Resting: a single directional shadow. Focused: the `36px -6px rgba(0,0,0,.62)` layer | Read `wall.css:1143-1159` | 2026-11-26 | stable |
| The "dimming" at the tap is the light-falloff overlay | `.photo-frame.is-lit::after` gradient with `opacity 0.28s`; `opacity: 0` on `.focused` | Read `wall.css:941-968`; `grep` found no `filter: brightness` on frames outside macro | 2026-11-26 | stable |
| No focus-driven spotlight exists | `computePlaygroundLighting(albums)` depends only on albums; `PlaygroundPbrWall` receives no focus input | Read `GalleryCanvas.tsx:271` and `:883`; `grep` of `PlaygroundPbrWall.tsx` and `src/lib/lighting/` for `focused*` returned nothing | 2026-11-26 | stable |
| The crisp overlay remounts per photo | `<PrintSharpOverlay key={focusedPhotoId ?? 'none'} …>` | Read `GalleryCanvas.tsx:940-948` | 2026-11-26 | stable |
| The crisp overlay locates its frame by class | `querySelector('.photo-frame.focused')` | Read `PrintSharpOverlay.tsx:102` | 2026-11-26 | stable |
| Touch focused prints rest at `translateZ(22px)` and the gyro writes `translateZ(58px)` | Base `.photo-frame { transform: translateZ(22px) }`; the gyro writes `translateZ(58px) rotateY() rotateX()` | Read `wall.css:898-920` and `FramedPrint.tsx:121` | 2026-11-26 | stable |
| Desktop focused prints also rest at `translateZ(22px)` until hovered | No `.focused` transform rule; hover writes 58, and leaving sets `translateZ(54px)` inline | Read `wall.css:929-937` and `FramedPrint.tsx:199-218` | 2026-11-26 | stable |
| The apparent scale of 22 vs 58 px under 1150 px perspective | 1.0195 vs 1.0531 (+3.3%) | `1150/1128`, `1150/1092` | 2026-11-26 | stable |
| A focus change resets the gyro and announces `{0,0}` | `setContext` → `reset(hadContext)`; it announces only if an emit happened since the last reset | Read `useGyroTilt.ts:205-221` and `:338-362` | 2026-11-26 | stable |
| `focusDimming` is unused | Only the declaration and the table in `zoomTier.ts` | `grep -rn focusDimming src` | 2026-11-26 | stable |
| Print framing padding | `PRINT_PADDING = 0.14` → the limiting axis is filled to 72% | Read `GalleryCanvas.tsx:84`; `contentFactor = 1 − 2·padding` (`cameraMath.ts:306`) | 2026-11-26 | stable |
| The wall shader has no dither | `fragColor = vec4(color, 1.0)` after a filmic curve; touch DPR is 1.0 | Read `PlaygroundPbrWall.tsx:40` and `:93-167` | 2026-11-26 | stable |
| World transform format | `scale(s.6f) translate3d(-x·100 .3f px, y·100 .3f px, 0)` | Read `GalleryCanvas.tsx:298` | 2026-11-26 | stable |
| Mat border colours differ per side | Top 1px white 0.9; left 1px 0.55; right 4px `#d5d1c8`; bottom 5px `#c6c1b7` | Read `wall.css:903-906` | 2026-11-26 | stable |
| The return label is hard-coded | `RETURN [ESC]` | Read `PhotoFocusBar.tsx:69` | 2026-11-26 | stable |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| The end-of-flight "pop" seen on iPhone is one or more of: (a) the gyro's first lift 22→58 px plus tilt, with a tap-jolt baseline; (b) the crisp overlay going live late; (c) a WebKit re-raster when `will-change` drops at settle. The hand-off removes (b); the gyro hold plus a 58 px rest removes (a); (c) is unaddressed. | An on-device instrumented pass (tests.md, manual): log gyro emits, overlay `is-live` and settle timestamps against the flight clock. About 15 minutes on the maintainer's iPhone. |
| The mid-flight trapezoid is gyro tilt (±4°) applied while the camera moves | Same instrumented pass, with the gyro permission denied versus granted |
| The shadow flicker during a pan is WebKit re-rasterizing the world layer as the arc's scale changes, so constant-zoom pans remove it | A before/after recording of an adjacent NEXT on iPhone |
| Resting mat seams come from fractional device-pixel offsets and disappear with the settle snap | A before/after close-up on iPhone at rest |
| The ½-LSB dither removes visible banding at DPR 1.0 | iPhone comparison in the chiaroscuro mood (darkest wall) |
| A child span carrying the outer shadow paints pixel-identically to the same `box-shadow` on the frame on desktop | Desktop parity run (tests.md). If it fails, the fallback in architecture.md applies. |
| At padding 0.08 a landscape print hides its side neighbours on a 393-wide portrait phone | A Playwright coarse-emulation screenshot at 393×852 |

## Superseded claims

| Earlier belief | Why wrong | Replaced by |
| :--- | :--- | :--- |
| "The incoming print travels flat and dark and only pops forward after the pan settles" (maintainer report 2) | In code, the incoming print gets `.focused` at the tap (focused shadow, z-index 40, 3D context, falloff fade-out start) while it's still an off-centre sliver. The settle-time pop must come from something else that lands at settle. | The three candidates under Unverified assumptions |
| "The outgoing print gets an inactive dimming filter (brightness / shadow overlay)" | There's no brightness filter. The darkening is the light-falloff overlay fading back in over 280 ms, plus the instant loss of the focused shadow and the crisp overlay. | Verified facts rows on the falloff overlay and the overlay remount |
| "The camera interpolates linearly in (x, y)" | It's a van Wijk arc with a zoom-out | Verified facts: fixed duration plus arc |
| "Mobile Safari drops preserve-3d layers mid-pan; `will-change` fixes it" | Non-focused frames on touch are already flat (no preserve-3d). The re-raster driver is the world's changing scale during the arc. | The pan-flight and settle-snap decisions |
| First-round hypothesis: the per-cell perspective skews off-centre prints as the camera moves | `perspective-origin` defaults to the cell centre and the world has no perspective of its own, so the camera translation can't skew a frame | The gyro-tilt hypothesis (Unverified assumptions) |

## Links out

- `openspec/specs/spatial-camera-navigation/spec.md`: "Arced fly-to transitions and bottom-inset-aware framing"
- `openspec/specs/instanced-photo-renderer/spec.md`: gyroscope tilt, PrintSharpOverlay sync, mobile render profile
- `openspec/specs/gallery-hud-and-curator-ui/spec.md`: Photo Focus bar
- `openspec/specs/3d-pbr-wall-and-lighting/spec.md`: wall DPR cap
- The `openspec/changes/mobile-render-profile/` research: the layer-count and compositing evidence
- The `openspec/changes/gyro-relative-recenter/` change: baseline and recentre behaviour this change builds on
