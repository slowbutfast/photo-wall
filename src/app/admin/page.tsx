import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import CuratorStudio from '@/components/admin/CuratorStudio';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { withBase } from '@/lib/basePath';
import { determineAutoMood } from '@/lib/lighting/nyTimeMood';

export const metadata: Metadata = {
  title: 'Curator Studio — Chiaroscuro Gallery',
  robots: { index: false, follow: false },
};

async function StudioContent() {
  await connection();
  if (process.env.ADMIN_ENABLED !== 'true') notFound();

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    redirect(withBase('/admin/login'));
  }

  return <CuratorStudio initialMood={determineAutoMood(new Date())} />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="studio-loading" aria-hidden="true" />}>
      <StudioContent />
    </Suspense>
  );
}
