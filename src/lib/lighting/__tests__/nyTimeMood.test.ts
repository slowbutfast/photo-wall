import { describe, expect, it } from 'vitest';
import * as suncalc from 'suncalc';
import {
  MOOD_CROSSFADE_MS,
  MOOD_POLL_INTERVAL_MS,
  MOOD_TOKENS,
  NYC_LAT,
  NYC_LNG,
  crossfadeProgress,
  determineAutoMood,
  nextMoodTransition,
  type Mood,
} from '../nyTimeMood';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function at(iso: string): Date {
  return new Date(iso);
}

function timesFor(date: Date) {
  return suncalc.getTimes(date, NYC_LAT, NYC_LNG);
}

describe('NYC coordinates', () => {
  it('pins New York City', () => {
    expect(NYC_LAT).toBeCloseTo(40.7128, 6);
    expect(NYC_LNG).toBeCloseTo(-74.006, 6);
  });
});

describe('MOOD_TOKENS', () => {
  it('matches the per-mood render token table in design.md', () => {
    expect(MOOD_TOKENS.alabaster).toEqual({
      wallTint: '#ECE9E2',
      ambientLevel: 0.78,
      spotIntensity: 0.65,
      poolAlpha: 0.38,
      shadowOpacity: 0.26,
      placardInk: '#1D1E1C',
    });
    expect(MOOD_TOKENS.concrete).toEqual({
      wallTint: '#6B6861',
      ambientLevel: 0.42,
      spotIntensity: 0.85,
      poolAlpha: 0.62,
      shadowOpacity: 0.42,
      placardInk: '#F4F6F4',
    });
    expect(MOOD_TOKENS.chiaroscuro).toEqual({
      wallTint: '#2D2C29',
      ambientLevel: 0.18,
      spotIntensity: 1.1,
      poolAlpha: 0.88,
      shadowOpacity: 0.58,
      placardInk: '#F4F6F4',
    });
  });

  it('polls every 60 seconds and crossfades for 60 seconds', () => {
    expect(MOOD_POLL_INTERVAL_MS).toBe(60_000);
    expect(MOOD_CROSSFADE_MS).toBe(60_000);
  });
});

describe('determineAutoMood', () => {
  it('maps a NYC summer midday to alabaster', () => {
    // 2026-07-01T16:00Z = 12:00 EDT in New York.
    expect(determineAutoMood(at('2026-07-01T16:00:00Z'))).toBe<Mood>('alabaster');
  });

  it('maps a NYC winter midnight to chiaroscuro', () => {
    // 2026-01-15T05:00Z = 00:00 EST in New York.
    expect(determineAutoMood(at('2026-01-15T05:00:00Z'))).toBe<Mood>('chiaroscuro');
  });

  it('walks every solar window boundary in order', () => {
    const reference = at('2026-07-01T16:00:00Z');
    const times = timesFor(reference);
    const sunrise = times.sunrise!;
    const sunrisePlus90 = new Date(sunrise.getTime() + 90 * MINUTE);
    const goldenHour = times.goldenHour!;
    const dusk = times.dusk!;
    const dawn = times.dawn!;

    expect(determineAutoMood(new Date(dawn.getTime() + MINUTE))).toBe<Mood>('concrete');
    expect(determineAutoMood(new Date(sunrisePlus90.getTime() + MINUTE))).toBe<Mood>('alabaster');
    expect(determineAutoMood(new Date(sunrisePlus90.getTime() - MINUTE))).toBe<Mood>('concrete');
    expect(determineAutoMood(new Date(goldenHour.getTime() + MINUTE))).toBe<Mood>('concrete');
    expect(determineAutoMood(new Date(goldenHour.getTime() - MINUTE))).toBe<Mood>('alabaster');
    expect(determineAutoMood(new Date(dusk.getTime() + MINUTE))).toBe<Mood>('chiaroscuro');
    expect(determineAutoMood(new Date(dusk.getTime() - MINUTE))).toBe<Mood>('concrete');
  });

  it('keeps solar boundaries aligned across the March spring-forward DST transition', () => {
    // DST starts 2026-03-08 in America/New_York.
    for (const localNoon of ['2026-03-07T17:00:00Z', '2026-03-08T16:00:00Z']) {
      const reference = at(localNoon);
      const times = timesFor(reference);
      const sunrisePlus90 = new Date(times.sunrise!.getTime() + 90 * MINUTE);
      expect(determineAutoMood(new Date(sunrisePlus90.getTime() - MINUTE))).toBe<Mood>('concrete');
      expect(determineAutoMood(new Date(sunrisePlus90.getTime() + MINUTE))).toBe<Mood>('alabaster');
      expect(determineAutoMood(reference)).toBe<Mood>('alabaster');
    }
  });

  it('keeps solar boundaries aligned across the November fall-back DST transition', () => {
    // DST ends 2026-11-01 in America/New_York.
    for (const localNoon of ['2026-10-31T16:00:00Z', '2026-11-01T17:00:00Z']) {
      const reference = at(localNoon);
      const times = timesFor(reference);
      const sunrisePlus90 = new Date(times.sunrise!.getTime() + 90 * MINUTE);
      expect(determineAutoMood(new Date(sunrisePlus90.getTime() - MINUTE))).toBe<Mood>('concrete');
      expect(determineAutoMood(new Date(sunrisePlus90.getTime() + MINUTE))).toBe<Mood>('alabaster');
      expect(determineAutoMood(reference)).toBe<Mood>('alabaster');
    }
  });

  it('classifies both sides of local midnight as chiaroscuro', () => {
    expect(determineAutoMood(at('2026-07-01T04:00:00Z'))).toBe<Mood>('chiaroscuro'); // 00:00 EDT
    expect(determineAutoMood(at('2026-07-02T03:00:00Z'))).toBe<Mood>('chiaroscuro'); // 23:00 EDT
  });
});

