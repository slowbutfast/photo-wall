// @vitest-environment jsdom

/**
 * Committed-tier ownership (`GalleryCanvas.tsx`, architecture D2).
 *
 * The camera rAF loop and the React render path both need a zoom tier, and they
 * must never disagree. The loop is the single writer: it reads the committed
 * tier, computes the next one and stores it. The render path only reads it as
 * `previous`, so a StrictMode replay or a discarded render can't move the
 * boundary, and a non-camera render agrees with the last frame the loop ran.
 *
 * Without that shared `previous`, the render path would use today's single
 * `scale < 0.25` threshold and drop an island to `macro` inside the hysteresis
 * band while the camera holds it detailed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitZoomTier } from '../GalleryCanvas';
import { resolveZoomTier, type ZoomTier } from '../zoomTier';

type TierRef = { current: ZoomTier | undefined };

/** A ref that records every write, so "read-only" is observable. */
function spyRef(initial: ZoomTier | undefined): { ref: TierRef; writes: Array<ZoomTier | undefined> } {
  const writes: Array<ZoomTier | undefined> = [];
  let value = initial;
  const ref: TierRef = {
    get current() {
      return value;
    },
    set current(next: ZoomTier | undefined) {
      writes.push(next);
      value = next;
    },
  };
  return { ref, writes };
}

function readSource(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** Argument text of every `name(` call, with balanced parens. */
function callArguments(source: string, name: string): Array<{ args: string; at: number }> {
  const calls: Array<{ args: string; at: number }> = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at < 0) break;
    let depth = 1;
    let index = at + needle.length;
    let args = '';
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      if (depth > 0) args += char;
      index += 1;
    }
    calls.push({ args, at });
    from = index;
  }
  return calls;
}

/** Split a call's argument text on top-level commas only. */
function splitArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of args) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

describe('commitZoomTier', () => {
  it('computes from the committed tier and writes it back', () => {
    const first = spyRef(undefined);
    expect(commitZoomTier(first.ref, 0.2, false)).toBe('macro');
    expect(first.writes).toEqual(['macro']);
    expect(first.ref.current).toBe('macro');

    const promoting = spyRef('macro');
    // Inside the band with `previous = 'macro'`: still macro.
    expect(commitZoomTier(promoting.ref, 0.23, false)).toBe('macro');
    expect(promoting.ref.current).toBe('macro');
    expect(commitZoomTier(promoting.ref, 0.251, false)).toBe('album');
    expect(promoting.ref.current).toBe('album');
  });

  it('holds a detail tier down to the demote edge', () => {
    const { ref } = spyRef('album');
    expect(commitZoomTier(ref, 0.24, false)).toBe('album');
    expect(commitZoomTier(ref, 0.221, false)).toBe('album');
    expect(commitZoomTier(ref, 0.219, false)).toBe('macro');
  });

  it('keeps the album/print decision on focus alone', () => {
    const { ref } = spyRef('album');
    expect(commitZoomTier(ref, 1.2, false)).toBe('album');
    expect(commitZoomTier(ref, 1.2, true)).toBe('print');
    expect(commitZoomTier(ref, 0.1, true)).toBe('macro');
  });

  it('lets a second read-only call return the same tier without writing', () => {
    const { ref, writes } = spyRef(undefined);
    const committed = commitZoomTier(ref, 0.23, false);
    expect(writes).toEqual(['macro']);

    // The render path re-derives from the committed tier, adding no write.
    for (const scale of [0.23, 0.225, 0.249]) {
      expect(resolveZoomTier(scale, false, ref.current)).toBe(committed);
    }
    expect(writes).toEqual(['macro']);
    expect(ref.current).toBe(committed);

    // And it is still read-only after the island has promoted.
    commitZoomTier(ref, 0.251, false);
    expect(writes).toEqual(['macro', 'album']);
    expect(writes).toHaveLength(2);
    expect(resolveZoomTier(0.23, false, ref.current)).toBe('album');
    expect(writes).toHaveLength(2);
  });
});

describe('GalleryCanvas tier call-site audit', () => {
  const source = readSource('src/components/wall/GalleryCanvas.tsx');
  const helperAt = source.indexOf('export function commitZoomTier(');
  const renderAt = source.indexOf('const tier: ZoomTier = ');
  const calls = callArguments(source, 'resolveZoomTier');

  it('declares the helper and the render-path call in module order', () => {
    // The audit below relies on this layout: helper first, component second.
    expect(helperAt).toBeGreaterThan(0);
    expect(renderAt).toBeGreaterThan(helperAt);
  });

  it('passes three arguments to resolveZoomTier at every call site', () => {
    // Commit helper + render path. The rAF loop calls the helper.
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(splitArguments(call.args)).toHaveLength(3);
    }
    // Both build on the committed tier: the render path reads the ref
    // directly, the helper reads through its own ref parameter.
    expect(calls.map((call) => splitArguments(call.args)[2])).toEqual([
      'ref.current',
      'committedTierRef.current',
    ]);
  });

  it('keeps the render path read-only, deriving from the committed tier', () => {
    const renderCall = calls.find((call) => call.at > renderAt);
    expect(renderCall).toBeDefined();
    // `scale` (the settled snapshot) not `cssScale` (the live camera).
    const args = splitArguments(renderCall!.args);
    expect(args[0]).toBe('scale');
    expect(args[2]).toBe('committedTierRef.current');
    expect(source.slice(renderAt, renderCall!.at + renderCall!.args.length)).not.toContain(
      'committedTierRef.current =',
    );
  });

  it('writes the committed tier from inside the camera rAF callback only', () => {
    const frameStart = source.indexOf('requestAnimationFrame(function frame(now)');
    const snapshotKeyAt = source.indexOf('const snapshotKey = buildSnapshotKey(');
    expect(frameStart).toBeGreaterThan(0);
    expect(snapshotKeyAt).toBeGreaterThan(frameStart);

    // Exclude the helper's own declaration; only calls are runtime writers.
    const declarationAt = source.indexOf('commitZoomTier(', helperAt);
    const commits = callArguments(source, 'commitZoomTier').filter(
      (call) => call.at !== declarationAt,
    );
    expect(commits).toHaveLength(1);
    expect(commits[0].at).toBeGreaterThan(frameStart);
    expect(commits[0].at).toBeLessThan(snapshotKeyAt);

    // A literal ref write outside the helper would be a second writer.
    const literalWrites = source.match(/committedTierRef\.current\s*=(?!=)/g) ?? [];
    expect(literalWrites).toHaveLength(0);
  });

  it('only declares the ref once and never seeds it with a stale tier', () => {
    const declarations = source.match(/committedTierRef\s*=\s*useRef/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(source).toContain('useRef<ZoomTier | undefined>(undefined)');
  });
});
