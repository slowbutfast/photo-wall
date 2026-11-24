## ADDED Requirements

### Requirement: Hosted libSQL connection resolution
The database client SHALL resolve its URL as `DATABASE_URL`, then `TURSO_DATABASE_URL`, then `file:./data/photo-wall.db`. It SHALL resolve its auth token as `DATABASE_AUTH_TOKEN`, then `TURSO_AUTH_TOKEN`, then none. Empty strings SHALL count as unset at every step. The resolved token SHALL be passed to `createClient` as `authToken` and SHALL never be logged or embedded in the URL. `drizzle.config.ts` SHALL resolve `dbCredentials.url` and `dbCredentials.authToken` with the same precedence, using the `turso` dialect when the resolved URL starts with `libsql:` and `sqlite` otherwise.

#### Scenario: Turso integration env is used when DATABASE_URL is unset
- **WHEN** `DATABASE_URL` is unset, `TURSO_DATABASE_URL=libsql://photo-wall-x.turso.io` and `TURSO_AUTH_TOKEN=t0k`
- **THEN** `createClient` SHALL be called with `{ url: 'libsql://photo-wall-x.turso.io', authToken: 't0k' }`

#### Scenario: Explicit DATABASE_* overrides the integration
- **WHEN** `DATABASE_URL=libsql://other.turso.io`, `DATABASE_AUTH_TOKEN=a`, `TURSO_DATABASE_URL=libsql://photo-wall-x.turso.io` and `TURSO_AUTH_TOKEN=b`
- **THEN** `createClient` SHALL be called with `{ url: 'libsql://other.turso.io', authToken: 'a' }`

#### Scenario: Local default is unchanged
- **WHEN** none of the four variables is set (or all are empty strings)
- **THEN** `createClient` SHALL be called with `url: 'file:./data/photo-wall.db'` and `authToken` undefined, and the data directory SHALL be created as before

### Requirement: Migrations ship with serverless functions
Because `createDatabase` applies Drizzle migrations at runtime from `./drizzle`, `next.config.ts` SHALL declare `outputFileTracingIncludes` so that `drizzle/**/*` is copied into every server function's trace.

#### Scenario: Build trace contains the migration journal
- **WHEN** `npm run build` completes
- **THEN** the `.nft.json` trace for the `/api/wall` route handler (and the root page) SHALL list `drizzle/meta/_journal.json` and `drizzle/0000_init.sql`

#### Scenario: First request on an empty hosted DB creates the schema
- **WHEN** the deployed app with an empty Turso database receives `GET /photos/api/wall`
- **THEN** it SHALL respond `200` with an empty `albums` array, and the database SHALL then contain the `albums`, `photos` and `__drizzle_migrations` tables

### Requirement: Failed database initialisation is retried
`getDb()` SHALL NOT keep a rejected initialisation promise. If `createDatabase` rejects (network error, migration race, bad credentials), the cached promise SHALL be cleared, so the next `getDb()` call attempts a fresh connection. Concurrent callers during one in-flight attempt SHALL still share that single attempt.

#### Scenario: Transient failure recovers on the next call
- **WHEN** the first `createDatabase` call rejects and the second succeeds
- **THEN** the first `getDb()` SHALL reject, and a subsequent `getDb()` SHALL resolve to a working database, with `createClient` called exactly twice

#### Scenario: Concurrent callers share one attempt
- **WHEN** `getDb()` is called three times before the first initialisation settles
- **THEN** `createClient` SHALL be called exactly once
