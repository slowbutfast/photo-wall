/**
 * Offline `suncalc` circadian lighting for New York City.
 *
 * Windows (America/New_York, expressed as absolute UTC instants):
 * - `alabaster`:  sunrise + 90m  →  evening golden hour
 * - `concrete`:   dawn           →  sunrise + 90m, and golden hour → dusk
 * - `chiaroscuro`: dusk          →  dawn (wrapping midnight)
 *
 * The module is pure and SSR-safe; it never touches `localStorage`, network
 * APIs, or the visitor's timezone.
 */

import * as suncalc from 'suncalc';

export type Mood = 'alabaster' | 'concrete' | 'chiaroscuro';

/** New York City, per DESIGN.md. */
export const NYC_LAT = 40.7128;
export const NYC_LNG = -74.006;

export const MOOD_POLL_INTERVAL_MS = 60_000;
export const MOOD_CROSSFADE_MS = 60_000;
const SUNRISE_OFFSET_MS = 90 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface MoodTokens {
  wallTint: string;
  ambientLevel: number;
  spotIntensity: number;
  poolAlpha: number;
  shadowOpacity: number;
  placardInk: string;
}

/** Explicit per-mood render tokens from `design.md`. */
export const MOOD_TOKENS: Record<Mood, MoodTokens> = {
  alabaster: {
    wallTint: '#ECE9E2',
    ambientLevel: 0.78,
    spotIntensity: 0.65,
    poolAlpha: 0.38,
    shadowOpacity: 0.26,
    placardInk: '#1D1E1C',
  },
  concrete: {
    wallTint: '#6B6861',
    ambientLevel: 0.42,
    spotIntensity: 0.85,
    poolAlpha: 0.62,
    shadowOpacity: 0.42,
    placardInk: '#F4F6F4',
  },
  chiaroscuro: {
    wallTint: '#2D2C29',
    ambientLevel: 0.18,
    spotIntensity: 1.1,
    poolAlpha: 0.88,
    shadowOpacity: 0.58,
    placardInk: '#F4F6F4',
  },
};

export interface SolarBoundaries {
  dawn: Date;
  sunrisePlus90: Date;
  goldenHour: Date;
  dusk: Date;
}

function boundariesFor(date: Date): SolarBoundaries | null {
  const times = suncalc.getTimes(date, NYC_LAT, NYC_LNG);
  const { sunrise, goldenHour, dusk, dawn } = times;
  if (!sunrise || !goldenHour || !dusk || !dawn) return null;
  return {
    dawn,
    sunrisePlus90: new Date(sunrise.getTime() + SUNRISE_OFFSET_MS),
    goldenHour,
    dusk,
  };
}

/** Deterministic NYC solar mood for an absolute instant. */
export function determineAutoMood(date: Date): Mood {
  const boundaries = boundariesFor(date);
  if (!boundaries) return 'chiaroscuro';

  const now = date.getTime();
  const dawn = boundaries.dawn.getTime();
  const sunrisePlus90 = boundaries.sunrisePlus90.getTime();
  const goldenHour = boundaries.goldenHour.getTime();
  const dusk = boundaries.dusk.getTime();

  if (now >= sunrisePlus90 && now < goldenHour) return 'alabaster';
  if (now >= dawn && now < sunrisePlus90) return 'concrete';
  if (now >= goldenHour && now < dusk) return 'concrete';
  return 'chiaroscuro';
}

export interface MoodTransition {
  at: Date;
  from: Mood;
  to: Mood;
}

const BOUNDARY_TARGETS: Array<{ key: keyof SolarBoundaries; to: Mood }> = [
  { key: 'dawn', to: 'concrete' },
  { key: 'sunrisePlus90', to: 'alabaster' },
  { key: 'goldenHour', to: 'concrete' },
  { key: 'dusk', to: 'chiaroscuro' },
];

/**
 * Next solar mood boundary after `date`. Scans yesterday / today / tomorrow's
 * solar days so it works before dawn (returns today's dawn) and after dusk
 * (returns tomorrow's dawn).
 */
export function nextMoodTransition(date: Date): MoodTransition {
  const now = date.getTime();
  let bestAt: number | null = null;
  let bestTo: Mood = 'concrete';

  for (const dayOffset of [-1, 0, 1]) {
    const boundaries = boundariesFor(new Date(now + dayOffset * DAY_MS));
    if (!boundaries) continue;
    for (const boundary of BOUNDARY_TARGETS) {
      const at = boundaries[boundary.key].getTime();
      if (at > now && (bestAt === null || at < bestAt)) {
        bestAt = at;
        bestTo = boundary.to;
      }
    }
  }

  const at = new Date(bestAt ?? now + DAY_MS);
  return {
    at,
    from: determineAutoMood(date),
    to: bestAt === null ? 'concrete' : bestTo,
  };
}

/**
 * Crossfade progress for a boundary: `0` at the boundary, `1` once
 * `durationMs` has elapsed (clamped on both sides).
 */
export function crossfadeProgress(
  now: Date,
  transitionAt: Date,
  durationMs: number = MOOD_CROSSFADE_MS,
): number {
  const elapsed = now.getTime() - transitionAt.getTime();
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / Math.max(1, durationMs));
}
