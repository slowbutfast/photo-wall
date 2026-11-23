import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

const DEFAULT_DATABASE_URL = 'file:./data/photo-wall.db';
const MIGRATIONS_FOLDER = './drizzle';

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
export async function createDatabase(url: string): Promise<Database> {
  await ensureDatabaseDirectory(url);
  const client = createClient({ url });
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Lazy singleton used by every route handler and the wall manifest. */
export async function getDb(): Promise<Database> {
  if (databaseForTesting) return databaseForTesting;
  if (!cachedDatabase) {
    cachedDatabase = createDatabase(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
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
