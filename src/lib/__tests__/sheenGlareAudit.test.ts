/**
 * Static audit for the sheen-glare-tuning change.
 *
 * - `--sheen-strength` (0.8) scales every alpha stop of the `.photo-sheen`
 *   gradient on every pointer, so the glare is 80% as strong.
 * - `--sheen-anchor` positions the gradient centre; only `(pointer: coarse)`
 *   sets it (top-right), fine pointers keep the centred `50% 50%` fallback.
 *
 * Parses `wall.css` the same way `touchAudit.test.ts` does.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WALL_CSS = readFileSync(path.join(process.cwd(), 'src/styles/wall.css'), 'utf8');

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

const allRules = collectRules(WALL_CSS);

const isCoarsePointerPrelude = (prelude: string): boolean => {
  const lower = prelude.toLowerCase();
  return lower.startsWith('@media') && /pointer\s*:\s*coarse/.test(lower);
};

const declaresProperty = (rule: StyleRule, property: string): boolean =>
  declarations(rule.body).some((declaration) => declaration.startsWith(`${property}:`));

const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();

const baseSheenRule = allRules.find(
  (rule) => rule.selector === '.playground-wall-root .photo-sheen' && rule.preludes.length === 0,
);

const sheenBackground = (): string => {
  expect(baseSheenRule, 'base .playground-wall-root .photo-sheen rule').toBeDefined();
  const declaration = squash(baseSheenRule!.body)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('background:'));
  expect(declaration, 'base .photo-sheen background declaration').toBeDefined();
  return declaration!.slice('background:'.length).trim();
};

describe('Glare intensity is reduced to 80% on every pointer through a single strength multiplier', () => {
  it('declares --sheen-strength: 0.8 exactly once, on .playground-wall-root', () => {
    const declaring = allRules.filter((rule) => declaresProperty(rule, '--sheen-strength'));
    expect(declaring).toHaveLength(1);
    expect(declaring[0].selector).toBe('.playground-wall-root');
    expect(declaring[0].preludes).toEqual([]);
    expect(declarations(declaring[0].body)).toContain('--sheen-strength: 0.8');
  });

  it('scales both non-zero gradient alpha stops by --sheen-strength and keeps the outer stop at 0', () => {
    const background = sheenBackground();
    expect(background.startsWith('radial-gradient(')).toBe(true);
    expect(background).toContain('rgba(255, 255, 255, calc(0.38 * var(--sheen-strength))) 0%');
    expect(background).toContain('rgba(255, 253, 246, calc(0.14 * var(--sheen-strength))) 44%');
    expect(background).toContain('rgba(255, 253, 246, 0) 74%');
  });

  it('keeps the ellipse size and the rest opacity unchanged', () => {
    expect(sheenBackground()).toContain('ellipse 46% 42%');
    const root = allRules.filter((rule) => declaresProperty(rule, '--sheen-intensity'));
    expect(root).toHaveLength(1);
    expect(declarations(root[0].body)).toContain('--sheen-intensity: 0.44');
    expect(declarations(baseSheenRule!.body)).toContain('opacity: var(--sheen-intensity)');
    expect(declarations(baseSheenRule!.body)).toContain('mix-blend-mode: screen');
  });
});

describe('Coarse-pointer glare rests in the top-right corner of the photo', () => {
  it('positions the base gradient at var(--sheen-anchor, 50% 50%)', () => {
    expect(sheenBackground()).toContain('at var(--sheen-anchor, 50% 50%)');
  });

  it('sets --sheen-anchor: 65% 35% on the coarse rule shared by the focused and overlay sheens', () => {
    const shared = allRules.filter(
      (rule) =>
        rule.preludes.some(isCoarsePointerPrelude) &&
        declaresProperty(rule, '--sheen-anchor') &&
        rule.selector.includes('.photo-frame.focused .photo-sheen'),
    );
    expect(shared.length, 'coarse focused .photo-sheen anchor rule').toBeGreaterThan(0);

    const overlay = allRules.filter(
      (rule) =>
        rule.preludes.some(isCoarsePointerPrelude) &&
        declaresProperty(rule, '--sheen-anchor') &&
        rule.selector.includes('.print-sharp-overlay .photo-sheen'),
    );
    expect(overlay.length, 'coarse overlay .photo-sheen anchor rule').toBeGreaterThan(0);

    // Same declaration block: the selector list is split per selector by the
    // parser, so identical bodies prove they were declared together.
    expect(shared[0].body).toBe(overlay[0].body);
    expect(declarations(shared[0].body)).toContain('--sheen-anchor: 65% 35%');
    expect(declarations(shared[0].body)).toContain('mix-blend-mode: normal');
  });

  it('never declares --sheen-anchor outside a (pointer: coarse) block', () => {
    const outside = allRules.filter(
      (rule) =>
        declaresProperty(rule, '--sheen-anchor') && !rule.preludes.some(isCoarsePointerPrelude),
    );
    expect(outside.map((rule) => rule.selector)).toEqual([]);
  });
});

/**
 * `print-glare-tap-toggle`: tapping the focused print on a coarse pointer turns
 * the glare off through one coarse-gated rule that sets `background: none`
 * (no other declaration, so `--sheen-strength` stays declared exactly once). The frame sheen and
 * the `PrintSharpOverlay` sheen go transparent together without touching the
 * per-frame gyro writes or the overlay sync.
 */
