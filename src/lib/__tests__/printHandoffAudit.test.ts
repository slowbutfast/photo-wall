/**
 * Task 1.4 / 3.6 / 4.6 — source-text audit for the focus hand-off.
 *
 * The hand-off's guarantees are mostly expressed in CSS and in a handful of
 * imperative strings, so this mirrors `touchAudit.test.ts` /
 * `placardGlassLegibility.test.ts`: parse the stylesheets and assert the source
 * contract from `specs/print-focus-handoff`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const WALL_CSS = read('src/styles/wall.css');
const HUD_CSS = read('src/styles/hud.css');
const PHOTO_FOCUS_BAR = read('src/components/hud/PhotoFocusBar.tsx');
const PBR_WALL = read('src/components/wall/PlaygroundPbrWall.tsx');
const GALLERY_CANVAS = read('src/components/wall/GalleryCanvas.tsx');
const FRAMED_PRINT = read('src/components/wall/FramedPrint.tsx');

interface StyleRule {
  selector: string;
  /** Enclosing at-rule preludes, outermost first. */
  preludes: string[];
  body: string;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index] === quote) return index + 1;
    else index += 1;
  }
  return source.length;
}

function skipBlock(source: string, openBrace: number): number {
  let depth = 1;
  let index = openBrace + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipString(source, index);
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
}

/** Every style rule with its enclosing `@media`/`@supports` preludes. */
function collectRules(source: string): StyleRule[] {
  const css = stripComments(source);
  const rules: StyleRule[] = [];
  const preludes: string[] = [];
  let buffer = '';
  let index = 0;

  while (index < css.length) {
    const char = css[index];
    if (char === '"' || char === "'") {
      const end = skipString(css, index);
      buffer += css.slice(index, end);
      index = end;
      continue;
    }
    if (char === '{') {
      const prelude = buffer.trim().replace(/\s+/g, ' ');
      buffer = '';
      if (prelude.startsWith('@')) {
        preludes.push(prelude);
        index += 1;
        continue;
      }
      const bodyEnd = skipBlock(css, index);
      const body = css.slice(index + 1, bodyEnd - 1);
      for (const part of prelude.split(',')) {
        const selector = part.trim().replace(/\s+/g, ' ');
        if (selector) rules.push({ selector, preludes: [...preludes], body });
      }
      index = bodyEnd;
      continue;
    }
    if (char === '}') {
      preludes.pop();
      buffer = '';
      index += 1;
      continue;
    }
    buffer += char;
    index += 1;
  }
  return rules;
}

