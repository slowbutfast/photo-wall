/**
 * 60-second smooth crossfade between two `suncalc` solar mood token sets.
 *
 * Tokens are the explicit per-mood render values from `design.md`. The helper
 * is pure so it can run inside render loops without touching React state.
 */

import { MOOD_TOKENS, type MoodTokens } from './nyTimeMood';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(color: string): Rgb {
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

/** Mix two `#rrggbb` colours and return a CSS-compatible `rgb()` string. */
export function mixHexColor(from: string, to: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const a = parseHex(from);
  const b = parseHex(to);
  return `rgb(${mixChannel(a.r, b.r, clamped)}, ${mixChannel(a.g, b.g, clamped)}, ${mixChannel(
    a.b,
    b.b,
    clamped,
  )})`;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function blendMoodTokens(
  from: MoodTokens,
  to: MoodTokens,
  t: number,
): MoodTokens {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    wallTint: mixHexColor(from.wallTint, to.wallTint, clamped),
    ambientLevel: lerp(from.ambientLevel, to.ambientLevel, clamped),
    spotIntensity: lerp(from.spotIntensity, to.spotIntensity, clamped),
    poolAlpha: lerp(from.poolAlpha, to.poolAlpha, clamped),
    shadowOpacity: lerp(from.shadowOpacity, to.shadowOpacity, clamped),
    placardInk: mixHexColor(from.placardInk, to.placardInk, clamped),
  };
}

/** Tokens at a static mood, without any crossfade. */
export function moodTokens(mood: keyof typeof MOOD_TOKENS): MoodTokens {
  return MOOD_TOKENS[mood];
}
