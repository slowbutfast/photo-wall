/**
 * Static legibility audit for the Beveled Glass placard.
 *
 * Contract from `specs/3d-pbr-wall-and-lighting`: the `.mat-acrylic` placard
 * renders light glass ink on its dark smoked plate in every lighting mood, on
 * both pointer profiles. Its Alabaster plate has one unconditional rule, the
 * coarse profile never redefines the Alabaster background, every text line
 * clears the WCAG 4.5:1 floor, and the dead `[data-material]` rules stay gone.
 *
 * The wall's colours only exist in CSS and theme data, so the assertions read
 * source text the way `touchAudit.test.ts` does.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLAYGROUND_THEMES } from '../lighting/playgroundTheme';

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const WALL_CSS = read('src/styles/wall.css');
const ALBUM_PLACARD = read('src/components/wall/AlbumPlacard.tsx');

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

const isCoarsePointer = (rule: StyleRule): boolean =>
  rule.preludes.some(
    (prelude) => prelude.toLowerCase().startsWith('@media') && /pointer\s*:\s*coarse/.test(prelude.toLowerCase()),
  );

const isAlabasterAcrylic = (rule: StyleRule): boolean =>
  rule.selector.includes("data-mood='alabaster'") &&
  rule.selector.includes('.museum-placard.mat-acrylic');

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

type Rgb = [number, number, number];

const clamp = (value: number): number => Math.min(255, Math.max(0, value));

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    value.trim(),
  );
  if (!rgba) throw new Error(`Unsupported colour: ${value}`);
  return {
    r: Number(rgba[1]),
    g: Number(rgba[2]),
    b: Number(rgba[3]),
    a: rgba[4] === undefined ? 1 : Number(rgba[4]),
  };
}

/** The `rgba()` stops of a rule's `background` gradient, in source order. */
function backgroundStops(body: string): Rgba[] {
  const background = declarations(body).find((declaration) => declaration.startsWith('background:'));
  if (!background) throw new Error(`Rule has no background declaration: ${body}`);
  return [...background.matchAll(/rgba?\([^)]*\)/g)].map((match) => parseColour(match[0]));
}

