/**
 * Copy and timing for the confirmation hint shown when a touch visitor toggles
 * the Print Focus glare (`print-glare-tap-toggle`). Pure, so it is table-testable.
 */

/** How long the hint stays visible after a toggle. */
export const GLARE_HINT_MS = 1600;

/**
 * Hint text for the `count`-th toggle (1-based), or `null` before any toggle.
 * The first time glare goes off it teaches the way back; later toggles are terse.
 */
export function glareHintText(count: number, glareOff: boolean): string | null {
  if (count <= 0) return null;
  if (count === 1 && glareOff) return 'Glare off · tap photo to restore';
  return glareOff ? 'Glare off' : 'Glare on';
}
