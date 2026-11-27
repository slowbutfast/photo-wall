## Source material

### Maintainer report: screen recording of a manual pinch on the gallery wall (2026-11-26)

Quoted verbatim as pasted by the maintainer:

> This transition demonstrates a **zoom-threshold Level-of-Detail (LOD) state swap** triggered during manual pinch-to-zoom on the gallery wall:
>
> ### 1. Timeline of the Transition
>
> * **Overview State (`0:00.00 – 0:00.25`):** At the zoomed-out Overview scale, every album's placard is replaced by a simplified, semi-transparent light-gray square placeholder (`opacity` overlay) with no text and no soundtrack cover art visible underneath.
> * **Pinch-In & Threshold Snap (`0:00.50 – 0:01.25`):** As you pinch inward toward the center column of clusters, the wall scales up smoothly while the placards remain blank gray squares until `0:01.00`. Between `0:01.00` and `0:01.25`, crossing a specific zoom breakpoint triggers an instantaneous swap—replacing the blank square with both the dark translucent text placard (`throwback to bali group 19` and `spent over a decade...`) and the square album-cover audio widget below it.
> * **Zoom-Out Revert (`0:01.75 – 0:02.75`):** Pinching back out smoothly shrinks the wall until `0:02.50`, where crossing back below that same zoom threshold abruptly hides the text placard and album cover, reverting them to the blank light-gray square.
> * **Threshold Oscillation (`0:03.25 – 0:06.50`):** Repeatedly pinching right around the breakpoint (`0:03.50`, `0:04.00`, `0:04.75`, `0:05.00`, `0:05.50`) toggles the placards back and forth between the simplified gray square and the full detailed assembly.
>
> ### 2. Visual Characteristics of the Transition
>
> * **Hard Boolean Cut vs. Cross-Fade:** Rather than fading in (`opacity: 0 → 1`) over a zoom range (e.g., interpolating smoothly between `0.75×` and `1.0×` zoom), the placard content mounts or toggles visibility on a single frame once the scale threshold is crossed.
> * **Placeholder-to-Detail Footprint Mismatch:** In the zoomed-out state, only a single `1 × 1` square gray placeholder is rendered in the top slot; when the threshold triggers, both the top text placard and the second `1 × 1` square audio widget below it appear simultaneously—doubling the vertical footprint in the left column instantaneously.
> * **Continuous Wall & Spotlight Scaling:** Throughout the entire pinch gesture, the underlying stucco wall texture, overhead elliptical spotlights, and framed photo grids scale continuously with zero layout shift or reflow, isolating the pop-in strictly to the placard layer.

The maintainer asked for "a compromise for the LOD optimization that makes the transition more seamless". Three slices were proposed in this session. The maintainer then asked to fast-forward the change for **slices 1 and 2**:

1. Tier hysteresis.
2. Macro mosaic footprint parity.

### Raised but not acted on

