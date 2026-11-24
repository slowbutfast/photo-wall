'use client';

/**
 * Architectural login card on the dark gallery backdrop. Posts to
 * `withBase('/api/admin/auth')`; a successful login does a full navigation to
 * the server-gated Studio so the session cookie is verified by `src/proxy.ts`
 * and again by the page itself.
 */

import { useState, type FormEvent } from 'react';

import { withBase } from '@/lib/basePath';

export default function AdminLoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(withBase('/api/admin/auth'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Incorrect password.',
        );
        return;
      }
      setPassword('');
      window.location.assign(withBase('/admin'));
    } catch {
      setError('Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-screen">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <header className="admin-login-header">
          <p className="admin-login-eyebrow">Chiaroscuro Gallery</p>
          <h1 className="admin-login-title">Curator Studio</h1>
          <p className="admin-login-sub">Private wall management</p>
        </header>

        <label className="admin-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <p className="admin-error">{error}</p> : null}

        <button type="submit" className="admin-button admin-button-primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </main>
  );
}
