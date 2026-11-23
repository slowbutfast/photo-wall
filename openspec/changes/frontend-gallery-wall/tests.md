# Tests: `frontend-gallery-wall`

## Automated Tests

1. **Camera Math Property Tests (`vitest` + `fast-check`)**:
   - Command: `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts`
   - Verifies:
     - `zoomToCursor` world-point invariance using the **effective clamped zoom factor** within floating-point epsilon (`1e-4`), including at `zClamp = [2.4, 140.0]` boundaries.
     - `fitBoundsToViewport` fits both landscape and portrait prints/albums on portrait mobile and ultrawide viewports cleanly above `bottomInsetPx`.
     - `worldPerPixel` and `O(albums)` broad-phase + `O(1)` cell `hitTestWall` round-trip accuracy.
2. **Lighting Fixture & NYC Solar Mood Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/lighting/__tests__/fixtures.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts`
   - Verifies `buildWorldFixtures` emits `ceil(cols / 2)` fixtures per album, top-row irradiance > bottom-row irradiance, shadow vector points away from strongest fixture, and `determineAutoMood` / `fallbackNyMood` map NYC solar windows (`alabaster`, `concrete`, `chiaroscuro`) accurately.
3. **TexturePool & Folder-Drop Reader Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/components/wall/__tests__/TexturePool.test.ts src/components/admin/__tests__/folderReader.test.ts`
   - Verifies `TexturePool` byte accounting from decoded `ImageBitmap` dimensions, eviction priority (`off-screen` → `visible thumbs` → `visible medium` → `focus` max 3), `bitmap.close()` + `tex.dispose()`, and `readEntries()` loop over a fake `FileSystemDirectoryReader` returning 100-entry pages (`> 110` files).
4. **Typecheck, Lint & Bundle Split Verification**:
   - Command: `npm run lint && npx tsc --noEmit && npm run build`
   - Verifies zero TypeScript/ESLint errors and confirms `AdminDrawer` / `FolderDropzone` are code-split out of the public entry chunk.

## Manual Verification

1. **2,000-Photo Spike (`?demo=2000`) — Executed Before HUD/Upload UI**:
   - Open `http://localhost:3000/?demo=2000` at `1920x1080` in Chrome DevTools Performance tab.
   - Pan and zoom rapidly across 50 albums / 2,000 photos; confirm `p95 frame time <= 16.7ms`, `GPU texture memory < 256 MB`, and every one of the 50 albums is illuminated (no 24-light cap cutoff).
2. **Visual Lighting Acceptance Check (Fixed Camera Positions)**:
   - Capture/inspect **Macro Overview**, **Album Focus**, and **Print Focus**: confirm stucco ridges catch overhead light, top row > bottom row brightness, wall-plane cast shadows stay at `z = 0.002` away from strongest light, and focused print clears dimming with mat+print lifting together.
3. **Spatial Navigation, Auth Gate & Partial Upload Retry**:
   - Verify lock icon on `Curate` when unauthenticated (`GET /api/admin/auth` returns `false`), keyboard guard while typing in Curator inputs, and simulated partial upload failure retaining `draft` with Retry + Discard controls.
