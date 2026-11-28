'use client';

/**
 * Pure presentational album placard.
 *
 * Fixed `214×200px` anatomy: title, optional `[Date · Time · Location]`, draft
 * badge, bottom-pinned soundtrack line with live tabular timecode, and the two
 * metallic corner standoffs. Geometry is computed by `islandLayout` and passed
 * in as `placedStyle`; selection and drag suppression stay in `GalleryCanvas`.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import type { CssRect } from './islandPlacement';
import {
  INITIAL_MARQUEE_GATE,
  MARQUEE_CFG,
  remainingFirstHoldMs,
  scrollTimeline,
  stepMarqueeGate,
  type MarqueeGate,
} from './placardMarquee';
import type { PlacardMaterial } from './placardMaterial';

/** Empty metadata halves collapse cleanly with no stray separators. */
function placardMetaLine(album: WallAlbum): string {
  return [album.dateLabel, album.locationLabel]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' · ');
}

/** `0:42` / `3:25` tabular timecode formatting. */
function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const whole = Math.floor(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Whole seconds the timecode should show.
 *
 * `clock` is the last position the mounted player reported (see
 * `SoundtrackPlaque`'s bridge). While playing it is advanced locally from the
 * moment that report arrived, so the display stays smooth between the player's
 * ~250 ms deliveries and re-anchors on every report. Paused and buffering hold
 * the reported position; an album with no report reads `0`.
 */
export function computeTimecodeSeconds({
  playing,
  clock,
  albumId,
  now,
  durationSec,
}: {
  playing: boolean;
  clock: { albumId: string | null; positionSec: number; at: number };
  albumId: string;
  now: number;
  durationSec: number | null;
}): number {
  if (clock.albumId !== albumId) return 0;
  const position = playing
    ? clock.positionSec + Math.max(0, now - clock.at) / 1000
    : clock.positionSec;
  const clamped = durationSec !== null && durationSec > 0 ? Math.min(position, durationSec) : position;
  return Math.max(0, Math.floor(clamped));
}

/**
 * Live placard timecode, driven by the player's own reported position.
 *
 * `soundtrack-playback-sync`: it used to be a wall clock started by the play
 * click, which ran ahead of the video whenever autoplay was refused or slow.
 * It now reads `soundtrackClock` and only advances while `soundtrack.playing`
 * (the player reported PLAYING).
 */
export function PlacardTimecode({
  albumId,
  durationSec,
}: {
  albumId: string;
  durationSec: number | null;
}) {
  const playing = useWallStore(
    (store) => store.soundtrack.playing && store.soundtrack.activeAlbumId === albumId,
  );
  // Album-scoped: other placards keep the same `null` and never re-render.
  const clock = useWallStore((store) =>
    store.soundtrackClock.albumId === albumId ? store.soundtrackClock : null,
  );
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const compute = () =>
      computeTimecodeSeconds({
        playing,
        clock: clock ?? { albumId: null, positionSec: 0, at: 0 },
        albumId,
        now: performance.now(),
        durationSec,
      });
    const update = () => setSeconds(compute());
    // Re-anchor on the next tick (a callback, not a synchronous setState in the
    // effect body), then keep ticking while the player is actually playing.
    const kick = window.setTimeout(update, 0);
    const timer = playing ? window.setInterval(update, 250) : null;
    return () => {
      window.clearTimeout(kick);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [albumId, clock, durationSec, playing]);

  return (
    <span className="placard-timecode" aria-live="off">
      {formatClock(seconds)}
      {durationSec !== null && durationSec > 0 ? ` / ${formatClock(durationSec)}` : ''}
    </span>
  );
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function reducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** `false` on the server and during hydration; live thereafter. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

/**
 * The text viewport of the box, excluding the fade-gutter padding that
 * `.is-marquee` adds. `clientWidth` includes padding, so subtract it to keep
 * overflow detection stable across activation (otherwise a marginal overflow
 * would stop overflowing the moment the gutter appears, and flicker).
 */
function trackContentWidth(box: HTMLElement): number {
  const style = window.getComputedStyle(box);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  return box.clientWidth - paddingLeft - paddingRight;
}

/**
 * Placard track line (`Song Title — Artist`).
 *
 * Idle — or playing but fitting — renders exactly the old markup: a bare text
 * node inside `.placard-track-name`, truncated with an ellipsis. A ticker only
 * mounts when the soundtrack line is both playing and overflowing; the strip
 * then holds for `MARQUEE_CFG.holdMs`, scrolls left at `speedPxPerSec` with an
 * `aria-hidden` duplicate, and repeats seamlessly on the compositor.
 */
function PlacardTrackLine({ albumId, text }: { albumId: string; text: string }) {
  const playing = useWallStore(
    (store) => store.soundtrack.playing && store.soundtrack.activeAlbumId === albumId,
  );
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(false);

  const boxRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const playStartedAtRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  // Activation gate, one per play session: it breaks any idle/active
  // measurement disagreement and caps activations (see `stepMarqueeGate`).
  const gateRef = useRef<MarqueeGate>(INITIAL_MARQUEE_GATE);

  // Anchor the first hold to the same click `PlacardTimecode` anchors to.
  useEffect(() => {
    playStartedAtRef.current = playing ? performance.now() : null;
    hasAnimatedRef.current = false;
    gateRef.current = INITIAL_MARQUEE_GATE;
  }, [playing, text]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    let disposed = false;

    const teardownAnimation = () => {
      animationRef.current?.cancel();
      animationRef.current = null;
    };

    // Deactivation is scheduled instead of run synchronously in the effect
    // body; the microtask keeps it in the same paint window.
    const deactivate = () => {
      if (!active) return;
      queueMicrotask(() => {
        if (!disposed) setActive(false);
      });
    };

    if (!playing || reducedMotion) {
      teardownAnimation();
      deactivate();
      return () => {
        disposed = true;
      };
    }

    let runningDistance: number | null = null;

    const sync = () => {
      if (disposed) return;
      // The gate is only stepped while it agrees with the mounted layout. A
      // second callback that lands before React re-renders would otherwise
      // measure the idle layout and record it as the active baseline.
      const current = gateRef.current;
      if (current.active !== active) {
        if (current.active) setActive(true);
        else deactivate();
        return;
      }

      const textEl = textRef.current;
      // Active: the text span is a flex item, so its `scrollWidth` is the full
      // run. Idle: the text is a direct child of the clipped box, so the box's
      // `scrollWidth` is the run (and keeps its ellipsis).
      const measure = {
        textWidth: textEl ? textEl.scrollWidth : box.scrollWidth,
        boxWidth: trackContentWidth(box),
      };
      const next = stepMarqueeGate(current, measure);
      gateRef.current = next;

      if (next.capped && !current.capped) {
        console.warn('[placard-marquee] activation cap reached', { albumId, measure });
      }

      if (!next.active) {
        teardownAnimation();
        runningDistance = null;
        deactivate();
        return;
      }

      if (!active) {
        // Mount the track first; this effect re-runs with the strip in place.
        setActive(true);
        return;
      }

      // While mounted, the distance comes from the adopted baseline, so an
      // active line always has a timeline.
      const timeline = scrollTimeline((next.baseline ?? measure).textWidth);

      const track = trackRef.current;
      if (!track) return;
      if (runningDistance === timeline.distancePx && animationRef.current) return;

      // Re-measure while running restarts at the beginning of the hold.
      teardownAnimation();
      const elapsed = Math.max(
        0,
        performance.now() - (playStartedAtRef.current ?? performance.now()),
      );
      // The keyframes already hold for `holdMs`, so the WAAPI delay is the
      // remainder minus that hold: 0 when measured at the click, negative when
      // overflow is first detected late (starting deeper into the hold) so the
      // first scroll still lands at `playStartedAt + holdMs`.
      const delay = hasAnimatedRef.current
        ? 0
        : remainingFirstHoldMs(elapsed, MARQUEE_CFG) - MARQUEE_CFG.holdMs;
      animationRef.current = track.animate(timeline.keyframes, {
        duration: timeline.durationMs,
        iterations: Infinity,
        easing: 'linear',
        delay,
      });
      runningDistance = timeline.distancePx;
      hasAnimatedRef.current = true;
    };

    const observer = new ResizeObserver(() => sync());
    observer.observe(box);
    const textEl = textRef.current;
    if (textEl) observer.observe(textEl);

    // TeX Gyre Heros may settle after the first measurement; this also performs
    // the initial measurement without calling setState in the effect body.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => sync());
    }

    return () => {
      disposed = true;
      observer.disconnect();
      teardownAnimation();
    };
  }, [active, albumId, playing, reducedMotion, text]);

  const marqueeStyle = {
    '--marquee-gap': `${MARQUEE_CFG.gapPx}px`,
    '--marquee-fade': `${MARQUEE_CFG.fadePx}px`,
  } as CSSProperties;

  return (
    <span
      ref={boxRef}
      className={active ? 'placard-track-name is-marquee' : 'placard-track-name'}
      title={text}
      style={marqueeStyle}
    >
      {active ? (
        <span className="placard-track" ref={trackRef}>
          <span className="placard-track-text" ref={textRef}>
            {text}
          </span>
          <span className="placard-track-text" aria-hidden="true">
            {text}
          </span>
        </span>
      ) : (
        text
      )}
    </span>
  );
}

export interface AlbumPlacardProps {
  album: WallAlbum;
  /** Island-local CSS placement from `islandRectStyle`. */
  placedStyle: CssRect;
  material: PlacardMaterial;
  isDraft: boolean;
  /** Per-object `--lit*` custom properties from `playgroundLighting`. */
  lightingVars?: Record<string, string>;
  onSelectAlbum: (albumId: string) => void;
  wasDragged: () => boolean;
}

export default function AlbumPlacard({
  album,
  placedStyle,
  material,
  isDraft,
  lightingVars,
  onSelectAlbum,
  wasDragged,
}: AlbumPlacardProps) {
  const metaLine = placardMetaLine(album);
  const trackLine = album.soundtrack
    ? [album.soundtrack.title, album.soundtrack.artist].filter(Boolean).join(' — ') ||
      'Soundtrack'
    : '';

  return (
    <button
      type="button"
      className={`museum-placard mat-${material} is-lit${isDraft ? ' is-draft' : ''}`}
      style={{ ...placedStyle, ...(lightingVars ?? {}) }}
      onClick={(event) => {
        event.stopPropagation();
        if (wasDragged()) return;
        onSelectAlbum(album.id);
      }}
      aria-label={`${isDraft ? 'Draft album ' : 'Open '}${album.title}`}
    >
      <h3 className="placard-title">{album.title}</h3>
      {metaLine ? <p className="placard-meta">{metaLine}</p> : null}
      {isDraft ? <span className="placard-draft-badge">Draft</span> : null}
      {album.soundtrack ? (
        <span className="placard-soundtrack">
          <PlacardTrackLine albumId={album.id} text={trackLine} />
          <PlacardTimecode albumId={album.id} durationSec={album.soundtrack.durationSec} />
        </span>
      ) : null}
      <span className="placard-standoff left" />
      <span className="placard-standoff right" />
    </button>
  );
}
