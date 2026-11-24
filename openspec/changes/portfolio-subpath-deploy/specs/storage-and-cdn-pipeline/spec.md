## ADDED Requirements

### Requirement: Public CDN base resolution
`getCdnBase()` SHALL return the base the browser uses to load photos. With `STORAGE_DRIVER=bunny`, it SHALL return `CDN_BASE_URL` when set and non-empty, falling back to `BUNNY_PULL_ZONE_URL`, and it SHALL throw when neither is set. With the local driver, it SHALL return `withBase('/api/local-uploads')`. Bunny cache purges SHALL keep targeting `BUNNY_PULL_ZONE_URL` regardless of `CDN_BASE_URL`.

#### Scenario: Custom hostname wins for public URLs
- **WHEN** `STORAGE_DRIVER=bunny`, `BUNNY_PULL_ZONE_URL=https://zone.b-cdn.net` and `CDN_BASE_URL=https://cdn.gregory-lazatin.com`
- **THEN** `getCdnBase()` SHALL return `https://cdn.gregory-lazatin.com`, and `buildPurgeUrl` SHALL still be called with `https://zone.b-cdn.net`

#### Scenario: Pull zone fallback
- **WHEN** `STORAGE_DRIVER=bunny`, `BUNNY_PULL_ZONE_URL=https://zone.b-cdn.net` and `CDN_BASE_URL` is unset or empty
- **THEN** `getCdnBase()` SHALL return `https://zone.b-cdn.net`

#### Scenario: Local driver base carries the base path
- **WHEN** the local storage driver is active
- **THEN** `getCdnBase()` SHALL return `/photos/api/local-uploads`, and a `buildLodUrl` result built from it SHALL resolve to a `200` image under the running dev server

#### Scenario: Demo manifest base carries the base path
- **WHEN** a `?demo=` fake manifest is built
- **THEN** its `cdnBase` SHALL be `/photos/demo`
