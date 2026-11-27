import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const STYLESHEETS = {
  'src/app/globals.css': path.join(SRC, 'app', 'globals.css'),
  'src/styles/tokens.css': path.join(SRC, 'styles', 'tokens.css'),
  'src/styles/wall.css': path.join(SRC, 'styles', 'wall.css'),
  'src/styles/hud.css': path.join(SRC, 'styles', 'hud.css'),
  'src/styles/studio.css': path.join(SRC, 'styles', 'studio.css'),
} as const;

const read = (file: string) => readFileSync(file, 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
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

function normalizeSelector(selector: string): string {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~,])\s*/g, '$1')
    .trim();
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

/**
 * Extracts every style-rule selector (top-level and inside `@media` /
 * `@supports`), ignoring `@font-face`, `@keyframes`, `@import` and custom
 * properties. Grouped selectors are split on commas so duplicates are caught
 * individually.
 */
export function extractSelectors(source: string): string[] {
  const css = stripComments(source);
  const selectors: string[] = [];
  let index = 0;
  let buffer = '';
  const groupDepth: string[] = [];

  while (index < css.length) {
    const char = css[index];
    if (char === '"' || char === "'") {
      const end = skipString(css, index);
      buffer += css.slice(index, end);
      index = end;
      continue;
    }
    if (char === '{') {
      const prelude = buffer.trim();
      buffer = '';
      if (prelude.startsWith('@')) {
        const atRule = /^@([a-zA-Z-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? '';
        if (['media', 'supports', 'container', 'layer', 'scope'].includes(atRule)) {
          groupDepth.push(prelude);
          index += 1;
          continue;
        }
        index = skipBlock(css, index);
        continue;
      }
      for (const part of splitSelectors(prelude)) {
        const selector = normalizeSelector(part);
        if (selector) selectors.push(selector);
      }
      index = skipBlock(css, index);
      continue;
    }
    if (char === '}') {
      groupDepth.pop();
      buffer = '';
      index += 1;
      continue;
    }
    if (char === ';' && groupDepth.length === 0) {
      buffer = '';
      index += 1;
      continue;
    }
    buffer += char;
    index += 1;
  }
  return selectors;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

function forbiddenMatches(css: string, needles: readonly string[]): string[] {
  const stripped = stripComments(css);
  return needles.filter((needle) => new RegExp(`(^|[^a-zA-Z0-9_-])\\${needle}`).test(stripped));
}

describe('CSS domain boundaries', () => {
  it('creates the four modular stylesheets', () => {
    for (const file of Object.keys(STYLESHEETS).filter((name) => name.startsWith('src/styles/'))) {
      expect(existsSync(path.join(ROOT, file)), `${file} should exist`).toBe(true);
    }
  });

  it('deletes the legacy playground stylesheet', () => {
    expect(existsSync(path.join(SRC, 'app', 'playground-wall.css'))).toBe(false);
  });

  it('keeps globals.css free of HUD, focus, admin, soundtrack-overlay and gallery-canvas rules', () => {
    const css = read(STYLESHEETS['src/app/globals.css']);
    expect(forbiddenMatches(css, ['.hud-', '.photo-focus-', '.admin-', '.soundtrack-overlay', '.gallery-canvas'])).toEqual([]);
  });

  it('keeps wall.css free of HUD and admin rules', () => {
    const css = read(STYLESHEETS['src/styles/wall.css']);
    expect(forbiddenMatches(css, ['.hud-', '.admin-'])).toEqual([]);
  });

  it('keeps hud.css free of admin rules', () => {
    const css = read(STYLESHEETS['src/styles/hud.css']);
    expect(forbiddenMatches(css, ['.admin-'])).toEqual([]);
  });

  it('imports studio.css exclusively inside src/app/admin', () => {
    const importers = walk(SRC)
      .filter((file) => /\.(?:tsx?|css)$/.test(file))
      .filter((file) => !/__tests__|\.test\.[tj]sx?$/.test(file))
      .filter((file) => /studio\.css/.test(stripComments(read(file))));
    expect(importers.map(rel)).toEqual(
      expect.arrayContaining(['src/app/admin/layout.tsx']),
    );
    for (const file of importers) {
      expect(rel(file).startsWith('src/app/admin/'), `${rel(file)} must be admin-only`).toBe(true);
    }
  });

  it('keeps one owner for every normalized top-level selector', () => {
    const owners = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [name, file] of Object.entries(STYLESHEETS)) {
      if (!existsSync(file)) continue;
      for (const selector of extractSelectors(read(file))) {
        const previous = owners.get(selector);
        if (previous && previous !== name) {
          duplicates.push(`${selector} in ${previous} and ${name}`);
        } else if (!previous) {
          owners.set(selector, name);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('documents the live architecture without stale R3F or AdminDrawer references', () => {
    const design = read(path.join(ROOT, 'DESIGN.md'));
    for (const stale of ['troika-three-text', 'matrix3d', 'AdminDrawer']) {
      expect(design.includes(stale), `DESIGN.md still mentions ${stale}`).toBe(false);
    }
    for (const live of ['tokens.css', 'wall.css', 'hud.css', 'studio.css', 'WebGL2']) {
      expect(design.includes(live), `DESIGN.md should mention ${live}`).toBe(true);
    }
  });
});
