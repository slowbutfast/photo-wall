/**
 * `print-glare-tap-toggle` — source audit of the wiring that can't be rendered
 * headlessly (`GalleryCanvas` needs WebGL, ResizeObserver and a manifest).
 *
 * It also pins the blast radius: the change must not reach the gyro loop or the
 * `PrintSharpOverlay` sync (PR #18 postmortem).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(path.join(process.cwd(), file), 'utf8');

const GALLERY = read('src/components/wall/GalleryCanvas.tsx');
const FRAMED = read('src/components/wall/FramedPrint.tsx');
const OVERLAY = read('src/components/wall/PrintSharpOverlay.tsx');
const SYNC = read('src/components/wall/printSharpOverlaySync.ts');
const GYRO = read('src/components/wall/useGyroTilt.ts');

describe('GalleryCanvas glare wiring', () => {
  it('binds data-glare on the viewport element to the glareOff selector', () => {
    expect(GALLERY).toMatch(/useWallStore\(\(\w+\) => \w+\.glareOff\)/);
    expect(GALLERY).toContain("data-glare={glareOff ? 'off' : undefined}");
    const viewport = /<div\s+className="wall-viewport"[\s\S]*?>/.exec(GALLERY)?.[0] ?? '';
    expect(viewport).toContain('data-glare=');
    expect(viewport).toContain('data-tier=');
  });

  it('renders an aria-live status hint outside the scaled world', () => {
    expect(GALLERY).toMatch(/<div[^>]*className="glare-hint"[^>]*role="status"[^>]*aria-live="polite"/);
    // A sibling after the overlay, so it is never a child of `.wall-world`
    // (which the camera scales).
    const hintAt = GALLERY.indexOf('className="glare-hint"');
    expect(hintAt).toBeGreaterThan(GALLERY.indexOf('<PrintSharpOverlay'));
  });

  it('drives the hint from the toggle count and the shared helper', () => {
    expect(GALLERY).toContain('glareToggleCount');
    expect(GALLERY).toContain('glareHintText(');
    expect(GALLERY).toContain('GLARE_HINT_MS');
  });
});

describe('FramedPrint glare wiring', () => {
  it('toggles from the store inside onClick, gated on print + focused + coarse', () => {
    expect(FRAMED).toContain('toggleGlare');
    expect(FRAMED).toMatch(/tier === 'print' && focused && isCoarsePointer\(\)/);
  });
});

describe('blast radius', () => {
  it('leaves the overlay, its sync and the gyro hook untouched by glare state', () => {
    for (const source of [OVERLAY, SYNC, GYRO]) {
      expect(source).not.toMatch(/glareOff|toggleGlare|data-glare/);
    }
  });

  it('does not add glare state to the gyro subscription effect in FramedPrint', () => {
    const effect = /useEffect\(\(\) => \{\s*if \(!gyroSubscribe\)[\s\S]*?\}, \[[^\]]*\]\);/.exec(FRAMED)?.[0] ?? '';
    expect(effect.length).toBeGreaterThan(0);
    expect(effect).not.toMatch(/glare/i);
  });
});
