## Automated Tests

- `npx vitest run src/components/wall/__tests__/soundtrackState.test.ts`:
  - `showsIframeFor` is true for the active album and false for others;
  - after A→B, only B is true;
  - false at overview and before play;
  - the exclusivity property over randomised event sequences (≤ 1 id true, equal to `activeAlbumId`);
  - existing tests unchanged and green.
- Full suite `npx vitest run`, plus `npx tsc --noEmit`, `npx eslint .` and `npm run build`, all clean.

## Manual Verification

Use local dev with two adjacent albums that both have soundtracks. Playback is read-only, so a final read-only check on production `/photos` after deploy is fine.

- **Single player:**
  - **WHEN** you zoom to album tier with A and B both visible and click A's plaque
  - **THEN** only A plays, B shows its thumbnail facade, and `document.querySelectorAll('.soundtrack-iframe').length === 1`
- **Handover:**
  - **WHEN** you then click B's plaque
  - **THEN** A returns to its facade, B plays, and the iframe count is still 1
- **Capture layer:**
  - **WHEN** you wheel or drag over B's facade while A plays
  - **THEN** the wall pans or zooms normally, with no capture layer over B
