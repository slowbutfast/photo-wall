/**
 * Pure order / conflict-merge helpers for the Curator Studio Album Editor
 * (`src/components/admin/photoOrderState.ts`).
 *
 * Contract from `openspec/changes/album-photo-management`:
 * - immutable list moves for drag-and-drop and the `⤒` / `←` / `→` / `⤓` bar;
 * - `mergeStaleOrder` preserves the curator's relative arrangement for
 *   surviving prints, drops concurrently deleted ones, appends newly uploaded
 *   prints at the end, and never duplicates an id;
 * - `<input type="date">` + `<input type="time">` round-trip through the single
 *   `albums.dateLabel` column with zero DB migration.
 */

import { describe, expect, it } from 'vitest';

import {
  formatCombinedDateLabel,
  isOrderDirty,
  mergeStaleOrder,
  moveItem,
  moveToFirst,
  moveToLast,
  parseCombinedDateLabel,
} from '../photoOrderState';

const IDS = ['a', 'b', 'c', 'd'];

describe('moveItem', () => {
  it('moves an item forward and backwards without mutating the source', () => {
    const source = [...IDS];

    expect(moveItem(source, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(source, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(source).toEqual(IDS);
  });

  it('returns an equivalent copy for no-op and out-of-range indices', () => {
    expect(moveItem(IDS, 1, 1)).toEqual(IDS);
    expect(moveItem(IDS, -1, 2)).toEqual(IDS);
    expect(moveItem(IDS, 2, 99)).toEqual(IDS);
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});

describe('moveToFirst / moveToLast', () => {
  it('moves the item to the head or tail immutably', () => {
    expect(moveToFirst(IDS, 2)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveToLast(IDS, 1)).toEqual(['a', 'c', 'd', 'b']);
    expect(IDS).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is a no-op for out-of-range indices', () => {
    expect(moveToFirst(IDS, -1)).toEqual(IDS);
    expect(moveToLast(IDS, 42)).toEqual(IDS);
  });
});

describe('isOrderDirty', () => {
  it('compares the current order against the saved baseline', () => {
    expect(isOrderDirty(IDS, IDS)).toBe(false);
    expect(isOrderDirty(['b', 'a', 'c', 'd'], IDS)).toBe(true);
    expect(isOrderDirty(['a', 'b', 'c'], IDS)).toBe(true);
    expect(isOrderDirty([], [])).toBe(false);
  });
});

describe('mergeStaleOrder', () => {
  it("keeps the curator's relative arrangement when the server set is unchanged", () => {
    expect(mergeStaleOrder(['b', 'd', 'a', 'c'], IDS)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('appends a concurrently uploaded print at the end', () => {
    expect(mergeStaleOrder(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops a concurrently deleted print without disturbing the rest', () => {
    expect(mergeStaleOrder(['b', 'a', 'c'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('drops duplicates and unknown ids while preserving first-seen order', () => {
    expect(mergeStaleOrder(['b', 'b', 'x', 'a', 'b'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('returns the server order when the draft is empty', () => {
    expect(mergeStaleOrder([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(mergeStaleOrder([], [])).toEqual([]);
  });
});

describe('formatCombinedDateLabel / parseCombinedDateLabel', () => {
  it('formats a date + time pair into one stable label', () => {
    expect(formatCombinedDateLabel('2026-11-24', '20:30')).toBe('Nov 24, 2026 · 8:30 PM');
    expect(formatCombinedDateLabel('2026-01-01', '00:05')).toBe('Jan 1, 2026 · 12:05 AM');
    expect(formatCombinedDateLabel('2026-06-15', '12:00')).toBe('Jun 15, 2026 · 12:00 PM');
  });

  it('collapses cleanly when one or both halves are empty', () => {
    expect(formatCombinedDateLabel('2026-11-24', '')).toBe('Nov 24, 2026');
    expect(formatCombinedDateLabel('', '20:30')).toBe('8:30 PM');
    expect(formatCombinedDateLabel('', '')).toBe('');
    expect(formatCombinedDateLabel('not-a-date', '99:99')).toBe('');
  });

  it('round-trips the combined label back into date and time inputs', () => {
    const cases: Array<[string, string]> = [
      ['2026-11-24', '20:30'],
      ['2026-11-24', ''],
      ['', '20:30'],
      ['', ''],
    ];
    for (const [dateIso, time24] of cases) {
      expect(parseCombinedDateLabel(formatCombinedDateLabel(dateIso, time24))).toEqual({
        dateIso,
        time24,
      });
    }
  });

  it('returns empty inputs for legacy free-text labels and missing values', () => {
    expect(parseCombinedDateLabel('October 2025')).toEqual({ dateIso: '', time24: '' });
    expect(parseCombinedDateLabel('Summer 1998')).toEqual({ dateIso: '', time24: '' });
    expect(parseCombinedDateLabel(null)).toEqual({ dateIso: '', time24: '' });
    expect(parseCombinedDateLabel(undefined)).toEqual({ dateIso: '', time24: '' });
  });
});
