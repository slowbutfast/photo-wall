/**
 * Deterministic synthetic wall manifest for the `?demo=2000` performance and
 * visual spike.
 *
 * 50 albums x 40 photos (2,000 prints) are laid out with the shared
 * `backend-storage-crud` geometry (`computeWallGridPositions` /
 * `computeAlbumGrid`) so the demo exercises the exact production placement
 * contract. Each photo's `storagePath` is an inline gradient SVG data URL and
 * `cdnBase` is empty, so the demo renders fully offline with no 404s.
 */

import { computeAlbumGrid, computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';

const ALBUM_COUNT = 50;
const PHOTOS_PER_ALBUM = 40;

const TITLES = [
  'Tokyo Nocturnes',
  'Pacific Coastline',
  'Brutalist Concrete',
  'Alpine Winter',
  'Desert Meridian',
  'Harbour Fog',
  'Quiet Interiors',
  'Neon Crossings',
  'Salt Flats',
  'Northern Pines',
  'Market Light',
  'Canal Mornings',
  'Stone Gardens',
  'Long Exposure',
  'Coastal Drift',
  'Studio Studies',
  'Field Notes',
  'Blue Hour',
  'Glass & Steel',
  'Terracotta',
  'Winter Windows',
  'Kite Season',
  'Low Tide',
  'Rooftop Rain',
  'Museum Steps',
  'Paper Lanterns',
  'Railway Lines',
  'Still Water',
  'Open Roads',
  'Cloud Atlas',
  'Night Market',
  'Morning Swim',
  'High Desert',
  'Passing Trains',
  'Shoreline',
  'Forest Floor',
  'Typographic City',
  'Summer Storm',
  'Quarry Light',
  'Seed & Soil',
  'Concrete Poems',
  'Ferry Wake',
  'Snow Fence',
  'Backstage',
  'River Delta',
  'Window Seat',
  'Cold Storage',
  'Signal Hill',
  'Gardens at Dusk',
  'Final Frame',
] as const;

const PALETTES: Array<[string, string, string, string]> = [
  ['#242c3c', '#5e4b56', '#c97b63', '#f4d3a1'],
  ['#7ea8be', '#b8d0dc', '#45697a', '#f7efe5'],
  ['#9b9890', '#6d6b65', '#343330', '#e6e4de'],
  ['#334155', '#64748b', '#1e293b', '#f8fafc'],
  ['#c99672', '#a8674a', '#593426', '#fae5c8'],
];

const ASPECTS = [1.45, 0.72, 1.33, 0.78, 1.0, 1.5, 0.75, 1.28, 0.82, 1.4];

const VIDEO_IDS = [
  'dQw4w9WgXcQ',
  '9bZkp7q19f0',
  'kJQP7kiw5Fk',
  'JGwWNGJdvx8',
  'RgKAFK5djSk',
  'OPf0YbXqDm0',
  'fJ9rUzIMcZQ',
  'CevxZvSJLk8',
];

const SOUNDTRACKS = [
  { artist: 'Lofi Girl', title: 'Tokyo Midnight' },
  { artist: 'ChilledCow', title: 'Coastal Drift' },
  { artist: 'Ryuichi', title: 'Winter Study' },
  { artist: 'Nujabes', title: 'Modal Soul' },
  { artist: 'Bonobo', title: 'Kerala' },
  { artist: 'Tycho', title: 'Awake' },
];

const CAMERA_LABELS = ['Leica M6', 'Fujifilm X100VI', 'Ricoh GR IIIx', 'Hasselblad 500C/M'];
const LOCATION_LABELS = ['Tokyo', 'Big Sur', 'Berlin', 'Zermatt', 'Moab', 'Reykjavík'];

/** Tiny deterministic PRNG (mulberry32) so the demo is stable across reloads. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makePhotoSvg(
  seed: number,
  palette: [string, string, string, string],
  aspectRatio: number,
): string {
  const width = aspectRatio >= 1 ? 440 : Math.round(440 * aspectRatio);
  const height = aspectRatio >= 1 ? Math.round(440 / aspectRatio) : 440;
  const [c1, c2, c3, accent] = palette;
  const sunX = 18 + ((seed * 37) % 64);
  const sunY = 16 + ((seed * 29) % 36);
  const horizon = 50 + ((seed * 17) % 24);
  const variant = seed % 3;
  const shape =
    variant === 0
      ? `<path d="M 0 ${height} L 0 ${height * (horizon / 100)} Q ${width * 0.32} ${
          height * ((horizon - 14) / 100)
        } ${width * 0.62} ${height * (horizon / 100)} T ${width} ${
          height * ((horizon - 5) / 100)
        } L ${width} ${height} Z" fill="${c3}" opacity="0.84"/>`
      : variant === 1
        ? `<rect x="${width * 0.14}" y="${height * 0.24}" width="${width * 0.36}" height="${
            height * 0.76
          }" fill="${c3}" opacity="0.74"/><rect x="${width * 0.56}" y="${
            height * 0.42
          }" width="${width * 0.28}" height="${height * 0.58}" fill="${c2}" opacity="0.86"/>`
        : `<path d="M 0 ${height} L ${width * 0.35} ${height * (horizon / 100 - 0.12)} L ${
            width * 0.72
          } ${height * (horizon / 100 + 0.04)} L ${width} ${
            height * (horizon / 100 - 0.08)
          } L ${width} ${height} Z" fill="${c3}" opacity="0.82"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs><linearGradient id="g${seed}" x1="0" y1="0" x2="0.15" y2="1">
<stop offset="0%" stop-color="${c1}"/><stop offset="62%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g${seed})"/>
<circle cx="${sunX}%" cy="${sunY}%" r="${Math.min(width, height) * 0.1}" fill="${accent}" opacity="0.85"/>
${shape}
<path d="M 0 ${height} L 0 ${height * ((horizon + 12) / 100)} Q ${width * 0.45} ${
    height * ((horizon + 4) / 100)
  } ${width} ${height * ((horizon + 14) / 100)} L ${width} ${height} Z" fill="#0d0d0b" opacity="0.24"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildAlbum(index: number, photosPerAlbum: number, random: () => number): WallAlbum {
  const palette = PALETTES[index % PALETTES.length];
  const gridColumns = 10;
  const hasSoundtrack = index % 5 === 2;
  const soundtrackSource = SOUNDTRACKS[index % SOUNDTRACKS.length];
  const photos: WallPhoto[] = [];

  for (let photoIndex = 0; photoIndex < photosPerAlbum; photoIndex += 1) {
    const aspectRatio = ASPECTS[(photoIndex + index) % ASPECTS.length];
    const width = aspectRatio >= 1 ? 1600 : Math.round(1600 * aspectRatio);
    const height = aspectRatio >= 1 ? Math.round(1600 / aspectRatio) : 1600;
    const seed = index * 131 + photoIndex + 1;
    const dominant = palette[(photoIndex + index) % palette.length];

    photos.push({
      id: `demo-photo-${index + 1}-${photoIndex + 1}`,
      storagePath: makePhotoSvg(seed, palette, aspectRatio),
      width,
      height,
      aspectRatio,
      dominantColor: dominant,
      thumbHash: null,
      sortOrder: photoIndex,
    });
  }

  // Keep `random` in the signature so future synthetic variations stay stable.
  void random;

  return {
    id: `demo-album-${String(index + 1).padStart(2, '0')}`,
    slug: `demo-album-${index + 1}`,
    title: TITLES[index % TITLES.length],
    description: [
      'Autumn studies in available light.',
      'Low-tide fog along the coast.',
      'Monochrome cast shadow geometry.',
      'Medium format prints, January.',
      'Colour field notes from the road.',
    ][index % 5],
    gridColumns,
    sortOrder: index,
    position: { x: 0, y: 0 },
    bounds: { width: 0, height: 0 },
    cameraName: index % 3 === 0 ? CAMERA_LABELS[index % CAMERA_LABELS.length] : null,
    dateLabel: index % 4 === 0 ? 'October 2025' : null,
    locationLabel: index % 3 === 1 ? LOCATION_LABELS[index % LOCATION_LABELS.length] : null,
    soundtrack: hasSoundtrack
      ? {
          videoId: VIDEO_IDS[index % VIDEO_IDS.length],
          artist: soundtrackSource.artist,
          title: soundtrackSource.title,
          durationSec: 180 + ((index * 17) % 120),
        }
      : null,
    photos,
  };
}

/**
 * Build the deterministic demo manifest. `photoCount` defaults to 2,000 and is
 * distributed evenly across 50 albums.
 */
export function buildFakeWallSummary(photoCount = 2000): WallSummary {
  const total = Math.max(ALBUM_COUNT, Math.floor(photoCount));
  const base = Math.floor(total / ALBUM_COUNT);
  const remainder = total % ALBUM_COUNT;
  const random = createRandom(0x9e3779b9);

  const albums: WallAlbum[] = Array.from({ length: ALBUM_COUNT }, (_, index) =>
    buildAlbum(index, base + (index < remainder ? 1 : 0), random),
  );

  const placements = computeWallGridPositions(
    albums.map((album) => ({
      id: album.id,
      status: 'published' as const,
      photoCount: album.photos.length,
      gridColumns: album.gridColumns,
      sortOrder: album.sortOrder,
      hasSoundtrack: album.soundtrack !== null,
    })),
  );
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  return {
    cdnBase: '',
    albums: albums.map((album) => {
      const placement = placementById.get(album.id);
      if (!placement) return album;
      // Sanity-check the shared grid contract; the renderer derives photo
      // centers from `computeAlbumGrid`, not from this manifest.
      computeAlbumGrid(album.photos.length, album.gridColumns, album.soundtrack !== null);
      return { ...album, position: placement.position, bounds: placement.bounds };
    }),
  };
}
