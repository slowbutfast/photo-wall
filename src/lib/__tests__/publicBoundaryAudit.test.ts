import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(process.cwd(), 'src');
const PUBLIC_ROOT = path.join(SRC, 'app', '(gallery)');
const ADMIN_COMPONENTS = path.join(SRC, 'components', 'admin') + path.sep;

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(process.cwd(), file).split(path.sep).join('/');
const isCode = (file: string) => CODE_EXTENSIONS.some((extension) => file.endsWith(extension));

/** Strip block and full-line `//` comments so JSDoc paths never count as imports. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

/** Resolve a public-module import to a source file, or null for packages/CSS. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...CODE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...CODE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

interface AuditResult {
  visited: string[];
  adminImports: string[];
  adminApiLiterals: string[];
}

function audit(root: string): AuditResult {
  const visited = new Set<string>();
  const adminImports: string[] = [];
  const adminApiLiterals: string[] = [];
  const queue = walk(root).filter(isCode);

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    if (file.startsWith(ADMIN_COMPONENTS) || importSpecifiers(source).some((specifier) => specifier.startsWith('@/components/admin'))) {
      adminImports.push(rel(file));
    }
    if (stripComments(source).includes('/api/admin')) {
      adminApiLiterals.push(rel(file));
    }

    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return {
    visited: [...visited].map(rel),
    adminImports: [...new Set(adminImports)],
    adminApiLiterals: [...new Set(adminApiLiterals)],
  };
}

describe('public gallery import boundary', () => {
  it('audits the public route group and reaches a non-trivial module graph', () => {
    expect(existsSync(PUBLIC_ROOT)).toBe(true);
    const { visited } = audit(PUBLIC_ROOT);
    expect(visited).toContain('src/app/(gallery)/page.tsx');
    expect(visited.length).toBeGreaterThan(10);
  });

  it('never transitively imports @/components/admin/*', () => {
    const { adminImports } = audit(PUBLIC_ROOT);
    expect(adminImports).toEqual([]);
  });

  it('never references /api/admin in any public module', () => {
    const { adminApiLiterals } = audit(PUBLIC_ROOT);
    expect(adminApiLiterals).toEqual([]);
  });
});
