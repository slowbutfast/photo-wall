import { Suspense } from 'react';
import { connection } from 'next/server';

import PhotoWallApp from '@/components/PhotoWallApp';
import { determineAutoMood } from '@/lib/lighting/nyTimeMood';
import { getWallSummary } from '@/lib/manifest';

async function GalleryContent() {
  await connection();

  const initialWall = await getWallSummary();
  const initialMood = determineAutoMood(new Date());

  return <PhotoWallApp initialWall={initialWall} initialMood={initialMood} />;
}

/**
 * Public gallery entry point.
 *
 * `connection()` keeps the request dynamic (the wall manifest is cache-tagged
 * and invalidated by admin mutations) while the initial NYC solar mood is
 * computed deterministically on the server with offline `suncalc`. The runtime
 * data access sits inside a Suspense boundary so Cache Components can render
 * the route shell.
 */
export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="gallery-canvas-loading" aria-hidden="true" />}>
      <GalleryContent />
    </Suspense>
  );
}
