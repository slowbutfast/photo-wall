## Source material

**Maintainer, 2026-11-26 (verbatim):**

> the glass placard is hard to read on the brightest (concrete?) theme. can you propose a fix based on the description of the issue? The placard is hard to read because of four compounding contrast and rendering issues:
>  * Dark Text on a Dark Translucent Surface: The placard renders as dark smoked/tinted glass (~#4B4E49) over a shaded wall, while the text (untitled, Menuet — Toshifumi Hinata, 0:00 / 1:47) is still set in black ink (#111111). Placing dark lettering on a dark gray-green background drops the luminance contrast far below readable levels.
>  * Harsh White Outline / Emboss Halo: Each black character has a bright white outer highlight/shadow (text-shadow or light stroke) applied to separate it from the dark plate. At small sizes—especially on 0:00 / 1:47—that bright halo creates a vibrating edge that blurs the letterforms rather than sharpening them.
>  * Missing Bright Brushed-Aluminum Base: In your reference metal placard, black ink reads cleanly because the brushed silver aluminum face (#E2E4E6 to #B8BCC0) reflects light brightly. Here, the transparent glass shader lets the dark shadow behind the plaque bleed through instead of reflecting light off an opaque silver surface.
>  * Cluttered Bottom Elements: The horizontal divider rule, track name, and timestamp crowd the space just above the two bottom standoffs, competing visually with the CD case directly below it.
> How to Fix It
>  * Restore the Opaque Brushed-Silver Face: Switch the plaque face back to an opaque light metallic silver (#DCE0E3 to #B6BBC0) with a dark backing core, keep the text solid #111111 with zero text-shadow or white outline, and remove the divider line and audio metadata so only the bold title and regular caption remain. (Alternatively, if you keep a dark plaque surface, switch the text to crisp #FFFFFF with no shadow.)

**Proposal accepted, maintainer, 2026-11-26 (verbatim):**

> ff the change then write the handoff. use the skills.

The proposal that reply accepted:

- keep the dark smoked Beveled Glass plate and switch the Alabaster glass ink to light, with no text-shadow (the maintainer's own fallback option);
- give desktop the same Alabaster plate tint the coarse profile already has;
- delete the dead `[data-material=…]` rules;
- keep the soundtrack footer, the divider and the timecode.

### Raised but not acted on

- **"Brightest (concrete?) theme".** The brightest mood is `alabaster` (`wallBase #CBC6BC`, `ambientLevel 0.72`). Concrete already uses light glass ink, at about 9.3–10.3:1 (Verified facts). The reported plate colour `~#4B4E49` matches the coarse Alabaster plate.
- **An opaque brushed-silver face.** That is the existing **Brushed Aluminum** material (`.mat-aluminum`, `#111111` title, no text-shadow), which Curator Settings already offers. Repainting Beveled Glass as metal would duplicate it. Changing `DEFAULT_PLACARD_MATERIAL` is a separate product decision and is not part of this change.
- **Removing the divider, track name and timecode.** That would delete the shipped `placard-soundtrack-marquee` feature, and readability doesn't need it. Crowding is re-judged on the device after the contrast fix. If it still reads as crowded, the follow-up is more bottom padding, not deletion.
- **A pale frosted Alabaster plate with dark ink.** This is the alternative design (the old dead rule's `rgba(244,248,245,0.56)`), at about 13:1. It was rejected because it is a larger visual change, needs judging by eye, and breaks the "dark smoked glass in every mood" look.
- **Text-shadow in Chiaroscuro and Concrete.** Their dark drop shadow (`0 3px 4px rgba(0,0,0,0.52)` / `0 2px 4px rgba(0,0,0,0.48)`) sits under light ink on dark glass. It adds no halo and is out of scope.
- **`.museum-placard[data-tier='macro']`** (`wall.css:325-332`) may also be dead, because `AlbumPlacard` sets no `data-tier`. It is out of scope here and not verified either way.
- **The `placardInk` mood token** (`nyTimeMood.ts`, `#1D1E1C` for Alabaster) and `--mood-placard-ink` (`tokens.css`). These belong to the mood system, not the Beveled Glass ink path, and stay unchanged.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Beveled Glass** | The visitor-facing name of the `acrylic` placard material, rendered by `.playground-wall-root .museum-placard.mat-acrylic`. | The legacy `[data-material='beveled-glass']` selectors, which no element matches. |
| **Glass ink** | The three theme values `glassInk`, `glassCap` and `glassShadow` in `PLAYGROUND_THEMES` (`playgroundTheme.ts`). They are exposed as `--glass-ink`, `--glass-cap` and `--glass-text-shadow` on `.playground-wall-root`, and read only by `.mat-acrylic` text rules. | The mood token `placardInk` / `--mood-placard-ink`. |
| **Alabaster plate** | The `.mat-acrylic` background gradient applied when `data-mood='alabaster'`. | The wall colour (`wallBase #CBC6BC`) behind it. |
| **Coarse profile** | Rules inside `@media (pointer: coarse)` in `wall.css` (from `L1178`), as introduced by `mobile-render-profile`. | Viewport width. |
| **Composited plate colour** | The plate gradient stop alpha-composited over the wall colour. It is the effective background used for contrast maths. | The raw `rgba()` value. |
| **Dead `[data-material]` rules** | `wall.css:229-322`: every `.museum-placard[data-material=…]` rule and the selectors that descend from them. | The live `.museum-placard` base rule (`L194`), the `.placard-*` text rules (`L208-226`) or the `[data-tier='macro']` rules (`L324-332`). |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| WCAG 2.2, SC 1.4.3 Contrast (Minimum) and the relative-luminance definition | Text under 18pt (or under 14pt bold) needs at least 4.5:1. Luminance is the sRGB-linearised `0.2126R + 0.7152G + 0.0722B`, and the ratio is `(L1 + 0.05) / (L2 + 0.05)`. | W3C document licence, formula only | 2026-11-26 (from prior knowledge; not re-fetched) |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Change the Alabaster glass-ink theme values in `playgroundTheme.ts` | **Adopted** | This is the single source the CSS already reads. It's a three-value edit with no new selectors. | 2026-11-26 |
| Hard-code Alabaster colours in `wall.css` rules | Rejected | It would bypass `--glass-*` and leave two sources of truth for glass ink. | 2026-11-26 |
| A colour-contrast npm package for tests | Rejected | The WCAG formula is about 10 lines; a dependency isn't justified. | 2026-11-26 |

## Patterns adopted

- **Source-text CSS audit in Vitest:** read `wall.css` with `readFileSync`, as `src/lib/__tests__/touchAudit.test.ts` and `cssBoundaryAudit` already do. Contrast is then asserted from the parsed gradient stops, with no browser needed.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Alabaster glass ink is dark, with a white halo | `glassInk '#1D1E1C'`, `glassCap 'rgba(29, 30, 28, 0.84)'`, `glassShadow '0 1px 1px rgba(255, 255, 255, 0.45)'` | Read `src/lib/lighting/playgroundTheme.ts:72-74` at `b3cceff` | 2026-11-26 | stable until this change |
| `.mat-acrylic` text reads only the `--glass-*` variables | Title uses `color: var(--glass-ink)` and `text-shadow: var(--glass-text-shadow)`. Caption, track, meta, track-name and timecode use `var(--glass-cap)` and the same shadow. | Read `src/styles/wall.css:729-741` | 2026-11-26 | stable |
| The `--glass-*` values come from the theme | `playgroundThemeStyle()` maps `glassInk`/`glassCap`/`glassShadow` onto them. The `wall.css:413-415` defaults are the Chiaroscuro values. | Read `playgroundTheme.ts:86-104` and `wall.css:413-415` | 2026-11-26 | stable |
| The desktop Beveled Glass plate is the same for every mood | `linear-gradient(138deg, rgba(24,28,26,.58), rgba(18,22,20,.46) 55%, rgba(26,30,28,.54))` plus `backdrop-filter: blur(2.5px)`. No mood-scoped override exists outside the coarse block. | Read `wall.css:709-727`; `grep "mood='alabaster'"` only hits `L262`/`L278` (dead) and `L1271` (coarse) | 2026-11-26 | stable until this change |
| The coarse profile darkens the Alabaster plate | `rgba(30,36,33,.78) 0%, rgba(22,27,24,.70) 55%, rgba(34,40,36,.78) 100%` at `L1271-1279`. The generic coarse rule is at `L1251` and Concrete at `L1261`. | Read `wall.css:1251-1280` | 2026-11-26 | stable until this change |
| The reported plate is the coarse Alabaster plate | The composited coarse Alabaster plate over `#CBC6BC` is about `#464843`, against the reported `#4B4E49` | `node` WCAG script (session scratchpad), alpha-compositing stop colours over `wallBase` | 2026-11-26 | stable (maths) |
| Current Alabaster contrast fails | Title `#1D1E1C`: **1.81:1** (coarse) and **3.08:1** (desktop, about `#6a6a64`). Caption at 0.84: 1.66 / 2.65. | Same script | 2026-11-26 | stable (maths) |
| Light ink with no shadow passes on the coarse plate, except the 0.72-opacity lines on the middle stop | `#F4F6F4` title 7.72–8.61. `rgba(240,244,241,.92)` cap 6.7–7.44. Meta/timecode at `0.92 × 0.72`: **4.37** on the 0.70 stop. | Same script, per gradient stop | 2026-11-26 | stable (maths) |
| Chosen values clear 4.5:1 on every line | Plate stops `0.78 / 0.74 / 0.78`, cap `rgba(240,244,241,1)`. Worst meta/timecode is **5.09:1** over `#CBC6BC` and **4.70:1** over a lighter `#E6E2DA` spot-lit proxy. | Same script, sweeping the middle-stop alpha ∈ {0.70, 0.74, 0.76} × cap alpha ∈ {0.92, 0.96, 1.0} | 2026-11-26 | stable (maths) |
| Concrete and Chiaroscuro already pass | Concrete desktop title 9.27–10.25 and meta 5.03–5.43. Chiaroscuro title 13.1–13.6 and meta 6.3–6.5. | Same script | 2026-11-26 | stable |
| The `[data-material]` rules are dead | No `.tsx`/`.ts` under `src/` sets `data-material` or uses the legacy names (`beveled-glass`, `brushed-aluminum`, `matte-black`, `rag-paper`) outside `placardMaterial.ts`'s `LEGACY_ALIASES` storage migration. `AlbumPlacard` renders `className="museum-placard mat-${material}"`. | `git grep data-material` and a legacy-name grep over `src/**/*.{ts,tsx}`; read `AlbumPlacard.tsx:330` | 2026-11-26 | decays with code edits |
| No test asserts the Alabaster glass ink or the dead rules | `PLAYGROUND_THEMES`/`glassInk` and `data-material` appear in no `*.test.*` file. `touchAudit.test.ts:227-245` checks only that coarse `.mat-acrylic` has `backdrop-filter: none`, that backdrop rules are material-scoped, and that there are no coarse `.mat-aluminum`/`.mat-foamcore` rules. | `grep -rln` over `src/**/*.test.*`; read `touchAudit.test.ts:227-245` | 2026-11-26 | decays with test edits |
| A selector specificity of (0,4,0) beats the coarse generic rule | `[data-mood='alabaster'] .playground-wall-root .museum-placard.mat-acrylic` is (0,4,0), against `.playground-wall-root .museum-placard.mat-acrylic` at (0,3,0). An unconditional Alabaster rule therefore overrides the coarse generic background regardless of source order. | CSS specificity rules, by inspection | 2026-11-26 | stable |
| A mood pin exists for verification | `?mood=alabaster\|concrete\|chiaroscuro` overrides the solar mood, and `?demo=4` is a pinned local fixture | Read `src/components/PhotoWallApp.tsx:15-20` | 2026-11-26 | stable |
| The spec still claims dark Alabaster placard ink | The `3d-pbr-wall-and-lighting` scenario "Public visitor sees NYC solar mood…" says "high-contrast `#1D1E1C` placard ink" | Read `openspec/specs/3d-pbr-wall-and-lighting/spec.md:55-56` | 2026-11-26 | fixed by this change's MODIFIED block |

## Unverified assumptions

- **The spot-lit wall behind a placard stays at or below about `#E6E2DA`.** The WebGL wall adds spotlight pools over `wallBase`. If the lit wall behind the plate is much brighter, the 0.72-opacity lines fall toward the about 3.6:1 pure-white worst case. To check: sample the composited plate pixel from a `?demo=4&mood=alabaster` desktop screenshot during verification and record the measured contrast.
- **Desktop `backdrop-filter: blur(2.5px)` doesn't change the composite meaningfully.** Blur averages the wall under the plate without brightening it. This is confirmed by the same screenshot sample.
- **Light ink reads as intended on the phone.** This is subjective; the maintainer checks it on the device.

## Superseded claims

- **"Brightest (concrete?) theme"** (maintainer, 2026-11-26). The affected mood is `alabaster`. Concrete already uses light glass ink.
- **"Black ink (#111111)"** (maintainer, 2026-11-26). The ink is `#1D1E1C`. `#111111` is Brushed Aluminum's title colour.

## Links out

- `openspec/specs/3d-pbr-wall-and-lighting/spec.md`: "Verbatim playground acrylic glass standoff placards…", "Offline suncalc NYC solar circadian…" and "Coarse-pointer static frosted placards…".
- `openspec/changes/archive/2026-11-24-playground-wall-port/`: where `mat-acrylic` and the theme palettes were ported.
- `src/lib/lighting/playgroundTheme.ts`, `src/styles/wall.css`, `src/lib/__tests__/touchAudit.test.ts`.