| Item | Why not in this change |
| :--- | :--- |
| **Slice 3:** fade placard text and the soundtrack cover in over a zoom range (a `--detail-a` custom property on `.wall-world`, written per frame inside `0.25–0.32`) | It's a per-frame style change on iOS, and that class of change sank PR #18 (see `archive/mobile-print-transitions`, `postmortem.md`). It needs on-device verification of slices 1–2 first, so it's a separate change. |
| A true crossfade (keep the `MacroIsland` mosaic and the `AlbumTier` DOM island both mounted over a band) | It doubles the content of every visible island across the band. The mosaic exists to avoid a ~233 ms re-raster with full DOM islands mounted (`macroMosaic.ts` header, citing `dom-wall-engine/spike-results.md`). |
| Pre-mounting `AlbumTier` invisibly before the threshold | It targets swap-frame jank, which nobody has measured yet. Revisit only with an iPhone trace. |
| The maintainer's example range "`0.75×` → `1.0×`" | That's an illustrative zoom range, not this code's scale units. The real promote point is CSS scale `0.25`. |
| Drawing the soundtrack cover thumbnail into the mosaic | The macro contract is "zero soundtrack thumbnails" (spec `instanced-photo-renderer`, macro scenario). Fetching YouTube thumbnails for every island at Overview would add network traffic and decode cost. The mosaic reserves the slot with the plaque's dark base; the cover still appears at the swap. Slice 3 is where that softens. |

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **CSS scale** (`scale`) | `cameraToCssScale(camera.z, viewportHeight)`: the `.wall-world` `scale()` factor. The tier thresholds are in these units. | Camera `z`, pinch ratio, or device pixel ratio |
| **Zoom tier** | `ZoomTier = 'macro' \| 'album' \| 'print'` from `zoomTier.ts` | The image LOD bucket (`256/800/2048`), which `resolveProjectedLodWidth` decides independently |
| **Macro tier** | Islands render one `MacroIsland` canvas mosaic each (`GalleryCanvas.tsx:1009`) | "Overview mode" (`viewMode === 'overview'`). Overview usually lands in macro, but they're separate state. |
| **Detail tier** | Shorthand for `album` or `print`: real `AlbumTier` DOM | Print Focus only |
| **Promote** | A tier change from `macro` to a detail tier. Happens at `scale ≥ MACRO_PROMOTE_SCALE` (`0.25`). | A focus change |
| **Demote** | A tier change from a detail tier to `macro`. Happens at `scale < MACRO_DEMOTE_SCALE` (`0.22`). | Unmounting because of viewport culling |
| **Hysteresis band** | `[0.22, 0.25)`: inside it the tier keeps whatever it was last frame | A fade or animation range. Nothing animates in the band in this change. |
| **Committed tier** | The tier the camera rAF loop last computed, held in a ref and passed back as `previous` | React state. It's a ref; only the snapshot key change triggers a render. |
| **Footprint parity** | The mosaic paints a placard plate and a soundtrack slot at exactly the `computeAlbumGrid` rects the DOM tier uses | Pixel-identical rendering of the DOM placard |
| **Placard plate** | The mosaic's painted rectangle at `grid.placard`, filled with the live material's background | The DOM `.museum-placard` element |
| **Greeked lines** | Solid low-alpha bars painted where the title and caption sit, standing in for text that would be ≤ 4 px tall at macro scale | Text. `fillText` is never called. |
| **Soundtrack slot** | The mosaic's dark square at `grid.soundtrack`, painted only when `album.soundtrack !== null` | The YouTube facade or iframe |
| **Mosaic palette** | The pure lookup `(theme, material, coarse) → colours` that the painter uses | A CSS custom property. Canvas can't read CSS, so values are mirrored and audited. |

## External research

None. This is an internal threshold and painting change. No external sources were consulted (2026-11-26).

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Hysteresis on the existing pure `resolveZoomTier` via an optional `previous` argument | **Adopted** | Backwards-compatible: callers without `previous` keep today's exact behaviour and tests. It's pure and table-testable. | 2026-11-26 |
| Debounce or time-based tier commit (for example "hold 150 ms before demote") | Rejected | Time-based gates make the tier depend on frame timing and add timers to the rAF loop. A spatial band fixes jitter deterministically. | 2026-11-26 |
| A DOM `<span>` placard plate inside `MacroIsland`, styled by the existing CSS so mood, material and coarse variants cascade for free | Rejected | It adds a DOM node per macro island and breaks the "mosaics only" macro contract. A translucent gradient element under the scaled world adds raster area on every `will-change` drop. | 2026-11-26 |
| Read the placard colours with `getComputedStyle` at paint time | Rejected | It needs a live styled element per mood and material, and it's order-dependent at startup. | 2026-11-26 |
| Mirror the placard backgrounds into `PlaygroundTheme`, with a source-text audit against `wall.css` | **Adopted** | `PlaygroundTheme` is already the per-mood seam for placard glass ink (`glassInk`, `glassCap`). The audit catches drift. | 2026-11-26 |
| Use `--color-placard-core` (`#161616`) as the plate fill | Rejected | See Superseded claims: that's the soundtrack plaque's base and foamcore's fill, not the live Beveled Glass plate. | 2026-11-26 |

## Patterns adopted

