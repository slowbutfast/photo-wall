import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

const DEFAULT_DATABASE_URL = 'file:./data/photo-wall.db';
const MIGRATIONS_FOLDER = './drizzle';

export interface DatabaseConfig {
  url: string;
  authToken?: string;
}

/**
 * Resolve the libSQL connection from the environment. `DATABASE_*` wins so a
 * maintainer can override the Vercel Turso integration (which injects
 * `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`); empty strings count as unset. The
 * token is passed to the client separately and never embedded in the URL.
 */
export function resolveDatabaseConfig(
  env: Partial<Record<string, string | undefined>>,
): DatabaseConfig {
  return {
    url: env.DATABASE_URL || env.TURSO_DATABASE_URL || DEFAULT_DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
  };
}

let databaseForTesting: Database | null = null;
let cachedDatabase: Promise<Database> | null = null;

async function ensureDatabaseDirectory(url: string): Promise<void> {
  if (!url.startsWith('file:') || url.startsWith('file::memory:')) return;
  const filePath = url.slice('file:'.length);
  if (!filePath || filePath === ':memory:') return;
  await mkdir(dirname(filePath), { recursive: true });
}

/**
 * Creates a LibSQL connection with foreign keys enforced, then applies the
 * checked-in Drizzle migrations so fresh databases (including `file::memory:`
 * test databases) are immediately usable.
 */
export async function createDatabase({ url, authToken }: DatabaseConfig): Promise<Database> {
  await ensureDatabaseDirectory(url);
  const client = createClient({ url, authToken });
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/**
 * Lazy singleton used by every route handler and the wall manifest. A rejected
 * init clears the cache so the next call retries: on Vercel a warm instance can
 * live for minutes, and one transient error (or a first-boot migration race)
 * must not fail every request it serves. Concurrent callers share one attempt.
 */
export async function getDb(): Promise<Database> {
  if (databaseForTesting) return databaseForTesting;
  if (!cachedDatabase) {
    cachedDatabase = createDatabase(resolveDatabaseConfig(process.env)).catch((error: unknown) => {
      cachedDatabase = null;
      throw error;
    });
  }
  return cachedDatabase;
}

export function setDbForTesting(db: Database | null): void {
  databaseForTesting = db;
}

export function resetDbForTesting(): void {
  databaseForTesting = null;
  cachedDatabase = null;
}

export { schema };
