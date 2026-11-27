/**
 * Macro mosaic palette drift guard (`macro-lod-continuity`, architecture D4).
 *
 * The macro mosaic is a canvas, so it cannot read CSS custom properties or the
 * live `.museum-placard.md-*` background. Its plate colours are therefore
 * *mirrored* into `PlaygroundTheme.macroPlate` and into the fixed material
 * table in `macroMosaic.ts`. This audit parses `wall.css` the same way
 * `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` do and fails when a
 * mirror drifts, so a CSS retune cannot silently leave Overview a different
 * colour from Album tier.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveMacroMosaicPalette } from '@/components/wall/macroMosaic';
import { PLAYGROUND_THEMES } from '@/lib/lighting/playgroundTheme';

const ROOT = process.cwd();

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

const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim();

const RULES = collectRules(readFileSync(path.join(ROOT, 'src/styles/wall.css'), 'utf8'));

const isAcrylicPlate = (rule: StyleRule): boolean =>
  rule.selector.includes('.mat-acrylic') && /linear-gradient/.test(rule.body);

const isCoarse = (rule: StyleRule): boolean =>
  rule.preludes.some((prelude) => /pointer: coarse/.test(prelude));

const hasMood = (rule: StyleRule, mood: string): boolean =>
  new RegExp(`data-mood=['"]${mood}['"]`).test(rule.selector);

const declaresMood = (rule: StyleRule): boolean => /data-mood=/.test(rule.selector);

/**
 * The four acrylic plate rules, each identified by its pointer profile and
 * mood, exactly as `design.md` §2 cites them.
 */
const ACRYLIC_RULES = {
  /** Base `.mat-acrylic` (fine pointer, no mood override). */
  fine: RULES.filter((rule) => isAcrylicPlate(rule) && !isCoarse(rule) && !declaresMood(rule)),
  /** `[data-mood='alabaster'] … .mat-acrylic`. */
  alabaster: RULES.filter(
    (rule) => isAcrylicPlate(rule) && !isCoarse(rule) && hasMood(rule, 'alabaster'),
  ),
  /** Coarse `.mat-acrylic`, no mood override. */
  coarse: RULES.filter((rule) => isAcrylicPlate(rule) && isCoarse(rule) && !declaresMood(rule)),
  /** Coarse `[data-mood='concrete'] … .mat-acrylic`. */
  coarseConcrete: RULES.filter(
    (rule) => isAcrylicPlate(rule) && isCoarse(rule) && hasMood(rule, 'concrete'),
  ),
};

/** True when one rule in `rules` declares all `stops`, in order. */
function stopsAppearIn(rules: readonly StyleRule[], stops: readonly string[]): boolean {
  const wanted = stops.map(normalise);
  return rules.some((rule) => {
    const body = normalise(rule.body);
    let cursor = -1;
    for (const stop of wanted) {
      const at = body.indexOf(stop, cursor + 1);
      if (at < 0) return false;
      cursor = at;
    }
    return true;
  });
}

function ruleContaining(fragment: string): StyleRule[] {
  return RULES.filter((rule) => normalise(rule.body).includes(normalise(fragment)));
}

