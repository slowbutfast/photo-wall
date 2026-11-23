/**
 * Shared soundtrack labeling for the WebGL placard, the DOM overlay, and the
 * curator editor. Kept pure so it can be used in render loops.
 */

export function formatTimecode(seconds: number | null | undefined): string {
  const total = Number.isFinite(seconds ?? NaN) ? Math.max(0, Math.floor(seconds as number)) : 0;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export interface SoundtrackLineSource {
  artist: string | null;
  title: string | null;
  durationSec: number | null;
}

/** `Artist - Song (0:01/3:25)` as rendered inside the glass placard. */
export function buildTrackLine(
  soundtrack: SoundtrackLineSource | null,
  playheadSec = 0,
): string {
  if (!soundtrack) return '';
  const artist = soundtrack.artist?.trim() || 'Unknown artist';
  const title = soundtrack.title?.trim() || 'Untitled';
  return `${artist} - ${title} (${formatTimecode(playheadSec)}/${formatTimecode(
    soundtrack.durationSec,
  )})`;
}
