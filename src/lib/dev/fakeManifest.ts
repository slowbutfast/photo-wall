/**
 * Deterministic demo manifests for visual parity (`?demo=4`) and the macro
 * performance fixture (`?demo=1000`).
 *
 * Both fixtures use the shared production geometry (`computeWallGridPositions` /
 * `computeAlbumGrid`), so the demo exercises the exact island placement and
 * salon-grid contract. Photographs are **real JPEGs** committed under
 * `public/demo/` (see
 * `openspec/changes/dom-wall-engine/fixtures/generate-demo-photos.mjs`) — not SVG
 * data URLs — and are requested through `/demo/photo-NN.jpg?width=…`, which the
 * static server answers by ignoring the (LOD) query string.
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

const CAPTIONS = [
  'Autumn studies in available light.',
  'Low-tide fog along the coast.',
  'Monochrome cast shadow geometry.',
  'Medium format prints, January.',
  'Colour field notes from the road.',
];

const CAMERAS = ['Leica M6', 'Fujifilm X100VI', 'Ricoh GR IIIx', 'Hasselblad 500C/M'];
const LOCATIONS = ['Tokyo', 'Big Sur', 'Berlin', 'Zermatt'];

const PALETTE = ['#8d6a52', '#5d6b78', '#7b7d72', '#a8866a', '#4d5560', '#9aa3a8'];

/** The four-album parity fixture: 12-16 prints each, 4-column salon grid. */
const FOUR_ALBUM_FIXTURE: ReadonlyArray<{ title: string; photos: number; soundtrack: boolean }> = [
  { title: 'Tokyo Nocturnes', photos: 14, soundtrack: true },
  { title: 'Pacific Coastline', photos: 12, soundtrack: false },
  { title: 'Brutalist Concrete', photos: 16, soundtrack: false },
  { title: 'Alpine Winter', photos: 13, soundtrack: false },
];

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

function buildAlbums(seeds: readonly DemoAlbumSeed[]): WallAlbum[] {
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
      cameraName: CAMERAS[index % CAMERAS.length],
      dateLabel: index % 2 === 0 ? 'October 2025' : null,
      locationLabel: LOCATIONS[index % LOCATIONS.length],
      soundtrack: seed.soundtrack ? { ...SOUNDTRACK } : null,
      photos,
    } satisfies WallAlbum;
  });
}

/**
 * Build a demo manifest. `four` is the pinned parity fixture (4 albums, 12-16
 * prints each); `thousand` is the 50 x 20 macro stress fixture.
 */
export function buildDemoWallSummary(fixture: DemoFixture): WallSummary {
  if (fixture === 'four') {
    return {
      cdnBase: '/demo',
      albums: buildAlbums(
        FOUR_ALBUM_FIXTURE.map((album) => ({
          title: album.title,
          photos: album.photos,
          gridColumns: 4,
          soundtrack: album.soundtrack,
        })),
      ),
    };
  }

  return {
    cdnBase: '/demo',
    albums: buildAlbums(
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
