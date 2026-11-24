import { defineConfig } from 'drizzle-kit';

// Same precedence as `resolveDatabaseConfig` in src/db/index.ts, duplicated
// because drizzle-kit loads this file outside Next's module resolution.
// DATABASE_* wins over the Vercel Turso integration's TURSO_* variables.
const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:./data/photo-wall.db';
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

export default defineConfig(
  url.startsWith('libsql:')
    ? {
        dialect: 'turso',
        schema: './src/db/schema.ts',
        out: './drizzle',
        dbCredentials: { url, authToken },
      }
    : {
        dialect: 'sqlite',
        schema: './src/db/schema.ts',
        out: './drizzle',
        dbCredentials: { url },
      },
);
