## Source material

- **2026-11-25 — User request (verbatim):** "I want to make the glare appear by default on mobile to be in the top right so that it's not obscuring the photo, and then also lower the intensity by about 50%. And can we lower the intensity on both mobile and desktop, but then make the position of the glare start in the top right only on mobile? Can you propose what that might look like?"
- **2026-11-25 — Agreed proposal (Claude Code session, accepted by the user via `/openspec-ff-change`):**
  - Halve glare intensity on every device by scaling the `.photo-sheen` gradient's alpha stops through one `--sheen-strength` multiplier (`0.5`), rather than editing the three places that write opacity (CSS rest value, mouse handler, gyro handler).
  - Move the glare's resting centre to the top-right on `(pointer: coarse)` only, through a `--sheen-anchor` custom property on the gradient position (`65% 35%` of the sheen box ≈ `84%` across / `16%` down the photo). The gyro keeps sweeping relative to that anchor.
  - Ship as one change with two separately testable requirements.

### Raised but not acted on

- **Biasing `nx`/`ny` in the gyro callback (`nx - 0.4`):** rejected. It only moves the glare while the gyro runs, so the static fallback (Reduce Motion, motion permission denied, no sensor) would stay centred, which is the exact case the user sees most. It would also touch `FramedPrint`'s gyro and reset paths.
- **Shrinking the glare ellipse on mobile (`--sheen-size: 34% 30%`):** deferred to the device pass. The anchor alone may be enough; tune only if the corner glare still spills across the photo.
- **Moving the desktop resting position:** out of scope by request. Desktop keeps the centred anchor and the mouse sweep; only its intensity changes.
- **Deleting the dead `.museum-placard[data-material='beveled-glass']` CSS (`wall.css` L234–L280):** unrelated cleanup.
- **Stale "Album tier 30% amplitude" wording in `instanced-photo-renderer`:** the shipped `mobile-render-profile` removed Album View gyro/sheen on coarse pointers; reconciling that older requirement is a separate spec-hygiene task.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Glare / sheen** | The `.photo-sheen` element: a white radial-gradient specular highlight over the photo window (and its mirror inside `.print-sharp-overlay`). | The WebGL spotlight pools on the wall, or the frame's cast shadow. |
| **Sheen intensity** | The highlight's visible strength = element `opacity` × gradient alpha stops. | Only the `--sheen-intensity` variable (that is just the *rest* opacity, `0.44`). |
| **`--sheen-strength`** | New multiplier applied to every gradient alpha stop; `1` reproduces today's look, `0.5` halves it. | A replacement for `--sheen-intensity` or for the inline `opacity: 0.92` writes; those stay untouched. |
| **Sheen anchor (`--sheen-anchor`)** | The gradient's centre position *inside the sheen box* (`at X Y` of the `radial-gradient`). Default `50% 50%`. | A position in photo coordinates. The sheen box is `inset: -65%`, i.e. 230% of the photo, so `65% 35%` of the box ≈ `84.5% / 15.5%` of the photo. |
| **Resting position** | Where the glare sits with no tilt input: mouse not over the print, gyro at its entry baseline (`nx = ny = 0`), or no gyro at all. | The position at a particular tilt angle. |
| **Coarse / fine pointer** | `@media (pointer: coarse)` (phones, tablets) vs `(pointer: fine)` (mouse/trackpad desktops). | Viewport width. A narrow desktop window is still fine-pointer. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| CSS Images Level 3/4, `radial-gradient()` `<position>` | The `at <position>` component accepts any `<position>`, so `var()` substitution with a fallback (`var(--sheen-anchor, 50% 50%)`) is valid; percentages resolve against the gradient box. | W3C spec (reference only) | 2026-11-25 |
| CSS Compositing Level 1, `screen` / `normal` blend | Both blend results are linear in source alpha for a constant white source, so scaling alpha stops by `k` equals scaling element opacity by `k` in either mode. | W3C spec (reference only) | 2026-11-25 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `--sheen-strength` multiplier inside the gradient's `rgba(…, calc(a * var(--sheen-strength)))` stops | Adopted | One CSS rule changes, one knob to tune on device, opacity transitions and JS writes untouched. | 2026-11-25 |
| Halve `--sheen-intensity` and both `opacity: '0.92'` JS writes | Rejected | Three edit sites across CSS + `FramedPrint.tsx` (mouse and gyro paths), plus `PrintSharpOverlay` mirrors inline opacity; more surface, same result. | 2026-11-25 |
| `--sheen-anchor` custom property on the gradient position, set under `(pointer: coarse)` | Adopted | Pure CSS, covers static and gyro cases, overlay inherits the same rule. | 2026-11-25 |
| `nx`/`ny` bias in the gyro callback | Rejected | See "Raised but not acted on". | 2026-11-25 |
| New dependencies | Rejected | None needed. | 2026-11-25 |

