import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WALL_CSS = readFileSync(path.join(ROOT, 'src/styles/wall.css'), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('instant-film cardstock print frames (wall.css)', () => {
  const css = stripComments(WALL_CSS);

  it('sets --frame-radius to 1.5px for crisp nearly-square cardstock corners', () => {
    expect(css).toMatch(/--frame-radius:\s*1\.5px\s*;/);
  });

  it('uses warm eggshell cardstock gradient and no black backing or gray bevel strokes on .photo-frame', () => {
    const frameBlock = /\.playground-wall-root\s+\.photo-frame\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(frameBlock).toContain('border: none;');
    expect(frameBlock).toContain('linear-gradient(180deg, #F6F5F1 0%, #ECEAE3 100%)');
    expect(frameBlock).toContain('transform: translateZ(22px);');
    expect(frameBlock).not.toContain('#161616');
    expect(frameBlock).not.toContain('#121212');
    expect(css).not.toContain('#d5d1c8');
    expect(css).not.toContain('#c6c1b7');
  });

  it('gives the cardstock a 1px top catchlight and soft warm-gray bottom paper edge', () => {
    expect(css).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.85)');
    expect(css).toContain('inset 0 -1.5px 1px rgba(40, 38, 34, 0.18)');
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