const isCoarse = (rule: StyleRule) =>
  rule.preludes.some((prelude) => /@media[^{]*pointer\s*:\s*coarse/i.test(prelude));

describe('wall.css hand-off rules', () => {
  const rules = collectRules(WALL_CSS);

  it('scopes every `--focus-w` rule to the hand-off, a shadow span, a veil or `.focused`', () => {
    const weightRules = rules.filter((rule) => rule.body.includes('--focus-w'));

    expect(weightRules.length).toBeGreaterThan(0);
    for (const rule of weightRules) {
      expect(rule.selector).toMatch(/\.is-handoff|\.photo-shadow-|\.photo-dim|\.focused/);
    }
  });

  it('stacks participants above the wall and the incoming print above the outgoing one', () => {
    const zIndex = rules.filter(
      (rule) => rule.selector.includes('.is-handoff') && rule.body.includes('z-index'),
    );

    expect(zIndex.some((rule) => rule.body.includes('z-index: 40'))).toBe(true);
    expect(zIndex.some((rule) => rule.body.includes('z-index: 41'))).toBe(true);
  });

  it('crossfades the falloff overlay with no transition while handing off', () => {
    const falloff = rules.find(
      (rule) =>
        rule.selector.includes('.is-handoff') &&
        rule.selector.includes('::after') &&
        rule.body.includes('opacity: calc(1 - var(--focus-w))'),
    );

    expect(falloff).toBeDefined();
    expect(falloff?.body).toMatch(/transition:\s*none/);
  });

  it('lifts, rotates and flips perspective on coarse pointers via `--focus-w` / `--gyro-r*`', () => {
    const lift = rules.find((rule) =>
      rule.body.includes('translateZ(calc(22px + 36px * var(--focus-w, 1)))'),
    );

    expect(lift).toBeDefined();
    expect(isCoarse(lift as StyleRule)).toBe(true);
    expect(lift?.body).toContain('var(--gyro-ry, 0)');
    expect(lift?.body).toContain('var(--gyro-rx, 0)');

    const handoffCell = rules.find(
      (rule) => rule.selector.includes('.is-handoff-cell') && rule.body.includes('perspective'),
    );
    expect(handoffCell).toBeDefined();
    expect(isCoarse(handoffCell as StyleRule)).toBe(true);
    expect(handoffCell?.body).toContain('preserve-3d');
  });

  it('hides the veil on fine pointers and drives it from `--print-w` on coarse', () => {
    const veilRules = rules.filter((rule) => rule.selector.includes('.photo-dim'));
    const base = veilRules.find((rule) => !isCoarse(rule));
    const coarse = veilRules.find((rule) => isCoarse(rule) && rule.body.includes('display: block'));

    expect(base?.body).toContain('display: none');
    expect(coarse).toBeDefined();
    expect(coarse?.body).toContain('var(--print-w, 0)');
    expect(coarse?.body).toContain('var(--focus-w, 0)');
  });

  it('keeps shadow layers static and never animates box-shadow from a weight', () => {
    const shadowRules = rules.filter((rule) => rule.body.includes('box-shadow'));

    for (const rule of shadowRules) {
      expect(rule.body).not.toMatch(/box-shadow:[^;]*var\(--focus-w/);
      expect(rule.body).not.toMatch(/box-shadow:[^;]*var\(--print-w/);
    }
  });

  it('adds no will-change or backface-visibility to frames or cells', () => {
    const frameRules = rules.filter(
      (rule) => rule.selector.includes('.photo-frame') || rule.selector.includes('.photo-cell'),
    );

    expect(frameRules.length).toBeGreaterThan(0);
    for (const rule of frameRules) {
      expect(rule.body).not.toContain('will-change');
      expect(rule.body).not.toContain('backface-visibility');
    }
  });

  it('turns off the crisp overlay transition during a hand-off', () => {
    const overlay = rules.find(
      (rule) => rule.selector.includes('.print-sharp-overlay.is-handoff') && rule.body.includes('transition: none'),
    );

    expect(overlay).toBeDefined();
  });
});

describe('touch-only additions', () => {
  it('hides the `[ESC]` hint on coarse pointers only', () => {
    const rules = collectRules(HUD_CSS).filter((rule) => rule.selector.includes('.hud-key-hint'));

    expect(rules.some((rule) => isCoarse(rule) && rule.body.includes('display: none'))).toBe(true);
    // Outside the coarse media query the hint must stay in the text run (the
    // button is `inline-flex` with a gap), so no fine-pointer `display: none`.
    const fineRules = rules.filter((rule) => !isCoarse(rule));
    expect(fineRules.some((rule) => rule.body.includes('display: none'))).toBe(false);
  });

  it('renders the hint inside the RETURN control so the markup stays identical', () => {
    expect(PHOTO_FOCUS_BAR).toContain('className="hud-key-hint"');
    expect(PHOTO_FOCUS_BAR).toMatch(/RETURN\s*<span className="hud-key-hint">\s*\[ESC\]\s*<\/span>/);
  });

  it('declares the IGN dither in the wall shader', () => {
    expect(PBR_WALL).toContain('uniform float uDither');
    expect(PBR_WALL).toContain('52.9829189');
    expect(PBR_WALL).toContain('0.06711056');
    expect(PBR_WALL).toContain('0.00583715');
    expect(PBR_WALL).toContain("'uDither'");
  });
});

describe('GalleryCanvas wiring', () => {
  it('plans the flight duration from the path instead of the fixed 720 ms', () => {
    expect(GALLERY_CANVAS).not.toContain('flyTo(target, 720)');
    expect(GALLERY_CANVAS).toContain('planFlight(');
  });

  it('declares the portrait touch padding constant', () => {
    expect(GALLERY_CANVAS).toMatch(/PRINT_PADDING_TOUCH_PORTRAIT\s*=\s*0\.08/);
  });

  it('renders overlays per participant instead of a single focused key', () => {
    expect(GALLERY_CANVAS).not.toContain("key={focusedPhotoId ?? 'none'}");
  });
});

describe('FramedPrint touch writes', () => {
  it('exposes the photo id for frame lookup', () => {
    expect(FRAMED_PRINT).toContain('data-photo-id');
  });

  it('writes gyro rotation as custom properties on the coarse path', () => {
    expect(FRAMED_PRINT).toContain("style.setProperty('--gyro-rx'");
    expect(FRAMED_PRINT).toContain("style.setProperty('--gyro-ry'");
    expect(FRAMED_PRINT).not.toContain('const frameTransform = `translateZ(58px) rotateY');
  });
});

describe('PATCH-01: overlay wake and glare', () => {
  const OVERLAY = read('src/components/wall/PrintSharpOverlay.tsx');

  it('wakes every mounted overlay from the camera loop', () => {
    expect(GALLERY_CANVAS).toMatch(/overlayWakeRef = useRef<Set<\(\) => void>>\(new Set\(\)\)/);
    expect(GALLERY_CANVAS).toMatch(/for \(const wake of overlayWakeRef\.current\) wake\(\)/);
    expect(OVERLAY).toMatch(/wakeRegistry\?\.add\(cameraWake\)/);
    expect(OVERLAY).toMatch(/wakeRegistry\?\.delete\(cameraWake\)/);
    expect(OVERLAY).not.toMatch(/cameraWakeRef\.current = cameraWake/);
  });

  it('hands off along the Overview flight when leaving Print Focus', () => {
    const overviewBranch = GALLERY_CANVAS.slice(
      GALLERY_CANVAS.indexOf("if (viewMode === 'overview' || !album) {"),
      GALLERY_CANVAS.indexOf('const aspect = viewportRef.current.width', GALLERY_CANVAS.indexOf("if (viewMode === 'overview' || !album) {")),
    );
    expect(overviewBranch).toMatch(/previous\.viewMode === 'print'/);
    expect(overviewBranch).toMatch(/flightRef\.current/);
    expect(overviewBranch).toMatch(/beginHandoff\(\{[\s\S]*printFrom: 1,[\s\S]*printTo: 0,/);
  });

  it('never reads computed style back from the sheen per frame', () => {
    expect(OVERLAY).not.toMatch(/getComputedStyle\(sheenIn\)/);
  });

  it('keeps the resting focused glare tied to the gyro flag, not an inline 0.92', () => {
    expect(FRAMED_PRINT).toMatch(/setProperty\('--gyro-on', '1'\)/);
    // The fine-pointer mouse path still writes its own inline opacity; only the
    // gyro subscription must stay off it.
    const gyroBlock = FRAMED_PRINT.slice(
      FRAMED_PRINT.indexOf('gyroSubscribe((tilt'),
      FRAMED_PRINT.indexOf('return () => {', FRAMED_PRINT.indexOf('gyroSubscribe((tilt')),
    );
    expect(gyroBlock.length).toBeGreaterThan(200);
    expect(gyroBlock).not.toMatch(/style\.opacity/);
    for (const selector of [/\.photo-frame\.focused \.photo-sheen$/, /\.photo-frame\.is-handoff \.photo-sheen$/]) {
      const rule = collectRules(WALL_CSS).find(
        (candidate) =>
          candidate.preludes.some((prelude) => /pointer:\s*coarse/.test(prelude)) &&
          selector.test(candidate.selector.trim()) &&
          /opacity:/.test(candidate.body),
      );
      expect(rule, String(selector)).toBeDefined();
      expect(rule?.body).toMatch(/var\(--gyro-on, 0\)/);
      expect(rule?.body).toMatch(/var\(--focus-w, 1\)/);
    }
  });
});