- **Schmitt-trigger hysteresis** (two thresholds around one state boundary). This is a standard control technique, not code taken from anywhere. It lands in `resolveZoomTier`.
- **Greeking** (typographic placeholder bars for text below legible size). This is a standard print and LOD practice. It lands in `planMacroMosaic` (geometry) and `paintPlaceholder` (paint).

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Tier is a single threshold with no hysteresis | `scale < 0.25` → `macro` | Read `src/components/wall/zoomTier.ts:25,88-91` @ `b616dbc` | 2026-11-26 | stable |
| Tier is computed in two places | Render path `GalleryCanvas.tsx:358` from `snapshot.z`; rAF loop `GalleryCanvas.tsx:433-436` from the live camera | Read code @ `b616dbc` | 2026-11-26 | stable |
| A tier change forces a mid-gesture React render | `buildSnapshotKey(zoomTier, …)` at L446, compared at L470-471 | Read code @ `b616dbc` | 2026-11-26 | stable |
| The whole island swaps component at the tier change | `tier === 'macro' ? <MacroIsland> : <AlbumTier>` at `GalleryCanvas.tsx:1009` | Read code @ `b616dbc` | 2026-11-26 | stable |
| The mosaic paints the placard pale and translucent, with no soundtrack slot | Fill `rgba(226,242,234,0.18)`, stroke `rgba(240,245,242,0.22)`; no soundtrack rect in `MosaicPlan` | Read `MacroIsland.tsx:65-78`, `macroMosaic.ts:61-125` @ `b616dbc` | 2026-11-26 | stable |
| `computeAlbumGrid` already returns the soundtrack rect | `soundtrack: AlbumRect \| null`, `SOUNDTRACK_GAP = 0.12u` beneath the placard, `2.14u × 2.0u` | Read `src/lib/layout/islandLayout.ts:9-13,68-71,134-145` | 2026-11-26 | stable |
| The mosaic canvas spans the whole island box | `.island-mosaic-host, .island-mosaic { width: 100%; height: 100% }`, and `planMacroMosaic` maps `album.bounds` onto the buffer | Read `wall.css:121-126`, `macroMosaic.ts:87-96` | 2026-11-26 | stable |
| The live placard material is `mat-acrylic` ("Beveled Glass"), and the default | `DEFAULT_PLACARD_MATERIAL = 'acrylic'`; the curator can switch to `aluminum`/`foamcore` | Read `placardMaterial.ts:9-11`, `CuratorStudio.tsx:114,704` | 2026-11-26 | stable |
| Acrylic plate, fine pointer, chiaroscuro and concrete | `linear-gradient(138deg, rgba(24,28,26,0.58) 0%, rgba(18,22,20,0.46) 55%, rgba(26,30,28,0.54) 100%)` | Read `wall.css:614-620` | 2026-11-26 | decays (tuned often) |
| Acrylic plate, alabaster, both pointers | `rgba(30,36,33,0.78) / rgba(22,27,24,0.74) / rgba(34,40,36,0.78)` at 0/55/100% | Read `wall.css:638-646`; the comment says (0,4,0) specificity beats both pointer rules | 2026-11-26 | decays |
| Acrylic plate, coarse, chiaroscuro | `rgba(26,31,28,0.62) / rgba(18,22,20,0.52) / rgba(28,33,30,0.6)` | Read `wall.css:1265-1272` | 2026-11-26 | decays |
| Acrylic plate, coarse, concrete | `rgba(32,37,33,0.68) / rgba(24,28,25,0.58) / rgba(34,39,35,0.66)` | Read `wall.css:1275-1283` | 2026-11-26 | decays |
| Acrylic edges | Top `1.5px rgba(242,255,248,0.72)`, bottom `3px rgba(140,185,165,0.52)` | Read `wall.css:622-625` | 2026-11-26 | decays |
| Aluminum plate base | `linear-gradient(135deg, #e6e8ea 0%, #d2d5d9 42%, #b8bcc0 100%)`, plus stripe and noise overlays | Read `wall.css:564-574` | 2026-11-26 | stable |
| Foamcore plate | `background-color: #161616` | Read `wall.css:785-786` | 2026-11-26 | stable |
| Soundtrack plaque base | `background: var(--color-placard-core)` = `#161616`; border `1px rgba(255,255,255,0.08)` | Read `wall.css:240-248`, `tokens.css:60` | 2026-11-26 | stable |
| Live placard text block | Padding `20px 24px 30px 24px` in a `214 × 200` box; title `17px/1.15` weight 700; caption `13px/1.35` with `6px` top margin | Read `wall.css:440-452,466-481` | 2026-11-26 | decays |
| `GalleryCanvas` gets `theme: PlaygroundTheme`, not the mood name | Prop at L156; `PhotoWallApp.tsx:96` and `CuratorStudio.tsx:123` pass `PLAYGROUND_THEMES[effectiveMood]` | Read code | 2026-11-26 | stable |
| The existing tier tests pin the 0.25 boundary without `previous` | `zoomTier.test.ts:152-166` | Read test | 2026-11-26 | stable |
| The `MacroIsland` test fake 2D context records `fillRect` | `MacroIsland.test.tsx:27,95` | Read test | 2026-11-26 | stable |
| Overview settles **outside** the hysteresis band `[0.22, 0.25)` on all three probe fixtures | `?demo=4` 1440×900 fine `0.417997`; `?demo=4` 393×852 coarse `0.219219`; `?demo=1000` 1440×900 fine `0.271815`. None in band. The coarse value sits `0.0008` (0.4%) below the demote edge, so it is macro today and stays macro; a future framing change could push it in. | `macro-parity.mjs --measure-only` on base `b616dbc`, `logs/1.1-overview-scale.log`, 2026-11-27 | 2026-11-27 | decays (framing-dependent) |

