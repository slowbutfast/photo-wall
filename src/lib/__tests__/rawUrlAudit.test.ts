import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(process.cwd(), file).split(path.sep).join('/');
const isTest = (file: string) => /__tests__|\.test\.[tj]sx?$/.test(file);

/** Strip block and full-line/trailing `//` comments (JSDoc mentions `/api/wall`). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const SCANNED_ROOTS = ['app', 'components', 'store', 'lib/dev'].map((dir) => path.join(SRC, dir));
const API_ROUTES = path.join(SRC, 'app', 'api') + path.sep;

const scannedFiles = SCANNED_ROOTS.flatMap((root) => walk(root)).filter(
  (file) => /\.tsx?$/.test(file) && !isTest(file) && !file.startsWith(API_ROUTES),
);

/** A quote/backtick immediately followed by a root-relative app path. */
const RAW_URL = /(['"`])\/(?:api|textures|demo|fonts)(?=[/?$'"`#]|\$\{)/g;

describe('raw root-relative URL audit', () => {
  it('scans a non-trivial set of files', () => {
    expect(scannedFiles.length).toBeGreaterThan(10);
  });

  it('has no unwrapped /api/, /textures/, /demo or /fonts/ literals in client modules', () => {
    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const match of code.matchAll(RAW_URL)) {
        const before = code.slice(0, match.index);
        if (/withBase\(\s*$/.test(before)) continue;
        const line = before.split('\n').length;
        offenders.push(`${rel(file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no '/photos' literal outside src/lib/basePath.ts", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.tsx?$/.test(file) || isTest(file)) continue;
      if (rel(file) === 'src/lib/basePath.ts') continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/['"`]\/photos['"`/?]/.test(code)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it('globals.css has no absolute /fonts/ url()', () => {
    const css = stripComments(readFileSync(path.join(SRC, 'app', 'globals.css'), 'utf8'));
    expect(css).not.toMatch(/url\(\s*['"]?\/fonts\//);
    expect(css).toMatch(/url\(\s*['"]?\.\/fonts\//);
  });
});
