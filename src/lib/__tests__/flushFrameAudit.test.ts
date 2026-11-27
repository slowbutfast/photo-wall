import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WALL_CSS = readFileSync(path.join(ROOT, 'src/styles/wall.css'), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('flush-mounted gallery print frames (wall.css)', () => {
  const css = stripComments(WALL_CSS);

  it('sets --frame-radius to 0px for sharp flush-mounted corners', () => {
    expect(css).toMatch(/--frame-radius:\s*0px\s*;/);
  });

  it('uses a 2.5px matte-black rigid backing edge on .photo-frame with zero gray bevels', () => {
    const frameBlock = /\.playground-wall-root\s+\.photo-frame\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(frameBlock).toContain('border: none;');
    expect(frameBlock).toContain('border-right: 2.5px solid #161616;');
    expect(frameBlock).toContain('border-bottom: 2.5px solid #121212;');
    expect(frameBlock).toContain('transform: translateZ(22px);');
    expect(css).not.toContain('#d5d1c8');
    expect(css).not.toContain('#c6c1b7');
  });

  it('sets .photo-window box-shadow: none everywhere (flat front plane)', () => {
    const windowMatches = [...css.matchAll(/\.playground-wall-root\s+\.photo-window\s*\{([^}]*)\}/g)];
    expect(windowMatches.length).toBeGreaterThan(0);
    for (const match of windowMatches) {
      expect(match[1]).toMatch(/box-shadow:\s*none\s*;/);
      expect(match[1]).not.toContain('inset');
    }
  });

  it('preserves --tilt-sx and --tilt-sy dynamic cleat shadows on focused frames', () => {
    expect(css).toMatch(/\.photo-frame\.is-lit\.focused[\s\S]*?var\(--tilt-sx/);
    expect(css).toMatch(/\.photo-frame\.is-lit\.focused[\s\S]*?var\(--tilt-sy/);
  });
});
