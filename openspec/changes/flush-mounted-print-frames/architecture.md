# Architecture: Flush-Mounted Gallery Print Frames

> [!NOTE]
> This document specifies **technical system architecture only** (CSS ownership, layout-geometry invariance, and mobile/desktop parity boundaries).
> Visual tokens and surface styling are specified in `design.md`.

## Context

`src/styles/wall.css` currently styles `.playground-wall-root .photo-frame` (`L993-L1015`) with thick gray outer bevels (`border-right: 4px solid #d5d1c8; border-bottom: 5px solid #c6c1b7; border-top/left` white highlights) and `.photo-window` (`L1128-L1141`, coarse `L1257-L1261`) with multi-layer recessed cutout inset shadows. All 3D lift (`translateZ(22px)` / `36px` / `58px`), hover tilt, mobile gyroscope tilt, `--tilt-sx`/`--tilt-sy` shadow offsets, and `.photo-sheen` glare live independently in `FramedPrint.tsx`, `useGyroTilt.ts`, and `PrintSharpOverlay.tsx`.

## Goals / Non-Goals

**Goals:**
- Pure CSS visual transition in `src/styles/wall.css` with **zero** JS, React, or layout-geometry changes (`--frame-padding: 11px` stays unchanged, so `fitFrameInCell`, `MacroIsland`, `islandLayout`, and `PrintSharpOverlay` stay 100% aligned).
- Preserve all lift, tilt, dynamic `--tilt-sx`/`--tilt-sy` shadow, and `.photo-sheen` interactions on both desktop (`pointer: fine`) and mobile (`pointer: coarse`).
- Keep `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` 100% green.

**Non-Goals:**
- Changing photo aspect ratios, cell sizes, gutters, or `MacroIsland` mosaic geometry.
- Adding Polaroid bottom chins or full-bleed borderless cropping.

## Technical Decisions

### D1. Pure CSS Flush-Mounted Border & Flat Window Plane (`src/styles/wall.css`)
- **Decision:**
  - Update `.playground-wall-root .photo-frame` (`L993-L1015`): replace `border-top/left/right/bottom` with `border: none; border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;` and set `--frame-radius: 0px` (removing 45° mitered light-gray bevel seams).
  - Update `.playground-wall-root .photo-window` (`L1128-L1141`) and remove/zero the coarse-pointer `.photo-window` inset shadow override (`L1257-L1261`) so `.photo-window` has `box-shadow: none` everywhere (flat front plane).
  - Update `.photo-frame.is-lit`, `.photo-frame.is-lit:hover`, and `.photo-frame.focused` / `.photo-frame.is-lit.focused` shadows to replace the bright top-bevel `0 1px 0 rgba(255, 252, 242, ...) inset` with a subtle hairline `0 0 0 0.5px rgba(255, 255, 255, 0.14) inset`, keeping the directional two-layer floating cleat shadow (`--sx`/`--sy` + `--tilt-sx`/`--tilt-sy`) intact.
- **Rationale:** Zero runtime overhead, zero layout/box-size drift, and even fewer rasterized inset shadow layers on both desktop and mobile.

### D2. Preserve Existing Lift, Tilt, & Coarse-Pointer Render Profile
- **Decision:** Leave `transform: translateZ(22px)`, `transform-style: preserve-3d`, `transition: transform 0.24s ...`, `FramedPrint.tsx` hover/gyro tilt math, and `@media (pointer: coarse)` `.photo-frame:not(.focused)` `scale(1.0195)` flattening + `.photo-frame.is-lit.focused` shadow specificity completely untouched.
- **Rationale:** Preserves every performance and interaction guarantee from `mobile-render-profile`, `mobile-gyroscope-glare`, and `macro-lod-continuity`.

## Risks / Trade-offs

- **[Risk] Existing static audit test (`touchAudit.test.ts`) or parity test checks old `.photo-window` inset shadows.** → **Mitigation:** Audit `src/lib/__tests__/touchAudit.test.ts` in Task 1.1 and update any pinned `.photo-window` shadow assertion to expect `box-shadow: none`.

## Migration & Rollback Plan

- Single-file CSS change (`src/styles/wall.css`) + audit test; rollback is a single `git revert`.
