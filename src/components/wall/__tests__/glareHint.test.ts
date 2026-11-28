/**
 * `print-glare-tap-toggle` — the confirmation hint's copy and duration.
 */

import { describe, expect, it } from 'vitest';

import { GLARE_HINT_MS, glareHintText } from '../glareHint';

describe('glareHintText', () => {
  it('is empty before any toggle', () => {
    expect(glareHintText(0, false)).toBeNull();
  });

  it('teaches the gesture the first time glare goes off', () => {
    expect(glareHintText(1, true)).toBe('Glare off · tap photo to restore');
  });

  it('is short on later toggles', () => {
    expect(glareHintText(2, false)).toBe('Glare on');
    expect(glareHintText(3, true)).toBe('Glare off');
    expect(glareHintText(4, false)).toBe('Glare on');
  });

  it('shows for 1600ms', () => {
    expect(GLARE_HINT_MS).toBe(1600);
  });
});
