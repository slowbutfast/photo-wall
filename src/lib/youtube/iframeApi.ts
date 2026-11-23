'use client';

/**
 * Lazy YouTube IFrame API loader shared by the DOM soundtrack overlay and the
 * Curator drawer's hidden `getDuration()` probe. Only ever runs in the browser;
 * all access is guarded so SSR and blocked-network environments degrade to the
 * resting thumbnail instead of throwing.
 */

export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

export interface YouTubePlayerOptions {
  videoId: string;
  width?: number | string;
  height?: number | string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    onError?: () => void;
  };
}

export interface YouTubeNamespace {
  Player: new (element: string | HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace | null> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeNamespace | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace | null>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT ?? null);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return apiPromise;
}