const srgbChannel = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** Alpha-composite `foreground` over an opaque `background`. */
function composite({ r, g, b, a }: Rgba, background: Rgb): Rgb {
  return [
    clamp(a * r + (1 - a) * background[0]),
    clamp(a * g + (1 - a) * background[1]),
    clamp(a * b + (1 - a) * background[2]),
  ];
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text ink at an element opacity, then measured against its plate. */
function lineContrast(ink: Rgba, opacity: number, plate: Rgb): number {
  return contrastRatio(composite({ ...ink, a: ink.a * opacity }, plate), plate);
}

const rules = collectRules(WALL_CSS);
/** WCAG 2.x AA floor for small text. */
const CONTRAST_FLOOR = 4.5;

const titleRule = rules.filter(
  (rule) =>
    rule.selector === '.playground-wall-root .museum-placard.mat-acrylic .placard-title',
);
const capRule = rules.filter(
  (rule) =>
    rule.selector ===
    '.playground-wall-root .museum-placard.mat-acrylic .placard-meta',
);

describe('Alabaster Beveled Glass glass ink is light with no halo', () => {
  it('sets the Alabaster glass ink, cap and shadow in the theme data', () => {
    const alabaster = PLAYGROUND_THEMES.alabaster;

    expect(alabaster.glassInk).toBe('#F4F6F4');
    expect(alabaster.glassCap).toBe('rgba(240, 244, 241, 1)');
    expect(alabaster.glassShadow).toBe('none');
  });

  it('keeps the Chiaroscuro and Concrete glass values unchanged', () => {
    expect(PLAYGROUND_THEMES.chiaroscuro.glassInk).toBe('#F4F6F4');
    expect(PLAYGROUND_THEMES.chiaroscuro.glassCap).toBe('rgba(240, 244, 241, 0.90)');
    expect(PLAYGROUND_THEMES.chiaroscuro.glassShadow).toBe('0 3px 4px rgba(0, 0, 0, 0.52)');

    expect(PLAYGROUND_THEMES.concrete.glassInk).toBe('#F4F6F4');
    expect(PLAYGROUND_THEMES.concrete.glassCap).toBe('rgba(240, 244, 241, 0.92)');
    expect(PLAYGROUND_THEMES.concrete.glassShadow).toBe('0 2px 4px rgba(0, 0, 0, 0.48)');
  });

  it('keeps the acrylic text rules reading the theme glass variables', () => {
    expect(titleRule).toHaveLength(1);
    expect(declarations(titleRule[0].body)).toEqual(
      expect.arrayContaining(['color: var(--glass-ink, #f4f6f4)', 'text-shadow: var(--glass-text-shadow, 0 3px 4px rgba(0, 0, 0, 0.52))']),
    );

    expect(capRule).toHaveLength(1);
    expect(declarations(capRule[0].body)).toEqual(
      expect.arrayContaining(['color: var(--glass-cap, rgba(240, 244, 241, 0.9))']),
    );
  });
});

describe('one Alabaster plate is shared by desktop and phone', () => {
  const alabasterPlate = rules.filter((rule) => !isCoarsePointer(rule) && isAlabasterAcrylic(rule));

  it('has exactly one unconditional Alabaster acrylic background rule with the 0.78/0.74/0.78 stops', () => {
    expect(alabasterPlate.length).toBeGreaterThan(0);

    const bodies = [...new Set(alabasterPlate.map((rule) => rule.body.trim()))];
    expect(bodies, 'the dual selector must be one rule, not two drifted copies').toHaveLength(1);

    expect(alabasterPlate.map((rule) => rule.selector)).toEqual(
      expect.arrayContaining([
        "[data-mood='alabaster'] .playground-wall-root .museum-placard.mat-acrylic",
        ".playground-wall-root[data-mood='alabaster'] .museum-placard.mat-acrylic",
      ]),
    );

    const declared = declarations(bodies[0]);
    expect(declared[0]).toMatch(/^background: linear-gradient\(/);
    expect(declared.every((declaration) => declaration.startsWith('background'))).toBe(true);

    const stops = backgroundStops(bodies[0]);
    expect(stops.map((stop) => stop.a)).toEqual([0.78, 0.74, 0.78]);
    expect(stops.map(({ r, g, b }) => [r, g, b])).toEqual([
      [30, 36, 33],
      [22, 27, 24],
      [34, 40, 36],
    ]);
  });

  it('never redefines the Alabaster plate inside @media (pointer: coarse)', () => {
    expect(rules.filter((rule) => isCoarsePointer(rule) && isAlabasterAcrylic(rule))).toEqual([]);
  });

  it('keeps the coarse generic acrylic rule static', () => {
    const coarseGeneric = rules.filter(
      (rule) =>
        isCoarsePointer(rule) &&
        rule.selector === '.playground-wall-root .museum-placard.mat-acrylic',
    );

    expect(coarseGeneric.length).toBeGreaterThan(0);
    expect(
      coarseGeneric.some((rule) => declarations(rule.body).includes('backdrop-filter: none')),
    ).toBe(true);
  });
});

describe('every Beveled Glass text line clears 4.5:1 in every mood', () => {
  const desktopBase = rules.find(
    (rule) =>
      !isCoarsePointer(rule) &&
      rule.selector === '.playground-wall-root .museum-placard.mat-acrylic',
  );
  const alabasterPlate = rules.find((rule) => !isCoarsePointer(rule) && isAlabasterAcrylic(rule));
  const coarseConcrete = rules.find(
    (rule) =>
      isCoarsePointer(rule) &&
      rule.selector.includes("data-mood='concrete'") &&
      rule.selector.includes('.museum-placard.mat-acrylic'),
  );

  const wallBase = (mood: keyof typeof PLAYGROUND_THEMES): Rgb => {
    const { r, g, b } = parseColour(PLAYGROUND_THEMES[mood].wallBase);
    return [r, g, b];
  };

  const plateStops = (mood: keyof typeof PLAYGROUND_THEMES): Rgba[][] => {
    if (mood === 'alabaster') return [backgroundStops(alabasterPlate!.body)];
    const plates = [backgroundStops(desktopBase!.body)];
    if (mood === 'concrete' && coarseConcrete) plates.push(backgroundStops(coarseConcrete.body));
    return plates;
  };

  const opacityFor = (selector: string): number => {
    const declared = declarationsFor(WALL_CSS, selector);
    const opacity = declared.find((declaration) => declaration.startsWith('opacity:'));
    expect(opacity, `${selector} must declare its rendered opacity`).toBeDefined();
    return Number(opacity!.split(':')[1].trim());
  };

  it('parses the rendered line opacities from wall.css', () => {
    expect(opacityFor('.playground-wall-root .placard-meta')).toBeCloseTo(0.72, 5);
    expect(opacityFor('.playground-wall-root .placard-track-name')).toBeCloseTo(0.92, 5);
    expect(opacityFor('.playground-wall-root .placard-timecode')).toBeCloseTo(0.72, 5);
  });

  it('measures title, caption, track name, meta and timecode against every plate stop', () => {
    const metaOpacity = opacityFor('.playground-wall-root .placard-meta');
    const trackOpacity = opacityFor('.playground-wall-root .placard-track-name');
    const timecodeOpacity = opacityFor('.playground-wall-root .placard-timecode');

    for (const mood of ['chiaroscuro', 'concrete', 'alabaster'] as const) {
      const theme = PLAYGROUND_THEMES[mood];
      const ink = parseColour(theme.glassInk);
      const cap = parseColour(theme.glassCap);
      const wall = wallBase(mood);

      const lines = [
        { name: 'title', ink, opacity: 1 },
        { name: 'caption', ink: cap, opacity: 1 },
        { name: 'track name', ink: cap, opacity: trackOpacity },
        { name: 'meta', ink: cap, opacity: metaOpacity },
        { name: 'timecode', ink: cap, opacity: timecodeOpacity },
      ];

      for (const stops of plateStops(mood)) {
        for (const stop of stops) {
          const plate = composite(stop, wall);
          for (const line of lines) {
            const ratio = lineContrast(line.ink, line.opacity, plate);

            expect(
              ratio,
              `${mood} ${line.name} over rgba(${stop.r}, ${stop.g}, ${stop.b}, ${stop.a})`,
            ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
          }
        }
      }
    }
  });

  it('can fail: the pre-change Alabaster ink and coarse plate measure below 4.5', () => {
    const oldInk = parseColour('#1D1E1C');
    const oldCoarsePlate: Rgba[] = [
      { r: 30, g: 36, b: 33, a: 0.78 },
      { r: 22, g: 27, b: 24, a: 0.7 },
      { r: 34, g: 40, b: 36, a: 0.78 },
    ];
    const wall = wallBase('alabaster');

    for (const stop of oldCoarsePlate) {
      const ratio = lineContrast(oldInk, 1, composite(stop, wall));
      expect(ratio).toBeLessThan(CONTRAST_FLOOR);
    }
  });
});

describe('dead material selectors are gone and the soundtrack footer is kept', () => {
  it('contains no [data-material selector in wall.css', () => {
    expect(WALL_CSS).not.toContain('[data-material');
  });

  it('keeps the soundtrack divider, track line and timecode', () => {
    expect(declarationsFor(WALL_CSS, '.playground-wall-root .placard-soundtrack')).toEqual(
      expect.arrayContaining([expect.stringMatching(/^border-top:/)]),
    );

    expect(ALBUM_PLACARD).toContain('placard-track-name');
    expect(ALBUM_PLACARD).toContain('placard-timecode');
  });
});
