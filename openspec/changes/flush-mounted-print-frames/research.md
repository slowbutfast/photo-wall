## Source material

- **2026-11-27 — User Request & Visual Playground Approval (`playgrounds/exhibition_signage_playground.html`):**
  - Replace the bulky molded picture-frame / beveled cutout-mat border on `.photo-frame` with a **flush-mounted gallery print** aesthetic (photograph mounted on rigid aluminum Dibond / archival Gatorboard):
    - **Eliminate sloped 3D side bevels & mitered corner seams:** Remove the wide light/medium gray outer bevels (`border-right: 4px solid #d5d1c8`, `border-bottom: 5px solid #c6c1b7`, `border-top/left` white highlights) and the 45-degree corner seams.
    - **Eliminate recessed inner window lip:** Remove the multi-layer inner `box-shadow` on `.photo-window` (`L1135-L1140` desktop and `L1257-L1261` coarse) so the front face is a single completely flat plane with a clean, flat white margin (`--frame-padding: 11px`, `--frame-bg: #f6f4ef`, zero sculptural molding).
    - **Add thin rigid matte-black backing edge:** Apply a uniform crisp `2.5px` matte-black board edge (`border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, `border-radius: 0`) matching the dark core edge of the gallery's metal placards.
    - **Keep floating cleat shadow for elevation:** Retain the two-layer directional floating cleat shadow (tight contact shadow + soft offset downward shadow driven by `--sx`/`--sy` and `--tilt-sx`/`--tilt-sy`) without bright molded top-edge inset highlights.
    - **Preserve all lift, tilt, and specular sheen animations:** Desktop mouse hover lift (`translateZ(36px)`/`58px`), 3D `rotateX`/`rotateY` tilt, Print Focus lift, mobile Print Focus gyroscope tilt + auto-recenter, and flat `.photo-sheen` specular highlight remain 100% intact.

### Raised but not acted on

- **Polaroid asymmetric bottom chin & 600 Square crop:** Explored in `playgrounds/exhibition_signage_playground.html`; user chose the **Flush-Mounted Dibond / Gatorboard** flat-plane print style instead.
- **Full-bleed borderless prints (`padding: 0`):** Explored in the playground; keeping the clean flat white margin (`--frame-padding: 11px`) preserves exact `fitFrameInCell` / `MacroIsland` geometry with zero layout shift.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Flush-mounted print (Dibond / Gatorboard)** | A flat-plane photograph + clean white margin mounted on a rigid board with a crisp `2.5px` matte-black right/bottom core edge, zero sloped outer bevels, zero mitered corner seams, and zero recessed inner cutout shadow. | A flat 2D image stuck to the wall with no elevation shadow, no 3D lift, no tilt, or no sheen. |
| **Floating cleat shadow** | Two-layer directional wall shadow (tight contact shadow + soft downward offset shadow using `--sx`/`--sy` and `--tilt-sx`/`--tilt-sy`) simulating a French cleat lifting the rigid board off the plaster wall. | Heavy sculptural frame trim or inner cutout mat shadow. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `playgrounds/exhibition_signage_playground.html` | User-approved visual prototype for Flush Dibond (Margin) with `2.5px` `#161616`/`#121212` rigid backing edge, flat `.photo-window` (`box-shadow: none`), floating cleat shadow, and flat surface sheen. | Repo-internal | 2026-11-27 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Pure CSS token & border/shadow update in `src/styles/wall.css` | Adopted | Zero JS/layout geometry changes (`--frame-padding: 11px` stays identical), zero macro mosaic footprint drift, and preserves all hover/gyro tilt & `PrintSharpOverlay` alignment automatically. | 2026-11-27 |

## Patterns adopted

- **Matte-black board core edge (`#161616` / `#121212`):** Matches the dark core edge used on `.museum-placard.mat-aluminum` (`border-right: 3px solid #161616; border-bottom: 3.5px solid #141414`) for unified gallery materiality.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Current `.photo-frame` uses thick gray beveled borders (`4px`/`5px`) causing 45° mitered seams | `border-right: 4px solid #d5d1c8; border-bottom: 5px solid #c6c1b7;` (`L998-L1001`) | Inspected `origin/main:src/styles/wall.css` (`c626136`) | 2026-11-27 | stable |
| Current `.photo-window` casts a 5-layer recessed inner cutout shadow (2-layer on coarse) | `L1135-L1140` (desktop), `L1257-L1261` (coarse) | Inspected `origin/main:src/styles/wall.css` (`c626136`) | 2026-11-27 | stable |
| Tilt, lift (`translateZ`), `--tilt-sx`/`--tilt-sy`, and `.photo-sheen` live in `FramedPrint.tsx` & `useGyroTilt.ts` | Unchanged by CSS border/inner-shadow removal | Verified from `FramedPrint.tsx` & `wall.css` | 2026-11-27 | stable |
| `PrintSharpOverlay` reads `win.offsetWidth`/`offsetHeight` dynamically | Aligns automatically with `border-radius: 0` and flat `.photo-window` | Verified from `PrintSharpOverlay.tsx` | 2026-11-27 | stable |

## Unverified assumptions

- **Audit tests checking old bevel/shadow strings in `wall.css`:** Check `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` during Task 1.1 to confirm whether any assertion pins the old `.photo-window` inset shadow or `.photo-frame` border values.

## Superseded claims

- None.

## Links out

- Approved visual playground: `playgrounds/exhibition_signage_playground.html`
