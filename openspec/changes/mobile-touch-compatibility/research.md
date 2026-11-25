## Source material

**Maintainer, 2026-11-24 (Claude Code session):**

> "can you also separately propose a new open spec change for mobile compatibility?"

The request names no specific symptom. This change is therefore scoped from a code audit of touch, viewport and responsive paths, done on 2026-11-24 against `main` at `ee3b38f`. Every item below cites the line that motivated it. **No real device was used.** Device behaviour is listed under Unverified assumptions and has to be checked on an iPhone (Safari) and an Android phone (Chrome) during verification.

### Raised but not acted on

- **iOS memory pressure from 2048 px prints at DPR 3.** It's plausible on large walls, but nobody has observed it. Capping the LOD on coarse pointers would cost sharpness on the very devices with the best screens, so it stays a verification measurement (tasks 5.x). It becomes its own change only if a crash reproduces.
- **`backdrop-filter` cost on placards at album tier.** Same reasoning: measure first.
- **A double-tap-to-zoom gesture.** Pinch plus tap-to-focus already covers zoom, and double-tap would delay every single tap by the disambiguation window.
- **Landscape-specific layouts.** The wall is a free canvas and the HUD already has a `≤ 767px` media block (`hud.css:157`).
- **The soundtrack plaque opening several players at once.** That's a separate bug fix (the `SoundtrackPlaque` per-album guard) and must land **before** this change, because both touch `SoundtrackPlaque.tsx`.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Coarse pointer** | A device whose primary input matches `(pointer: coarse)`, or an individual event with `pointerType === 'touch'` or `'pen'`. | "Mobile viewport width". A narrow desktop window is still a fine pointer, and a tablet with a trackpad may be one too. |
| **Fine hover** | `(hover: hover) and (pointer: fine)`: the device can hover with a precise pointer. | "Desktop" in a user-agent sense. |
| **Two-finger pan** | While pinching, the midpoint of the two touches moving translates the camera, as in native maps. | A one-finger drag, which already pans. |
| **Safe area** | The iOS insets (`env(safe-area-inset-*)`) around the notch, the Dynamic Island and the home indicator. They are only non-zero when the viewport meta sets `viewport-fit=cover`. | The HUD's own design padding. |
| **Touch target** | The hit box of an interactive control. WCAG 2.5.5 (AAA) and Apple's HIG use 44 × 44 CSS px. | The visible glyph or label size. |
| **Inline playback** | A YouTube embed playing inside its plaque. On iPhone this needs `playsinline=1`; without it iOS Safari may take the video full screen on play. | Autoplay. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| YouTube IFrame Player parameters (`playsinline`) | `playsinline=1` makes videos play inline on iOS instead of in the native full-screen player. | Google docs (reference) | 2026-11-24 (prior knowledge) |
| WebKit viewport / `viewport-fit=cover` + `env(safe-area-inset-*)` | The insets are 0 unless `viewport-fit=cover` is set. | Reference | 2026-11-24 (prior knowledge) |
| Next.js 16 `viewport` export (`generateViewport` / `export const viewport`) | The supported way to set the viewport meta in the App Router. Check `node_modules/next/dist/docs/` before implementing, per `AGENTS.md`. | MIT docs | 2026-11-24 (not re-read yet) |
| dnd-kit sensors docs | `TouchSensor` with `activationConstraint: { delay, tolerance }` lets touch scroll proceed until a long-press, and recommends `touch-action: manipulation` on the draggable for delay-based activation. `PointerSensor` + `touch-action: none` blocks scrolling on that element. | MIT (reference) | 2026-11-24 (prior knowledge) |
| WCAG 2.2 SC 2.5.8 (AA, 24 px minimum) / 2.5.5 (AAA, 44 px) | Targets of 30 px pass AA but miss the 44 px enhanced and HIG target. | W3C | 2026-11-24 (prior knowledge) |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| dnd-kit `MouseSensor` + `TouchSensor` (delay 250 ms, tolerance 5 px) + `KeyboardSensor` | **Adopted** | Already a dependency. It separates scroll from drag on touch without adding a visible handle to photo tiles. | 2026-11-24 |
| Adding a drag handle to every photo tile | Rejected | Adds visual chrome to the 2-column grid, and the long-press is the familiar iOS/Android pattern. | 2026-11-24 |
| `hammerjs` / `@use-gesture/react` for pinch-pan | Rejected | The existing pointer-map pinch in `GalleryCanvas` needs about 6 lines to also pan by the midpoint delta, so a dependency isn't justified. | 2026-11-24 |
| A UA sniffing library | Rejected | Capability queries (`pointer`, `hover`, `pointerType`) are the correct signal. | 2026-11-24 |

## Patterns adopted

