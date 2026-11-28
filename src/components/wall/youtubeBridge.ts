/**
 * Pure side of the soundtrack plaque's bridge to the youtube-nocookie embed.
 *
 * The public CSP deliberately keeps `www.youtube.com` (and so `iframe_api`)
 * off the wall, so the plaque speaks the embed's own postMessage protocol
 * instead. With `enablejsapi=1` the embed answers a `listening` post with JSON
 * strings: `initialDelivery`, `onReady`, `infoDelivery` (`info.playerState`,
 * `info.currentTime`), `onStateChange`, and `alreadyInitialized` for repeated
 * posts (observed live: `soundtrack-playback-sync/logs/1.1-bridge-spike.log`).
 *
 * Nothing here touches the DOM, so the parsing is table-testable.
 */

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/** YouTube player states: unstarted, ended, playing, paused, buffering, cued. */
export type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;

export interface BridgeMessage {
  state?: PlayerState;
  /** Seconds, finite and non-negative. */
  currentTime?: number;
}

const PLAYER_STATES: readonly number[] = [-1, 0, 1, 2, 3, 5];

function asState(value: unknown): PlayerState | undefined {
  return typeof value === 'number' && PLAYER_STATES.includes(value)
    ? (value as PlayerState)
    : undefined;
}

function asPosition(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Map a widget message to the fields the plaque cares about, or `null` when it
 * carries none. Never throws: `data` comes from another origin.
 */
export function parseYoutubeMessage(data: unknown): BridgeMessage | null {
  let payload: unknown = data;
  if (typeof data === 'string') {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;

  const record = payload as { event?: unknown; info?: unknown };
  let state: PlayerState | undefined;
  let currentTime: number | undefined;

  if (record.event === 'onStateChange') {
    state = asState(record.info);
  } else if (record.event === 'infoDelivery' || record.event === 'initialDelivery') {
    const info = record.info;
    if (typeof info === 'object' && info !== null) {
      state = asState((info as { playerState?: unknown }).playerState);
      currentTime = asPosition((info as { currentTime?: unknown }).currentTime);
    }
  } else {
    return null;
  }

  if (state === undefined && currentTime === undefined) return null;
  const message: BridgeMessage = {};
  if (state !== undefined) message.state = state;
  if (currentTime !== undefined) message.currentTime = currentTime;
  return message;
}

/** The handshake that makes the embed start posting state to its parent. */
export function listeningMessage(id: string): string {
  return JSON.stringify({ event: 'listening', id, channel: 'widget' });
}