## Patterns adopted

- **Capability-gated CSS overrides at the end of `wall.css`'s existing `@media (pointer: coarse)` block**, the same pattern `mobile-render-profile` used, so `(pointer: fine)` desktop only sees the base rule change.
- **Static CSS audit tests** (`src/lib/__tests__/touchAudit.test.ts` style: parse `wall.css`, find rules, assert declarations) for the new variables.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `.photo-sheen` base rule: gradient centred at `50% 50%`, box `inset: -65%`, `mix-blend-mode: screen`, opacity from `--sheen-intensity` | `radial-gradient(ellipse 46% 42% at 50% 50%, rgba(255,255,255,0.38) 0%, rgba(255,253,246,0.14) 44%, rgba(255,253,246,0) 74%)` | Read `src/styles/wall.css` `L1147-L1163` on `main` @ `2b14783` | 2026-11-25 | stable |
| Rest opacity is `--sheen-intensity: 0.44`, defined once | `L437`; `git grep sheen-intensity src` → only the definition and `L1152` | `git grep` on `main` @ `2b14783` | 2026-11-25 | stable |
| Mouse hover (desktop) and gyro (mobile Print Focus) both write inline `opacity: 0.92` and `transform: translate3d(-nx*38%, -ny*38%, 0)` | Mouse: `FramedPrint.tsx` `onPointerMove` ~`L206-L210`; gyro: ~`L136-L144`; reset paths clear both | Read `src/components/wall/FramedPrint.tsx` on `main` @ `2b14783` | 2026-11-25 | stable |
| Tilt coordinates are `nx, ny ∈ [-0.5, +0.5]` for both mouse and gyro | Mouse: `(clientX - left)/width - 0.5`; gyro: `clamp(±22°)/44` | Read `FramedPrint.tsx` and `gyroTilt.ts` `L100-L103` | 2026-11-25 | stable |
| Glare translation range is ±19% of the sheen box ≈ ±43.7% of the photo | `0.5 × 38% × 2.3` | Arithmetic from the two facts above | 2026-11-25 | stable |
| `65% 35%` of the sheen box ≈ `84.5%` across, `15.5%` down the photo | Box spans `-65%..165%` of the photo; `x_photo = 2.3·x_box − 65%` | Arithmetic from `inset: -65%` | 2026-11-25 | stable |
| `PrintSharpOverlay` copies only inline `transform`/`opacity` from the focused sheen; gradient, anchor and blend come from CSS | `sync()` writes `sheenOut.style.transform`/`opacity` only | Read `src/components/wall/PrintSharpOverlay.tsx` on `main` @ `2b14783` | 2026-11-25 | stable |
| Coarse-pointer sheen rules exist and are audited | `.photo-frame:not(.focused) .photo-sheen { display: none }` (`L1193`); focused + overlay `mix-blend-mode: normal` (`L1197-L1199`); `touchAudit.test.ts` `L181-L198` asserts normal blend and no `screen` in coarse sheen rules | Read `wall.css` and `touchAudit.test.ts` | 2026-11-25 | stable |
| Desktop parity was previously guaranteed byte-identical by `mobile-render-profile` | Its requirement ends "Desktop `(pointer: fine)` rendering SHALL remain byte-identical" | Read `openspec/specs/instanced-photo-renderer/spec.md` | 2026-11-25 | stable |

## Unverified assumptions

- **`50%` is the right strength on both devices.** Must be judged on a real iPhone 16 Pro and a desktop across `chiaroscuro`, `concrete`, `alabaster`. Cost: one device pass; tuning is a one-value change.
- **`65% 35%` reads as "top-right, not obscuring" at Print Focus.** The ellipse (`46% × 42%` of the box) has a soft skirt reaching ~0.75 photo widths, so some falloff will still reach the middle. Cost: device screenshot; fallback is `--sheen-size` (deferred).
- **No measurable perf change.** The gradient stays one layer; `calc()` in color stops resolves at style time. Not expected to matter, not measured.

## Superseded claims

- None yet.

## Links out

- Shipped prerequisite changes on `main`: `openspec/changes/mobile-gyroscope-glare/`, `openspec/changes/mobile-render-profile/`, `openspec/changes/render-loop-efficiency/` (PR #13 `1d923a2`, PR #14 `2b14783`)
- Main specs: `openspec/specs/instanced-photo-renderer/spec.md`