## Unverified assumptions

| Assumption | Why it matters | Cost to check |
| :--- | :--- | :--- |
| Overview and entry framing settle **outside** the band `[0.22, 0.25)` for `?demo=4` at `1440×900` and `393×852`, and for `?demo=1000` | Inside the band, the resting tier would depend on the direction of approach. Overview reached from Album Focus would stay a detail tier, with full DOM and more islands. | Low. Task 1.1 logs `cameraToCssScale` after the Overview settle on local dev. |
| Pinch jitter near the threshold is under ~12% of scale | That's the band width (`0.22/0.25 = 0.88`). If a natural hold jitters more, oscillation remains. | Low, on device: hold a pinch near the threshold with the band in place. |
| About 29% more islands mount at scale `0.22` than at `0.25` (visible area grows by `(0.25/0.22)² ≈ 1.29`) and that stays within the macro settle-hitch budget on `?demo=1000` | Demote now happens later, so the detail tier is held at a smaller scale. | Medium. Count `.album-island:not(:has(.island-mosaic))` at scale 0.221 on `?demo=1000`. An iPhone timeline is the real check. |
| At macro scale the greeked bars read as text-like texture, not as stripes | It's a subjective look | Low: a Chromium screenshot at Overview, plus the iPhone |
| The cover still pops at the swap after slice 2 | Slice 2 reserves the slot's footprint but not its content | Confirmed by design. Recorded so nobody reads slice 2 as fixing it. |

## Superseded claims

| Claim | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| "Paint the mosaic placard with `--color-placard-core`" (this session's proposal, 2026-11-26) | `--color-placard-core` (`#161616`, opaque) is the soundtrack plaque's base and the foamcore fill. The live Beveled Glass plate is a translucent smoked gradient (alpha 0.46–0.78) that varies by mood and pointer type (Verified facts above). | A per-theme, per-material, per-pointer **mosaic palette** mirrored into `PlaygroundTheme` and audited against `wall.css`. `#161616` stays as the soundtrack slot fill. |
| "Demote below about 0.21" (this session's proposal) | 0.21 widens the band to 16%, and at `?demo=1000` holds the detail tier over `(0.25/0.21)² ≈ 1.42×` the visible islands | `MACRO_DEMOTE_SCALE = 0.22`: about a 12% band and `≈ 1.29×` islands |

## Links out

- `openspec/specs/instanced-photo-renderer/spec.md`: the macro mosaic tier and the `MacroIsland` incremental-paint requirements.
- `openspec/changes/dom-wall-engine/spike-results.md`: why the macro mosaic exists (the ~233 ms re-raster).
- Tag `archive/mobile-print-transitions`, `openspec/changes/mobile-print-transitions/postmortem.md`: why per-frame iOS styling (slice 3) waits for device evidence.
