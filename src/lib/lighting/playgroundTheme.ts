/**
 * Exact `applyTheme()` palettes from `playgrounds/photo_wall_playground.html`
 * (`dcc7a048`, `L2432-L2460`). Consumed by the wall shader uniforms and by the
 * React wrapper's scoped CSS custom properties.
 */

import type { Mood } from './nyTimeMood';

export interface PlaygroundTheme {
  wallBase: string;
  vignette: string;
  ambientLevel: number;
  tint: [number, number, number];
  wallFg: string;
  wallMuted: string;
  glassInk: string;
  glassCap: string;
  glassShadow: string;
  hudBg: string;
  hudBorder: string;
  accent: string;
  accentFg: string;
  spotCore: string;
  spotMid: string;
  spotEdge: string;
}

export const PLAYGROUND_THEMES: Record<Mood, PlaygroundTheme> = {
  chiaroscuro: {
    wallBase: '#3d3a35',
    vignette: 'rgba(14, 13, 12, 0.38)',
    ambientLevel: 0.24,
    tint: [0.84, 0.81, 0.77],
    wallFg: '#ECEAE4',
    wallMuted: '#9E9C95',
    glassInk: '#F4F6F4',
    glassCap: 'rgba(240, 244, 241, 0.90)',
    glassShadow: '0 3px 4px rgba(0, 0, 0, 0.52)',
    hudBg: 'rgba(24, 24, 22, 0.86)',
    hudBorder: 'rgba(255, 255, 255, 0.12)',
    accent: '#ECEAE4',
    accentFg: '#181816',
    spotCore: 'rgba(255, 248, 232, 0.44)',
    spotMid: 'rgba(255, 245, 224, 0.18)',
    spotEdge: 'rgba(255, 244, 220, 0.04)',
  },
  concrete: {
    wallBase: '#6b6861',
    vignette: 'rgba(20, 19, 17, 0.50)',
    ambientLevel: 0.38,
    tint: [0.94, 0.93, 0.9],
    wallFg: '#F4F2EC',
    wallMuted: '#CBC8BF',
    glassInk: '#F4F6F4',
    glassCap: 'rgba(240, 244, 241, 0.92)',
    glassShadow: '0 2px 4px rgba(0, 0, 0, 0.48)',
    hudBg: 'rgba(42, 41, 38, 0.84)',
    hudBorder: 'rgba(255, 255, 255, 0.15)',
    accent: '#F4F2EC',
    accentFg: '#242320',
    spotCore: 'rgba(255, 250, 238, 0.48)',
    spotMid: 'rgba(255, 248, 232, 0.22)',
    spotEdge: 'rgba(255, 246, 228, 0.05)',
  },
  alabaster: {
    wallBase: '#CBC6BC',
    vignette: 'rgba(42, 39, 34, 0.26)',
    ambientLevel: 0.72,
    tint: [1.0, 0.99, 0.96],
    wallFg: '#1D1E1C',
    wallMuted: '#5C5B55',
    glassInk: '#1D1E1C',
    glassCap: 'rgba(29, 30, 28, 0.84)',
    glassShadow: '0 1px 1px rgba(255, 255, 255, 0.45)',
    hudBg: 'rgba(246, 244, 239, 0.88)',
    hudBorder: 'rgba(29, 30, 28, 0.14)',
    accent: '#1D1E1C',
    accentFg: '#F6F4EF',
    spotCore: 'rgba(255, 253, 246, 0.58)',
    spotMid: 'rgba(255, 251, 240, 0.26)',
    spotEdge: 'rgba(255, 249, 236, 0.06)',
  },
};

/** Scoped CSS custom properties for `.playground-wall-root`. */
export function playgroundThemeStyle(theme: PlaygroundTheme): Record<string, string> {
  return {
    '--wall-base': theme.wallBase,
    '--wall-ambient-vignette': theme.vignette,
    '--wall-fg': theme.wallFg,
    '--wall-muted': theme.wallMuted,
    '--glass-ink': theme.glassInk,
    '--glass-cap': theme.glassCap,
    '--glass-text-shadow': theme.glassShadow,
    '--wall-hud-bg': theme.hudBg,
    '--wall-hud-border': theme.hudBorder,
    '--wall-accent': theme.accent,
    '--wall-accent-fg': theme.accentFg,
    '--spot-core': theme.spotCore,
    '--spot-mid': theme.spotMid,
    '--spot-edge': theme.spotEdge,
  };
}
