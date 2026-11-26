/**
 * Task 1.2 — static touch-compatibility audit.
 *
 * Contract from `specs/gallery-hud-and-curator-ui` and
 * `specs/3d-pbr-wall-and-lighting`: hover affordances are gated on a fine
 * hover-capable pointer, the Studio photo grid stays scrollable on touch, the
 * page opts into safe-area insets without disabling zoom, the plaque asks iOS
 * for inline playback, and the Studio sortables use mouse + touch sensors.
 *
 * These assertions read source text the same way `cssBoundaryAudit` does: a
 * capability that is only expressed in CSS/TSX has no runtime unit to test.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

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

/** Split a selector list on top-level commas only (`:is(a, b)` stays whole). */
function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < prelude.length; index += 1) {
    const char = prelude[index];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(prelude.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(prelude.slice(start));
  return parts;
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
      for (const part of splitSelectors(prelude)) {
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

function declarations(body: string): string[] {
  return body
    .split(';')
    .map((declaration) => declaration.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter((declaration) => declaration.length > 0);
}

function declarationsFor(css: string, selector: string): string[] {
  return collectRules(css)
    .filter((rule) => rule.selector === selector)
    .flatMap((rule) => declarations(rule.body));
}

const isFineHoverPrelude = (prelude: string): boolean => {
  const lower = prelude.toLowerCase();
  return (
    lower.startsWith('@media') && /hover\s*:\s*hover/.test(lower) && /pointer\s*:\s*fine/.test(lower)
  );
};

const WALL_CSS = read('src/styles/wall.css');
const HUD_CSS = read('src/styles/hud.css');
const STUDIO_CSS = read('src/styles/studio.css');

describe('hover affordances are gated on a fine hover-capable pointer', () => {
  const cases = [
    { file: 'src/styles/wall.css', css: WALL_CSS, expected: 6 },
    { file: 'src/styles/hud.css', css: HUD_CSS, expected: 3 },
  ] as const;

  for (const { file, css, expected } of cases) {
    it(`${file} wraps every :hover rule in @media (hover: hover) and (pointer: fine)`, () => {
      const hoverRules = collectRules(css).filter((rule) => rule.selector.includes(':hover'));

      expect(hoverRules, `${file} should still own its hover affordances`).toHaveLength(expected);
      for (const rule of hoverRules) {
        expect(
          rule.preludes.some(isFineHoverPrelude),
          `${rule.selector} in ${file} is not inside @media (hover: hover) and (pointer: fine)`,
        ).toBe(true);
      }
    });
  }
});

describe('coarse-pointer mobile render profile lives under @media (pointer: coarse)', () => {
  const isCoarsePointerPrelude = (prelude: string): boolean => {
    const lower = prelude.toLowerCase();
    return lower.startsWith('@media') && /pointer\s*:\s*coarse/.test(lower);
  };

  const coarseRules = (css: string): StyleRule[] =>
    collectRules(css).filter((rule) => rule.preludes.some(isCoarsePointerPrelude));

  const rules = coarseRules(WALL_CSS);

  it('parses every @media (pointer: coarse) block in wall.css', () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((rule) => rule.selector.length > 0)).toBe(true);
  });

  it('hides .photo-paper-grain and clears the .photo-frame SVG feTurbulence mat background', () => {
    const grain = rules.filter((rule) => rule.selector.endsWith('.photo-paper-grain'));
    expect(grain.length, 'coarse .photo-paper-grain rule').toBeGreaterThan(0);
    expect(grain.some((rule) => declarations(rule.body).includes('display: none'))).toBe(true);

    const frames = rules.filter((rule) => rule.selector.endsWith('.photo-frame'));
    expect(frames.length, 'coarse .photo-frame rule').toBeGreaterThan(0);
    expect(frames.some((rule) => declarations(rule.body).includes('background-image: none'))).toBe(
      true,
    );
  });

  it('keeps the focused/overlay sheen normal-blended and never screen', () => {
    const sheenRules = rules.filter((rule) => rule.selector.includes('.photo-sheen'));
    expect(sheenRules.length).toBeGreaterThan(0);

    const normalSelectors = sheenRules
      .filter((rule) => declarations(rule.body).includes('mix-blend-mode: normal'))
      .map((rule) => rule.selector);
    expect(normalSelectors.some((selector) => selector.includes('.photo-frame.focused .photo-sheen'))).toBe(
      true,
    );
    expect(
      normalSelectors.some((selector) => selector.includes('.print-sharp-overlay .photo-sheen')),
    ).toBe(true);

    for (const rule of sheenRules) {
      expect(declarations(rule.body), rule.selector).not.toContain('mix-blend-mode: screen');
    }
  });

  it('flattens non-focused cells/frames with scale(1.0195) and keeps focused 3D', () => {
    const cell = rules.find((rule) => rule.selector.includes('.photo-cell:not(.is-focused-cell)'));
    expect(cell).toBeDefined();
    expect(declarations(cell!.body)).toEqual(
      expect.arrayContaining(['perspective: none', 'transform-style: flat']),
    );

    const frame = rules.find((rule) => rule.selector.endsWith('.photo-frame:not(.focused)'));
    expect(frame).toBeDefined();
    expect(declarations(frame!.body)).toEqual(
      expect.arrayContaining(['perspective: none', 'transform-style: flat', 'transform: scale(1.0195)']),
    );

    const focusedCell = rules.find((rule) => rule.selector.endsWith('.photo-cell.is-focused-cell'));
    expect(focusedCell).toBeDefined();
    expect(declarations(focusedCell!.body)).toEqual(
      expect.arrayContaining(['perspective: var(--perspective-px)', 'transform-style: preserve-3d']),
    );

    const focusedFrame = rules.find(
      (rule) =>
        rule.selector.endsWith('.photo-frame.focused') &&
        declarations(rule.body).includes('transform-style: preserve-3d'),
    );
    expect(focusedFrame).toBeDefined();
  });

  it('targets only .mat-acrylic for the static frosted placard override', () => {
    const acrylic = rules.filter((rule) => rule.selector.includes('.mat-acrylic'));
    expect(acrylic.length, 'coarse acrylic placard rule').toBeGreaterThan(0);
    expect(acrylic.some((rule) => declarations(rule.body).includes('backdrop-filter: none'))).toBe(
      true,
    );
    // The album and exhibition title placards share the same fallback.
    expect(
      acrylic.some((rule) => rule.selector.includes('exhibition-title-placard')),
      'coarse acrylic fallback should cover the exhibition title placard',
    ).toBe(true);

    const backdropRules = rules.filter((rule) =>
      declarations(rule.body).some((declaration) => declaration.startsWith('backdrop-filter')),
    );
    for (const rule of backdropRules) {
      expect(rule.selector, 'backdrop-filter must be material-scoped').toContain('.mat-acrylic');
    }

    // Brushed aluminum and foamcore must remain exactly as desktop renders them.
    expect(rules.some((rule) => rule.selector.includes('.mat-aluminum'))).toBe(false);
    expect(rules.some((rule) => rule.selector.includes('.mat-foamcore'))).toBe(false);
  });

  it('collapses shadows to one directional layer and preserves tilt offsets on focus', () => {
    const base = rules.find((rule) => rule.selector.endsWith('.photo-frame.is-lit'));
    expect(base).toBeDefined();
    const baseShadow = declarations(base!.body)
      .filter((declaration) => declaration.startsWith('box-shadow'))
      .join(' ');
    expect(baseShadow).toContain('var(--sx');
    expect(baseShadow).toContain('var(--sy');

    const focused = rules.find((rule) => rule.selector.includes('.photo-frame.is-lit.focused'));
    expect(focused).toBeDefined();
    const focusedShadow = declarations(focused!.body)
      .filter((declaration) => declaration.startsWith('box-shadow'))
      .join(' ');
    expect(focusedShadow).toContain('var(--tilt-sx');
    expect(focusedShadow).toContain('var(--tilt-sy');
  });

  it('emits is-focused-cell on the focused .photo-cell so the 3D context survives', () => {
    const source = read('src/components/wall/FramedPrint.tsx');
    expect(source).toContain("focused ? ' is-focused-cell' : ''");
    expect(source).toContain('photo-cell${focused');
  });

  it('adds no ungated :hover rule and no coarse touch-action: none', () => {
    expect(rules.filter((rule) => rule.selector.includes(':hover'))).toEqual([]);
    for (const rule of rules) {
      expect(declarations(rule.body), rule.selector).not.toContain('touch-action: none');
    }
  });
});

describe('Album Editor photo tiles stay scrollable on touch', () => {
  const selectors = [
    '.album-editor-photo-media',
    '.album-editor-photo.is-list-row .album-editor-photo-media',
  ];

  for (const selector of selectors) {
    it(`${selector} uses touch-action: manipulation without OS callouts`, () => {
      const declared = declarationsFor(STUDIO_CSS, selector);

      expect(declared, selector).toContain('touch-action: manipulation');
      expect(declared, selector).toContain('-webkit-touch-callout: none');
      expect(declared, selector).toContain('user-select: none');
      expect(declared, selector).not.toContain('touch-action: none');
    });
  }

  it('keeps touch-action: none only on the dedicated drag handle', () => {
    const owners = collectRules(STUDIO_CSS)
      .filter((rule) => declarations(rule.body).includes('touch-action: none'))
      .map((rule) => rule.selector);

    expect(owners).toEqual(['.studio-album-drag']);
  });
});

describe('viewport opts into safe-area insets without disabling zoom', () => {
  const source = read('src/app/layout.tsx');

  it('exports a viewport with viewport-fit=cover', () => {
    expect(source).toMatch(/export const viewport: Viewport = \{/);
    expect(source).toContain("width: 'device-width'");
    expect(source).toContain('initialScale: 1');
    expect(source).toContain("viewportFit: 'cover'");
  });

  it('never pins the page zoom', () => {
    // Prose in a comment may legitimately name the forbidden options, so the
    // negative assertions run against the code only.
    const code = stripComments(source);
    expect(code).not.toMatch(/userScalable/);
    expect(code).not.toMatch(/maximumScale/);
  });
});

describe('soundtrack plaque plays inline on iOS', () => {
  it('adds playsinline=1 to the public embed URL', () => {
    const source = read('src/components/wall/SoundtrackPlaque.tsx');
    const embedUrl = /youtube-nocookie\.com\/embed\/[^`]*/.exec(source);

    expect(embedUrl, 'the plaque should still mount a youtube-nocookie embed').not.toBeNull();
    expect(embedUrl?.[0]).toContain('playsinline=1');
  });
});

describe('Studio sortables use mouse and touch sensors', () => {
  const files = ['src/components/admin/CuratorStudio.tsx', 'src/components/admin/AlbumEditor.tsx'];

  for (const file of files) {
    it(`${file} reorders with MouseSensor + TouchSensor`, () => {
      const source = read(file);

      expect(source).toContain('MouseSensor');
      expect(source).toContain('TouchSensor');
      expect(source).not.toContain('PointerSensor');
      expect(source).toMatch(/useSensor\(MouseSensor, \{ activationConstraint: \{ distance: 4 \} \}\)/);
      expect(source).toMatch(
        /useSensor\(TouchSensor, \{ activationConstraint: \{ delay: 250, tolerance: 5 \} \}\)/,
      );
    });
  }
});
