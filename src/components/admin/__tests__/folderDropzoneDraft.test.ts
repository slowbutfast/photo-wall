/**
 * `upload-autosave-draft` — the pure helpers behind the Upload card.
 *
 * `buildAlbumPatchBody` decides what each PATCH carries: the auto-save never
 * sends `status` (every album is already a draft, and a late auto-save must not
 * be able to demote a published one), and Publish sends only what changed since
 * the auto-save so edits made in Exhibitions survive.
 */

import { describe, expect, it } from 'vitest';

import {
  buildAlbumPatchBody,
  getDraftStatusLabel,
  type OptionalSettings,
} from '../FolderDropzone';

const SETTINGS: OptionalSettings = {
  cameraName: '',
  dateLabel: 'October 2025',
  locationLabel: 'Kyoto',
  youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  artist: 'Artist',
  song: 'Song',
  videoId: 'abcdefghijk',
  durationSec: 205,
};

describe('buildAlbumPatchBody', () => {
  it('never contains status when saving as a draft', () => {
    const body = buildAlbumPatchBody('Trip', SETTINGS, { publish: false, since: null, titleSince: null });
    expect('status' in body).toBe(false);
  });

  it('sends status published when publishing', () => {
    const body = buildAlbumPatchBody('Trip', SETTINGS, { publish: true, since: null, titleSince: null });
    expect(body.status).toBe('published');
  });

  it('without a previous save, sends the title and every optional field', () => {
    expect(
      buildAlbumPatchBody('Trip', SETTINGS, { publish: false, since: null, titleSince: null }),
    ).toEqual({
      title: 'Trip',
      cameraName: '',
      dateLabel: 'October 2025',
      locationLabel: 'Kyoto',
      soundtrackArtist: 'Artist',
      soundtrackTitle: 'Song',
      soundtrackDurationSec: 205,
      youtubeVideoId: 'abcdefghijk',
    });
  });

  it('omits youtubeVideoId when there is no video and nothing to clear', () => {
    const body = buildAlbumPatchBody('Trip', { ...SETTINGS, videoId: null }, {
      publish: false,
      since: null,
      titleSince: null,
    });
    expect('youtubeVideoId' in body).toBe(false);
  });

  it('with the same settings as the last save, sends nothing but the status', () => {
    expect(
      buildAlbumPatchBody('Trip', SETTINGS, { publish: true, since: SETTINGS, titleSince: 'Trip' }),
    ).toEqual({ status: 'published' });
  });

  it('sends only the fields that changed since the last save', () => {
    expect(
      buildAlbumPatchBody(
        'Trip',
        { ...SETTINGS, dateLabel: 'Spring 2026' },
        { publish: true, since: SETTINGS, titleSince: 'Trip' },
      ),
    ).toEqual({ status: 'published', dateLabel: 'Spring 2026' });
  });

  it('sends a cleared field as an empty string', () => {
    expect(
      buildAlbumPatchBody(
        'Trip',
        { ...SETTINGS, locationLabel: '' },
        { publish: true, since: SETTINGS, titleSince: 'Trip' },
      ),
    ).toEqual({ status: 'published', locationLabel: '' });
  });

  it('sends the title only when it differs from the saved one', () => {
    expect(
      buildAlbumPatchBody('New', SETTINGS, { publish: true, since: SETTINGS, titleSince: 'Trip' }).title,
    ).toBe('New');
    expect(
      'title' in
        buildAlbumPatchBody('Trip', SETTINGS, { publish: true, since: SETTINGS, titleSince: 'Trip' }),
    ).toBe(false);
  });

  it('clears the soundtrack when the video was removed since the last save', () => {
    const body = buildAlbumPatchBody(
      'Trip',
      { ...SETTINGS, videoId: null },
      { publish: true, since: SETTINGS, titleSince: 'Trip' },
    );
    expect(body.youtubeVideoId).toBeNull();
  });

  it('sends a changed video id', () => {
    const body = buildAlbumPatchBody(
      'Trip',
      { ...SETTINGS, videoId: 'zzzzzzzzzzz' },
      { publish: true, since: SETTINGS, titleSince: 'Trip' },
    );
    expect(body.youtubeVideoId).toBe('zzzzzzzzzzz');
  });
});

describe('getDraftStatusLabel', () => {
  const base = {
    published: false,
    saving: false,
    failed: 0,
    savedAsDraft: false,
    allDone: false,
    done: 2,
    total: 5,
  };

  it('follows the documented precedence', () => {
    expect(getDraftStatusLabel({ ...base, published: true, saving: true, failed: 1, savedAsDraft: true, allDone: true })).toBe('Published');
    expect(getDraftStatusLabel({ ...base, saving: true, failed: 1, savedAsDraft: true, allDone: true })).toBe('Saving…');
    expect(getDraftStatusLabel({ ...base, failed: 1, savedAsDraft: true, allDone: true })).toBe('1 failed');
    expect(getDraftStatusLabel({ ...base, savedAsDraft: true, allDone: true })).toBe('Saved as draft');
    expect(getDraftStatusLabel({ ...base, allDone: true })).toBe('Ready to publish');
    expect(getDraftStatusLabel(base)).toBe('2/5');
  });

  it('does not keep claiming a save after a later failure', () => {
    expect(getDraftStatusLabel({ ...base, savedAsDraft: true, failed: 2 })).toBe('2 failed');
  });
});
