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
    { file: 'src/styles/wall.css', css: WALL_CSS, expected: 4 },
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
