/**
 * Next.js server boot hook: resume any `'deleting'` tombstones left behind by a
 * crash between storage/CDN purge and row removal.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  try {
    const { sweepPendingDeletions } = await import('./lib/storage/deletions');
    const result = await sweepPendingDeletions();
    if (result.failed > 0) {
      console.error(
        `[photo-wall] ${result.failed} pending deletion tombstone(s) still failing; retry from the Curator Drawer`,
      );
    }
  } catch (error) {
    console.error('[photo-wall] pending deletion sweep failed', error);
  }
}
