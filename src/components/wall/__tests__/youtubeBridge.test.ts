/**
 * `soundtrack-playback-sync` — pure parser for the youtube-nocookie widget
 * protocol. The embed answers a raw `listening` post with JSON strings:
 * `initialDelivery`, `onReady`, `infoDelivery` (`info.playerState`,
 * `info.currentTime`), `onStateChange` and, for repeated posts,
 * `alreadyInitialized` (observed live: logs/1.1-bridge-spike.log).
 */

import { describe, expect, it } from 'vitest';

import {
  YOUTUBE_EMBED_ORIGIN,
  listeningMessage,
  parseYoutubeMessage,
} from '../youtubeBridge';

const json = (value: unknown) => JSON.stringify(value);

describe('parseYoutubeMessage', () => {
  it('reads the state from onStateChange', () => {
    expect(parseYoutubeMessage(json({ event: 'onStateChange', info: 1 }))).toEqual({ state: 1 });
  });

  it('reads state and position from infoDelivery', () => {
    expect(
      parseYoutubeMessage(
        json({ event: 'infoDelivery', info: { playerState: 2, currentTime: 42.3, duration: 190 } }),
      ),
    ).toEqual({ state: 2, currentTime: 42.3 });
  });

  it('treats initialDelivery like infoDelivery', () => {
    expect(
      parseYoutubeMessage(json({ event: 'initialDelivery', info: { playerState: -1, currentTime: 0 } })),
    ).toEqual({ state: -1, currentTime: 0 });
  });

  it('accepts an already-parsed object', () => {
    expect(parseYoutubeMessage({ event: 'onStateChange', info: 3 })).toEqual({ state: 3 });
  });

  it('keeps a valid field when the other is invalid', () => {
    expect(
      parseYoutubeMessage(json({ event: 'infoDelivery', info: { playerState: 1, currentTime: 'x' } })),
    ).toEqual({ state: 1 });
    expect(
      parseYoutubeMessage(json({ event: 'infoDelivery', info: { playerState: 9, currentTime: 5 } })),
    ).toEqual({ currentTime: 5 });
  });

  it.each([
    ['not json', 'not json'],
    ['empty object', '{}'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an unknown event', json({ event: 'onReady', info: null })],
    ['alreadyInitialized', json({ event: 'alreadyInitialized', info: null })],
    ['volume-only infoDelivery', json({ event: 'infoDelivery', info: { muted: false, volume: 100 } })],
    ['a non-finite currentTime only', json({ event: 'infoDelivery', info: { currentTime: 'x' } })],
    ['an unknown state code only', json({ event: 'onStateChange', info: 7 })],
    ['an array', '[1,2]'],
  ])('returns null for %s', (_label, input) => {
    expect(parseYoutubeMessage(input)).toBeNull();
  });

  it('never throws on hostile input', () => {
    const hostile: unknown[] = [
      Symbol('x'),
      () => 1,
      { toString: () => { throw new Error('boom'); } },
      '{"event":',
      '{"event":"infoDelivery","info":{"currentTime":Infinity}}',
    ];
    for (const input of hostile) {
      expect(() => parseYoutubeMessage(input)).not.toThrow();
    }
  });

  it('rejects negative and non-finite positions', () => {
    expect(
      parseYoutubeMessage(json({ event: 'infoDelivery', info: { playerState: 1, currentTime: -3 } })),
    ).toEqual({ state: 1 });
  });
});

describe('listeningMessage', () => {
  it('is exactly the widget handshake', () => {
    expect(listeningMessage('a1')).toBe('{"event":"listening","id":"a1","channel":"widget"}');
  });

  it('escapes the id', () => {
    expect(JSON.parse(listeningMessage('a"b')).id).toBe('a"b');
  });
});

describe('YOUTUBE_EMBED_ORIGIN', () => {
  it('is the nocookie embed origin', () => {
    expect(YOUTUBE_EMBED_ORIGIN).toBe('https://www.youtube-nocookie.com');
  });
});
