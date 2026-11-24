import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import AdminLoginForm from '@/components/admin/AdminLoginForm';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { withBase } from '@/lib/basePath';

export const metadata: Metadata = {
  title: 'Curator Sign In — Chiaroscuro Gallery',
  robots: { index: false, follow: false },
};

async function LoginContent() {
  await connection();
  if (process.env.ADMIN_ENABLED !== 'true') notFound();

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token && (await verifySessionToken(token))) {
    redirect(withBase('/admin'));
  }

  return <AdminLoginForm />;
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="admin-login-screen" aria-hidden="true" />}>
      <LoginContent />
    </Suspense>
  );
}