- **Media-query gating of hover affordances** with `@media (hover: hover) and (pointer: fine)` in CSS, plus a `pointerType === 'mouse'` check in JS handlers. This is the standard progressive-enhancement pattern.
- **Midpoint-delta pan during a pinch**, the same model native map views use. It lands in `GalleryCanvas.tsx` `onPointerMove`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The root layout sets no `viewport` export, so `viewport-fit=cover` is absent | `src/app/layout.tsx` exports only `metadata` | `grep -n "viewport" src/app/layout.tsx` returned no match. | 2026-11-24 | decays |
| The HUD already relies on `env(safe-area-inset-bottom)` | `hud.css:94`, `hud.css:172` | grep. Without `viewport-fit=cover` these evaluate to `0` on iOS (see the WebKit entry above; device-unverified). | 2026-11-24 | decays |
| The top-right HUD ignores the top and right safe areas | `top: 24px; right: 24px` | Read `.hud-top-right` in `hud.css`. | 2026-11-24 | decays |
| HUD buttons are 30 px tall on coarse pointers `>= 768px` | `.hud-button { min-height: 30px; padding: 7px 14px }` (`hud.css:46`); `<= 767px` raises `.hud-top-right .hud-button` and `.photo-focus-bar .hud-button` to `44px` (`hud.css:163-167`), leaving landscape phones and tablets `>= 768px` at `30px` | Read `hud.css:46,163-167`. (Note: PR #10 `63707ac` removed `.hud-directory`.) | 2026-11-24 | decays |
| A pinch zooms about the midpoint but ignores midpoint movement | `zoomBy(center…, distance / pinch.distance)`; no pan in the `size >= 2` branch | Read `GalleryCanvas.tsx` around L573–585. | 2026-11-24 | decays |
| The hover tilt and sheen run for every pointer type, including touch (and `PrintSharpOverlay` mirrors them) | `onPointerMove` has no `pointerType` check; `PrintSharpOverlay.tsx:77-96` mirrors `frame`'s computed transform + `.photo-sheen` every rAF | Read `FramedPrint.tsx` L69–102 and `PrintSharpOverlay.tsx` L75–96. | 2026-11-24 | decays |
| Wall and HUD `:hover` rules are not gated by a hover media query | `4` `:hover` rules in `wall.css` (`L666,799,966,1040`), `3` `:hover` rules in `hud.css` (`L62,141,152`), `0` `@media (hover…)` in `src` | `grep -n ":hover" src/styles/wall.css src/styles/hud.css` and `grep -rn "@media (hover" src`. | 2026-11-24 | decays |
| The public soundtrack iframe lacks `playsinline=1`, while the Studio probe players set it | Plaque `src` is `…?autoplay=1&rel=0&modestbranding=1`. `AlbumEditor.tsx:462` and `FolderDropzone.tsx:528` set `playsinline: 1` | Read `SoundtrackPlaque.tsx` and grep `playsinline`. | 2026-11-24 | decays |
| A whole Album Editor photo tile is the drag activator with `touch-action: none` | `{...listeners}` on `.album-editor-photo-media` (`AlbumEditor.tsx:1074-1076`). `studio.css` `.album-editor-photo-media { touch-action: none }` | Read both. | 2026-11-24 | decays |
| Both Studio sortables use `PointerSensor { distance: 4 }` | `CuratorStudio.tsx:213`, `AlbumEditor.tsx:235` | grep. | 2026-11-24 | decays |
| The wall canvas already blocks the browser's own pan and zoom | `touch-action: none` on wall roots (`wall.css:50,68,78,460`) | grep. | 2026-11-24 | stable |
| The Studio already switches to mobile tabs below 1024 px | `studio.css:609 @media (max-width: 1023px)` and the `gallery-hud-and-curator-ui` spec | grep and spec read. | 2026-11-24 | stable |

## Unverified assumptions (each needs a real device)

- **iPhone Safari, no `playsinline`:** tapping the plaque either goes full screen or needs a second tap inside the player. Check: tap a plaque on an iPhone and note the behaviour before and after.
- **iPhone Safari, sound in a cross-origin iframe:** unmuted autoplay inside the freshly mounted iframe may not start on the facade tap. If it doesn't, the placard timecode, which is anchored to the click, will run while the audio is silent. Check: device test. If confirmed, record it. A fix (for example a "tap again to play" hint) would be a follow-up, because the public CSP forbids the IFrame API that could detect it.
- **Safari page pinch-zoom:** iOS Safari may still pinch-zoom the page despite `touch-action: none`, because WebKit has historically ignored it for page zoom. Check: two-finger pinch on the wall on an iPhone. If the page zooms, the fix is a non-passive `gesturestart` `preventDefault` on the wall root.
- **The 250 ms long-press feels right for reordering** on both platforms. Check: manual.
- **Memory with ~10 albums at DPR 3** stays below the iOS tab-kill threshold. Check: Safari Web Inspector › Timelines › Memory.

## Superseded claims

None yet.

## Links out

- `openspec/specs/spatial-camera-navigation/spec.md`: input conventions.
- `openspec/specs/gallery-hud-and-curator-ui/spec.md`: Studio mobile tabs and HUD.
- `openspec/specs/3d-pbr-wall-and-lighting/spec.md` L25: soundtrack plaques.