describe('nextMoodTransition', () => {
  it('returns the evening golden hour at midday', () => {
    const noon = at('2026-07-01T16:00:00Z');
    const times = timesFor(noon);
    const next = nextMoodTransition(noon);
    expect(next.at.getTime()).toBe(times.goldenHour!.getTime());
    expect(next.from).toBe<Mood>('alabaster');
    expect(next.to).toBe<Mood>('concrete');
  });

  it('returns tomorrow’s dawn late at night', () => {
    const late = at('2026-07-02T03:00:00Z'); // 23:00 EDT
    const next = nextMoodTransition(late);
    const tomorrowTimes = timesFor(new Date(late.getTime() + 24 * HOUR));
    expect(next.at.getTime()).toBe(tomorrowTimes.dawn!.getTime());
    expect(next.from).toBe<Mood>('chiaroscuro');
    expect(next.to).toBe<Mood>('concrete');
    expect(next.at.getTime()).toBeGreaterThan(late.getTime());
  });

  it('returns today’s dawn when called before sunrise', () => {
    const early = at('2026-07-01T08:00:00Z'); // 04:00 EDT
    const next = nextMoodTransition(early);
    const todayTimes = timesFor(at('2026-07-01T16:00:00Z'));
    expect(next.at.getTime()).toBe(todayTimes.dawn!.getTime());
    expect(next.from).toBe<Mood>('chiaroscuro');
    expect(next.to).toBe<Mood>('concrete');
  });
});

describe('crossfadeProgress', () => {
  it('ramps 0 → 1 over 60 seconds and clamps', () => {
    const boundary = at('2026-07-01T16:00:00Z');
    expect(crossfadeProgress(boundary, boundary)).toBe(0);
    expect(crossfadeProgress(new Date(boundary.getTime() + 30_000), boundary)).toBeCloseTo(0.5, 10);
    expect(crossfadeProgress(new Date(boundary.getTime() + 60_000), boundary)).toBe(1);
    expect(crossfadeProgress(new Date(boundary.getTime() + 120_000), boundary)).toBe(1);
    expect(crossfadeProgress(new Date(boundary.getTime() - 1), boundary)).toBe(0);
  });

  it('honours a custom duration', () => {
    const boundary = at('2026-07-01T16:00:00Z');
    expect(crossfadeProgress(new Date(boundary.getTime() + 15_000), boundary, 30_000)).toBeCloseTo(
      0.5,
      10,
    );
  });
});
