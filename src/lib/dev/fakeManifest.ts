/**
 * Deterministic demo manifests for visual parity (`?demo=4`) and the macro
 * performance fixture (`?demo=1000`).
 *
 * `four` is a byte-for-byte reproduction of the pinned playground's four albums
 * (`playgrounds/photo_wall_playground.html`, `dcc7a048`): same titles,
 * captions, 12/15/12/16 counts, 4/5/4/4 columns, world positions, soundtracks,
 * aspects and the exact procedural `PALETTES` SVG art. That is what makes the
 * `pixelmatch` wall-canvas gate meaningful.
 *
 * `thousand` stays the 50 x 20 production stress fixture (real committed JPEGs)
 * used by the macro-tier budget.
 */

import { computeAlbumGrid, computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';

export type DemoFixture = 'four' | 'thousand';

/** Number of committed demo photographs (`public/demo/photo-NN.jpg`). */
const DEMO_PHOTO_FILES = 48;
/** Long edge of the committed demo photographs. */
const DEMO_PHOTO_LONG_EDGE = 640;

/** Mixed salon aspect ratios, cycled per photo: 4:5, 3:2, 2:3. */
const ASPECTS = [4 / 5, 3 / 2, 2 / 3] as const;

/** Aspect of `photo-NN.jpg` is `ASPECTS[(NN - 1) % 3]`. */
function demoPhoto(index: number): { path: string; aspectRatio: number; width: number; height: number } {
  const aspectIndex = index % ASPECTS.length;
  const aspectRatio = ASPECTS[aspectIndex];
  const variant = (Math.floor(index / ASPECTS.length) * 7) % (DEMO_PHOTO_FILES / ASPECTS.length);
  const file = variant * ASPECTS.length + aspectIndex + 1;
  return {
    path: `photo-${String(file).padStart(2, '0')}.jpg`,
    aspectRatio,
    width: aspectRatio >= 1 ? DEMO_PHOTO_LONG_EDGE : Math.round(DEMO_PHOTO_LONG_EDGE * aspectRatio),
    height: aspectRatio >= 1 ? Math.round(DEMO_PHOTO_LONG_EDGE / aspectRatio) : DEMO_PHOTO_LONG_EDGE,
  };
}

const PALETTES = {
  tokyo: ['#242c3c', '#5e4b56', '#c97b63', '#f4d3a1'],
  coast: ['#7ea8be', '#b8d0dc', '#45697a', '#f7efe5'],
  brutal: ['#9b9890', '#6d6b65', '#343330', '#e6e4de'],
  alpine: ['#334155', '#64748b', '#1e293b', '#f8fafc'],
  desert: ['#c99672', '#a8674a', '#593426', '#fae5c8'],
} as const;

const PLAYGROUND_ASPECTS = [1.45, 0.72, 1.33, 0.78, 1.0, 1.5, 0.75, 1.28, 0.82, 1.4] as const;

/** Exact `makePhotoSvg` from the pinned playground. */
function makePhotoSvg(seed: number, palette: readonly string[], aspect: number): string {
  const w = aspect >= 1 ? 440 : Math.round(440 * aspect);
  const h = aspect >= 1 ? Math.round(440 / aspect) : 440;
  const [c1, c2, c3, accent] = palette;
  const sunX = 18 + ((seed * 37) % 64);
  const sunY = 16 + ((seed * 29) % 36);
  const hY = 50 + ((seed * 17) % 24);
  const variant = seed % 3;
  const shape =
    variant === 0
      ? `<path d="M 0 ${h} L 0 ${h * (hY / 100)} Q ${w * 0.32} ${h * ((hY - 14) / 100)} ${w * 0.62} ${h * (hY / 100)} T ${w} ${h * ((hY - 5) / 100)} L ${w} ${h} Z" fill="${c3}" opacity="0.84"/>`
      : variant === 1
        ? `<rect x="${w * 0.14}" y="${h * 0.24}" width="${w * 0.36}" height="${h * 0.76}" fill="${c3}" opacity="0.74"/><rect x="${w * 0.56}" y="${h * 0.42}" width="${w * 0.28}" height="${h * 0.58}" fill="${c2}" opacity="0.86"/>`
        : `<path d="M 0 ${h} L ${w * 0.35} ${h * (hY / 100 - 0.12)} L ${w * 0.72} ${h * (hY / 100 + 0.04)} L ${w} ${h * (hY / 100 - 0.08)} L ${w} ${h} Z" fill="${c3}" opacity="0.82"/>`;

  const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
          <defs>
            <linearGradient id="g${seed}" x1="0" y1="0" x2="0.15" y2="1">
              <stop offset="0%" stop-color="${c1}"/>
              <stop offset="62%" stop-color="${c2}"/>
              <stop offset="100%" stop-color="${c3}"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g${seed})"/>
          <circle cx="${sunX}%" cy="${sunY}%" r="${Math.min(w, h) * 0.1}" fill="${accent}" opacity="0.85"/>
          ${shape}
          <path d="M 0 ${h} L 0 ${h * ((hY + 12) / 100)} Q ${w * 0.45} ${h * ((hY + 4) / 100)} ${w} ${h * ((hY + 14) / 100)} L ${w} ${h} Z" fill="#0d0d0b" opacity="0.24"/>
        </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface PlaygroundAlbumSeed {
  key: keyof typeof PALETTES;
  title: string;
  caption: string;
  dateLabel: string | null;
  locationLabel: string | null;
  /** Production world units, y-up (playground CSS y=-440 maps to +4.40). */
  position: { x: number; y: number };
  columns: number;
  photos: number;
  seedOffset: number;
  soundtrack: { videoId: string; artist: string; title: string; durationSec: number } | null;
}

/** Four pinned playground albums, in playground order. */
const PLAYGROUND_ALBUM_SEEDS: readonly PlaygroundAlbumSeed[] = [
  {
    key: 'tokyo',
    title: 'Tokyo Nocturnes',
    caption: '35mm autumn studies, 2025.',
    dateLabel: 'October 2025',
    locationLabel: 'Shibuya, Tokyo',
    position: { x: -11.8, y: 4.4 },
    columns: 4,
    photos: 12,
    seedOffset: 1,
    soundtrack: { videoId: 'jfKfPfyJRdk', artist: 'Lofi Girl', title: 'Tokyo Midnight', durationSec: 205 },
  },
  {
    key: 'coast',
    title: 'Pacific Coastline',
    caption: 'Low-tide fog along Highway 1.',
    dateLabel: 'August 2025',
    locationLabel: 'Big Sur, CA',
    position: { x: 0, y: 4.4 },
    columns: 5,
    photos: 15,
    seedOffset: 3,
    soundtrack: { videoId: '5qap5aO4i9A', artist: 'ChilledCow', title: 'Coastal Drift', durationSec: 184 },
  },
  {
    key: 'brutal',
    title: 'Brutalist Concrete',
    caption: 'Monochrome cast shadow geometry.',
    dateLabel: null,
    locationLabel: null,
    position: { x: 11.8, y: 4.4 },
    columns: 4,
    photos: 12,
    seedOffset: 5,
    soundtrack: null,
  },
  {
    key: 'alpine',
    title: 'Alpine Winter',
    caption: 'Medium format prints, January.',
    dateLabel: 'January 2025',
    locationLabel: 'Zermatt, Switzerland',
    position: { x: -11.8, y: -4.6 },
    columns: 4,
    photos: 16,
    seedOffset: 7,
    soundtrack: { videoId: 'DWcJFNfaw9c', artist: 'Ryuichi', title: 'Winter Study', durationSec: 242 },
  },
];

function buildPlaygroundPhotos(seed: PlaygroundAlbumSeed): WallPhoto[] {
  return Array.from({ length: seed.photos }, (_, index) => {
    const aspectRatio = PLAYGROUND_ASPECTS[(index + seed.seedOffset) % PLAYGROUND_ASPECTS.length];
    const width = aspectRatio >= 1 ? 440 : Math.round(440 * aspectRatio);
    const height = aspectRatio >= 1 ? Math.round(440 / aspectRatio) : 440;
    const num = String(index + 1).padStart(2, '0');
    return {
      id: `${seed.key}-${index}`,
      storagePath: makePhotoSvg(seed.seedOffset * 31 + index + 1, PALETTES[seed.key], aspectRatio),
      width,
      height,
      aspectRatio,
      dominantColor: PALETTES[seed.key][0],
      thumbHash: null,
      sortOrder: index,
    };
  });
}

function buildPlaygroundAlbums(): WallAlbum[] {
  return PLAYGROUND_ALBUM_SEEDS.map((seed, index) => {
    const bounds = computeAlbumGrid(seed.photos, seed.columns, seed.soundtrack !== null).bounds;
    return {
      id: `demo-${seed.key}`,
      slug: `demo-${seed.key}`,
      title: seed.title,
      description: seed.caption,
      gridColumns: seed.columns,
      sortOrder: index,
      position: seed.position,
      bounds,
      cameraName: null,
      dateLabel: seed.dateLabel,
      locationLabel: seed.locationLabel,
      soundtrack: seed.soundtrack,
      photos: buildPlaygroundPhotos(seed),
    } satisfies WallAlbum;
  });
}

const CAPTIONS = [
  'Autumn studies in available light.',
  'Low-tide fog along the coast.',
  'Monochrome cast shadow geometry.',
  'Medium format prints, January.',
  'Colour field notes from the road.',
];

const LOCATIONS = ['Tokyo', 'Big Sur', 'Berlin', 'Zermatt'];

const PALETTE = ['#8d6a52', '#5d6b78', '#7b7d72', '#a8866a', '#4d5560', '#9aa3a8'];

/** The 50-album stress fixture: 50 x 20 = 1,000 prints, 5-column salon grid. */
const THOUSAND_ALBUM_TITLES = [
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

const SOUNDTRACK = {
  videoId: 'aqz-KE-bpKQ',
  artist: 'Ryuichi',
  title: 'Winter Study',
  durationSec: 205,
};

interface DemoAlbumSeed {
  title: string;
  photos: number;
  gridColumns: number;
  soundtrack: boolean;
}

function buildStressAlbums(seeds: readonly DemoAlbumSeed[]): WallAlbum[] {
  const placements = computeWallGridPositions(
    seeds.map((seed, index) => ({
      id: `demo-album-${String(index + 1).padStart(2, '0')}`,
      status: 'published' as const,
      photoCount: seed.photos,
      gridColumns: seed.gridColumns,
      sortOrder: index,
      hasSoundtrack: seed.soundtrack,
    })),
  );
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  return seeds.map((seed, index) => {
    const id = `demo-album-${String(index + 1).padStart(2, '0')}`;
    const placement = placementById.get(id);
    if (!placement) throw new Error(`demo fixture is missing a placement for ${id}`);

    const photos: WallPhoto[] = Array.from({ length: seed.photos }, (_, photoIndex) => {
      const globalIndex = index * 3 + photoIndex;
      const file = demoPhoto(globalIndex);
      return {
        id: `${id}-photo-${String(photoIndex + 1).padStart(2, '0')}`,
        storagePath: file.path,
        width: file.width,
        height: file.height,
        aspectRatio: file.aspectRatio,
        dominantColor: PALETTE[(index + photoIndex) % PALETTE.length],
        thumbHash: null,
        sortOrder: photoIndex,
      };
    });

    return {
      id,
      slug: id,
      title: seed.title,
      description: CAPTIONS[index % CAPTIONS.length],
      gridColumns: seed.gridColumns,
      sortOrder: index,
      position: placement.position,
      bounds: placement.bounds,
      cameraName: null,
      dateLabel: index % 2 === 0 ? 'October 2025' : null,
      locationLabel: LOCATIONS[index % LOCATIONS.length],
      soundtrack: seed.soundtrack ? { ...SOUNDTRACK } : null,
      photos,
    } satisfies WallAlbum;
  });
}

/**
 * Build a demo manifest. `four` is the pinned playground parity fixture; `thousand`
 * is the 50 x 20 macro stress fixture.
 */
export function buildDemoWallSummary(fixture: DemoFixture): WallSummary {
  if (fixture === 'four') {
    return { cdnBase: '/demo', albums: buildPlaygroundAlbums() };
  }

  return {
    cdnBase: '/demo',
    albums: buildStressAlbums(
      THOUSAND_ALBUM_TITLES.map((title, index) => ({
        title,
        photos: 20,
        gridColumns: 5,
        // One soundtrack in the first row keeps the plaque path exercised.
        soundtrack: index === 2,
      })),
    ),
  };
}

/** Sanity check used by the fixture test: photo aspects match the committed files. */
export function demoPhotoAspectFor(index: number): number {
  return demoPhoto(index).aspectRatio;
}

/** Sanity check used by the fixture test: the committed file for a photo index. */
export function demoPhotoPathFor(index: number): string {
  return demoPhoto(index).path;
}

/** Grid geometry of a demo album (exposed for tests/parity checks). */
export function demoAlbumGrid(photos: number, gridColumns: number) {
  return computeAlbumGrid(photos, gridColumns, false);
}
