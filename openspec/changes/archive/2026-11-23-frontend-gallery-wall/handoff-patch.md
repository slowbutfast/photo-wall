# Surgical Patch Handoff: OpenSpec Change 'frontend-gallery-wall' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `frontend-gallery-wall` (`openspec/changes/archive/2026-11-23-frontend-gallery-wall`)
- **Patch ID**: `PATCH-01`
- **Objective**: Fix the reversed GLSL `smoothstep` and align the wall spotlight shader with `buildWorldFixtures`, eliminate overview shadow z-fighting via `depthWrite={false}` on the wall, and stop killing soundtrack playback on clicks/wheel/print-focus within the same album.
- **Feedback & Diagnostic Trace**:
  ```
  Important:
  1. [src/components/wall/InfiniteWallShader.tsx:L103] smoothstep(0.54, 0.05, d) has edge0 > edge1 (undefined in GLSL). Use increasing edges (e.g. 1.0 - smoothstep(0.05, 0.54, d)).
  2. [src/components/wall/InfiniteWallShader.tsx:L50-L109, L222-L246] Spotlight pool is a centered oval + separate global directionalLight rather than the shared buildWorldFixtures overhead track-head cones driving wall PBR highlights and object shading consistently.
  3. [src/components/wall/InfiniteWallShader.tsx:L226-L246 + WallInstancedLayer.tsx:L105, L115-L121] At z > 80 (overview z = 140, near = 0.2), z = 0.002 shadows and z = 0 light pools z-fight with the wall. Fix: set depthWrite={false} on the wall's meshStandardMaterial (and spotlight material), and re-check the overview screenshot.
  4. [src/components/wall/CameraRig.tsx:L207-L226; soundtrackOverlay.ts:L46-L60] onPointerDown fires pan-start before moved threshold, wheel kills playback, and entering 'print' viewMode stops playback. Fix: switch overlay iframe to pointer-events: none during gestures, only signal drag once moved threshold is crossed, keep playing in 'print' within the same album, and stop on 'overview' or selecting a different album.
  ```

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/wall/InfiniteWallShader.tsx` | `L50-L110`, `L222-L247` | Fix reversed `smoothstep` (`edge0 < edge1`), drive per-album wall spotlight quads from `buildWorldFixtures` (`src/lib/lighting/fixtures.ts`) consistently with object shading, and set `depthWrite={false}` on the wall `meshStandardMaterial` (and spotlight material). |
| `src/components/wall/CameraRig.tsx` | `L200-L245` | Do NOT call `notifyOverlay('pan-start')` on `onPointerDown`; only signal gesture-active (`pointer-events: none`) once `moved` threshold is crossed or during wheel, and clear on pointerup/wheel-idle. |
| `src/components/wall/soundtrackOverlay.ts` | `L11-L75` | Separate `gestureActive` (`pointer-events: none`) from `playing`; keep `playing` & `mounted` alive in `'print'` within the same `albumId`, stopping only on `'overview'` or switching `albumId`. |
| `src/components/wall/SoundtrackOverlay.tsx` | `L150-L170` | Apply `pointerEvents: gestureActive ? 'none' : 'auto'` on the overlay frame so gestures never get swallowed while music keeps playing. |
| `src/components/wall/__tests__/SoundtrackOverlay.test.ts` | Test suite | Update/add tests verifying clicks, drag gestures, and `'print'` within the same album preserve playback while `'overview'` or switching albums stops it. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the lines and files specified in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor `TexturePool.ts`, `VisiblePrintPool.tsx`, `GalleryHud.tsx`, or `AdminDrawer.tsx`.
  - Do NOT modify `.env` or credential files.
- **INVARIANTS TO PRESERVE**: All existing `cameraMath`, `fixtures`, `nyTimeMood`, `TexturePool`, and `folderReader` tests MUST continue to pass; `next build` must keep `AdminDrawer` code-split.

## 4. Visual & UI Impact
- `InfiniteWallShader.tsx`: `depthWrite={false}` on the PBR plaster wall (`z = 0.00`) eliminates overview (`z = 140`) shadow z-fighting while opaque mats (`z = 0.22`) continue occluding shadows.
- Re-capture and visually inspect the Macro Overview screenshot (`1920x1080`) after applying the fix to confirm clean shadows and unified track-head spotlight cones.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: Run `npx vitest run src/components/wall/__tests__/SoundtrackOverlay.test.ts`. Confirm newly added reproducing tests fail.
2. **Apply Minimal Fix**: Make targeted edits in mapped files.
3. **Verify Fix**: Re-run `npx vitest run src/components/wall/__tests__/SoundtrackOverlay.test.ts`. Confirm PASS.
4. **Full Regression Suite**: Run `npx vitest run && npm run typecheck && npm run lint && npm run build`. Confirm 100% clean passes.

## 6. Surgical Patch Checklist
- [ ] P01.1 Add and run reproducing tests in `SoundtrackOverlay.test.ts` and confirm initial failure.
- [ ] P01.2 Implement minimal fixes in `InfiniteWallShader.tsx`, `CameraRig.tsx`, `soundtrackOverlay.ts`, and `SoundtrackOverlay.tsx`.
- [ ] P01.3 Re-run `SoundtrackOverlay.test.ts` and confirm PASS; re-check Macro Overview screenshot.
- [ ] P01.4 Run full regression suite (`npx vitest run && npm run typecheck && npm run lint && npm run build`) and confirm zero regressions.
- [ ] P01.5 Update `openspec/changes/archive/2026-11-23-frontend-gallery-wall/tasks.md` checkboxes to `- [x]`, update `verification.md`, and mark `PATCH-01` `RESOLVED` in `patch.md`.