describe('acrylic plate mirrors wall.css', () => {
  it('finds all four acrylic plate rules', () => {
    for (const [name, rules] of Object.entries(ACRYLIC_RULES)) {
      expect(rules.length, `${name} plate rule`).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.selector.includes(':is(.museum-placard, .exhibition-title-placard)')).toBe(true);
      }
    }
  });

  it('matches the base fine-pointer gradient for chiaroscuro and concrete', () => {
    // design.md §2: concrete's fine stops are chiaroscuro's.
    expect(PLAYGROUND_THEMES.concrete.macroPlate.fine).toEqual(
      PLAYGROUND_THEMES.chiaroscuro.macroPlate.fine,
    );
    expect(stopsAppearIn(ACRYLIC_RULES.fine, PLAYGROUND_THEMES.chiaroscuro.macroPlate.fine)).toBe(
      true,
    );
    expect(stopsAppearIn(ACRYLIC_RULES.fine, PLAYGROUND_THEMES.concrete.macroPlate.fine)).toBe(true);
  });

  it('matches the alabaster gradient on both pointer profiles', () => {
    expect(PLAYGROUND_THEMES.alabaster.macroPlate.coarse).toEqual(
      PLAYGROUND_THEMES.alabaster.macroPlate.fine,
    );
    expect(
      stopsAppearIn(ACRYLIC_RULES.alabaster, PLAYGROUND_THEMES.alabaster.macroPlate.fine),
    ).toBe(true);
  });

  it('matches the coarse gradients for chiaroscuro and concrete', () => {
    expect(stopsAppearIn(ACRYLIC_RULES.coarse, PLAYGROUND_THEMES.chiaroscuro.macroPlate.coarse)).toBe(
      true,
    );
    expect(
      stopsAppearIn(ACRYLIC_RULES.coarseConcrete, PLAYGROUND_THEMES.concrete.macroPlate.coarse),
    ).toBe(true);
  });

  it('reads its stops out of a 138deg linear-gradient at 0 / 55 / 100%', () => {
    for (const stops of [
      PLAYGROUND_THEMES.chiaroscuro.macroPlate.fine,
      PLAYGROUND_THEMES.alabaster.macroPlate.fine,
    ]) {
      const body = normalise(
        [...ACRYLIC_RULES.fine, ...ACRYLIC_RULES.alabaster]
          .map((rule) => rule.body)
          .find((candidate) => normalise(candidate).includes(normalise(stops[0]))) ?? '',
      );
      expect(body).toContain('138deg');
      expect(body).toContain('0%');
      expect(body).toContain('55%');
      expect(body).toContain('100%');
    }
  });

  it('can fail: a mutated stop is rejected', () => {
    const mutated = [...PLAYGROUND_THEMES.chiaroscuro.macroPlate.fine];
    mutated[1] = 'rgba(18, 22, 20, 0.47)';
    expect(stopsAppearIn(ACRYLIC_RULES.fine, mutated)).toBe(false);
    // And the un-mutated list still matches, so the matcher is not degenerate.
    expect(stopsAppearIn(ACRYLIC_RULES.fine, PLAYGROUND_THEMES.chiaroscuro.macroPlate.fine)).toBe(
      true,
    );
  });
});

describe('fixed material plates mirror wall.css', () => {
  it('mirrors the aluminum 42% stop and the foamcore base colour', () => {
    expect(ruleContaining('#d2d5d9').some((rule) => rule.selector.includes('.mat-aluminum'))).toBe(
      true,
    );
    expect(
      ruleContaining('background-color: #161616').some((rule) =>
        rule.selector.includes('.mat-foamcore'),
      ),
    ).toBe(true);
  });

  it('resolves those same colours for the mosaic palette', () => {
    const aluminum = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'aluminum', false);
    expect(aluminum.plate).toEqual({ kind: 'solid', color: '#d2d5d9' });
    const foamcore = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'foamcore', false);
    expect(foamcore.plate).toEqual({ kind: 'solid', color: '#161616' });
  });

  it('mirrors the soundtrack plaque base and border', () => {
    expect(ruleContaining('background: var(--color-placard-core)').some((rule) => rule.selector.includes('.soundtrack-plaque'))).toBe(true);
    expect(ruleContaining('border: 1px solid rgba(255, 255, 255, 0.08)').some((rule) => rule.selector.includes('.soundtrack-plaque'))).toBe(true);
    const palette = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'acrylic', true);
    expect(palette.slot).toEqual({ fill: '#161616', stroke: 'rgba(255, 255, 255, 0.08)' });
  });
});

describe('palette key', () => {
  it('shares a key for moods with identical output and splits for a mood that differs', () => {
    const chiaroscuro = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    const concrete = resolveMacroMosaicPalette(PLAYGROUND_THEMES.concrete, 'acrylic', false);
    const alabaster = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'acrylic', false);

    expect(concrete.key).toBe(chiaroscuro.key);
    expect(alabaster.key).not.toBe(chiaroscuro.key);
  });

  it('splits when the pointer profile changes', () => {
    const fine = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    const coarse = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', true);
    expect(coarse.key).not.toBe(fine.key);
  });

  it('splits when the material changes and ignores mood for the fixed fills', () => {
    const acrylic = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    const aluminum = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'aluminum', false);
    expect(aluminum.key).not.toBe(acrylic.key);
    expect(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'aluminum', true).key,
    ).toBe(aluminum.key);
  });

  it('is a stable, colour-only string', () => {
    const palette = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    expect(palette.key).toBe(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false).key,
    );
    // No mood, material or pointer names leak into the cache key.
    for (const token of ['chiaroscuro', 'alabaster', 'acrylic', 'coarse', 'fine']) {
      expect(palette.key).not.toContain(token);
    }
  });
});
