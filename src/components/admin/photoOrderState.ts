/**
 * Pure order & conflict-merge helpers for the Curator Studio Album Editor.
 *
 * Keeping these free of React/DOM lets Vitest cover every edge case:
 * - immutable list moves behind drag-and-drop and the `⤒` / `←` / `→` / `⤓` bar;
 * - `mergeStaleOrder` recovery for a `409 order_stale` save (preserve the
 *   curator's arrangement, append concurrent uploads, drop concurrent deletes);
 * - `<input type="date">` + `<input type="time">` round-tripping through the
 *   single existing `albums.dateLabel` column (zero DB migration).
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTH_INDEX = new Map<string, number>(
  MONTHS.map((label, index) => [label.toLowerCase(), index]),
);

function copy<T>(items: readonly T[]): T[] {
  return [...items];
}

/** Move one list item from `from` to `to` (no mutation; invalid indices no-op). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return copy(items);
  }
  const next = copy(items);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move one list item to the head of the list. */
export function moveToFirst<T>(items: readonly T[], index: number): T[] {
  return moveItem(items, index, 0);
}

/** Move one list item to the tail of the list. */
export function moveToLast<T>(items: readonly T[], index: number): T[] {
  return moveItem(items, index, items.length - 1);
}

/** True when the current id order differs from the saved baseline. */
export function isOrderDirty(
  current: readonly string[],
  saved: readonly string[],
): boolean {
  if (current.length !== saved.length) return true;
  return current.some((id, index) => id !== saved[index]);
}

/**
 * Reconcile a curator's draft order with the server's current active ids after
 * a `409 order_stale`:
 *
 * - ids still present keep the curator's relative arrangement;
 * - ids deleted by another tab are dropped;
 * - ids added by another tab are appended in server order;
 * - duplicate draft ids collapse to their first occurrence.
 */
export function mergeStaleOrder(
  draftIds: readonly string[],
  serverActiveIds: readonly string[],
): string[] {
  const serverSet = new Set(serverActiveIds);
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const id of draftIds) {
    if (!serverSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of serverActiveIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }

  return merged;
}

/**
 * Move one item inside a filtered subset while leaving every hidden item in its
 * exact full-order slot. `from`/`to` index into `subset`; the resulting visible
 * arrangement is written back into the slots those ids occupied.
 *
 * With every id visible (`subset === order`) this is identical to `moveItem`.
 */
export function moveWithinSubset(
  order: readonly string[],
  subset: readonly string[],
  from: number,
  to: number,
): string[] {
  if (from === to || from < 0 || to < 0 || from >= subset.length || to >= subset.length) {
    return copy(order);
  }

  const moved = moveItem(subset, from, to);
  const subsetIds = new Set(subset);
  let cursor = 0;
  return order.map((id) => (subsetIds.has(id) ? moved[cursor++] : id));
}

export interface DateLabelState {
  dateIso: string;
  time24: string;
  rawDateLabel: string | null;
}

/**
 * Preserve a stored free-text label (e.g. `October 2025` from the Upload tab)
 * unless the curator actually changes the Date/Time inputs. Once either input
 * differs from the saved state, the formatted combined label replaces it.
 */
export function resolveDateLabel(
  current: DateLabelState,
  saved: { dateIso: string; time24: string },
): string | null {
  if (current.dateIso === saved.dateIso && current.time24 === saved.time24) {
    return current.rawDateLabel;
  }
  return formatCombinedDateLabel(current.dateIso, current.time24) || null;
}

/** `2026-11-24` → `Nov 24, 2026`; malformed values collapse to `''`. */
function formatDateIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** `20:30` → `8:30 PM`; malformed values collapse to `''`. */
function formatTime24(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * Combine the two native inputs into the single persisted `albums.dateLabel`.
 * Empty halves collapse cleanly with no stray `·` separators.
 */
export function formatCombinedDateLabel(dateIso: string, time24: string): string {
  return [formatDateIso(dateIso), formatTime24(time24)].filter(Boolean).join(' · ');
}

function parseDateLabel(value: string): string {
  const match = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const month = MONTH_INDEX.get(match[1].slice(0, 3).toLowerCase());
  if (month === undefined) return '';
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31) return '';
  const iso = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
  // Reject impossible calendar dates (e.g. Feb 30) by checking the round trip.
  return formatDateIso(iso) === value.trim() ? iso : '';
}

function parseTimeLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return '';
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return '';
  const meridiem = match[3].toUpperCase();
  const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Inverse of `formatCombinedDateLabel` for the native date/time inputs. Legacy
 * free-text labels (e.g. `October 2025`) parse to empty inputs rather than
 * being guessed at, so the curator can re-enter them explicitly.
 */
export function parseCombinedDateLabel(label: string | null | undefined): {
  dateIso: string;
  time24: string;
} {
  const parts = (label ?? '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);

  let dateIso = '';
  let time24 = '';
  for (const part of parts) {
    if (!dateIso) {
      const candidate = parseDateLabel(part);
      if (candidate) {
        dateIso = candidate;
        continue;
      }
    }
    if (!time24) {
      const candidate = parseTimeLabel(part);
      if (candidate) time24 = candidate;
    }
  }

  return { dateIso, time24 };
}