describe('tap-to-toggle glare (print-glare-tap-toggle)', () => {
  const mentionsGlareToggle = (rule: StyleRule): boolean =>
    rule.selector.includes('data-glare') || rule.selector.includes('.glare-hint');

  /** The toggle rules in `css` that sit outside a `(pointer: coarse)` block. */
  const ungatedToggleRules = (css: string): string[] =>
    collectRules(css)
      .filter(mentionsGlareToggle)
      .filter((rule) => !rule.preludes.some(isCoarsePointerPrelude))
      .map((rule) => rule.selector);

  const offRules = (css: string): StyleRule[] =>
    collectRules(css).filter(
      (rule) =>
        rule.selector.includes("[data-glare='off']") && rule.selector.endsWith('.photo-sheen'),
    );

  it("has exactly one [data-glare='off'] .photo-sheen rule, inside (pointer: coarse)", () => {
    const rules = offRules(WALL_CSS);
    expect(rules).toHaveLength(1);
    expect(rules[0].preludes.some(isCoarsePointerPrelude)).toBe(true);
  });

  it('declares only background: none in that rule', () => {
    expect(declarations(offRules(WALL_CSS)[0].body)).toEqual(['background: none']);
  });

  it('keeps every glare-toggle and hint rule inside (pointer: coarse)', () => {
    expect(ungatedToggleRules(WALL_CSS)).toEqual([]);
    expect(
      collectRules(WALL_CSS).filter((rule) => rule.selector.includes('.glare-hint')).length,
    ).toBeGreaterThan(0);
  });

  it('keeps the single --sheen-strength declaration at 0.8', () => {
    const declared = allRules.filter((rule) => declaresProperty(rule, '--sheen-strength'));
    const withValue = declared.filter((rule) =>
      declarations(rule.body).includes('--sheen-strength: 0.8'),
    );
    expect(withValue).toHaveLength(1);
  });

  it('can fail: a rule moved out of the coarse block is detected', () => {
    const ungated = `.playground-wall-root [data-glare='off'] .photo-sheen { background: none; }`;
    const gated = `@media (pointer: coarse) { ${ungated} }`;
    expect(ungatedToggleRules(ungated)).toHaveLength(1);
    expect(ungatedToggleRules(gated)).toEqual([]);
    expect(offRules(ungated)[0].preludes.some(isCoarsePointerPrelude)).toBe(false);
  });
});
