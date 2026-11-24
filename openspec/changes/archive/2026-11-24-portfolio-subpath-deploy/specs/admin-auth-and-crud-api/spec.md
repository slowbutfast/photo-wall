## MODIFIED Requirements

### Requirement: Hardened route-handler authentication and CSRF protection
Admin authentication (`GET`, `POST`, `DELETE` at `/api/admin/auth`) SHALL live inside route handlers (not middleware). It SHALL rate-limit login attempts (`429 Too Many Requests`) keyed by a client identifier that trusts `X-Forwarded-For` (N hops from the right) and `X-Real-IP` only when `TRUSTED_PROXY_HOPS` is configured, returning the `'direct'` key otherwise. It SHALL reject any configured `ADMIN_PASSWORD` shorter than 16 characters, so that password can never authenticate (returning `false` per request without throwing), and it SHALL compare passwords via SHA-256 + `timingSafeEqual`. It SHALL issue an `HttpOnly`, `SameSite=Lax` (`Secure` in production) JWT cookie named `photowall_session` with `Path` equal to `BASE_PATH` (`/photos`), and clear it with the same name and `Path`. It SHALL reject unauthenticated mutations with `401 Unauthorized` and mutating requests whose `Origin` host is not a trusted origin host with `403 Forbidden`. Trusted origin hosts are the request's `Host`, its `x-forwarded-host` values, the host of `request.url`, and every host in the comma-separated `TRUSTED_ORIGIN_HOSTS` env var (trimmed, lower-cased, empty entries ignored).

#### Scenario: Session status endpoint reports authentication state
- **WHEN** a client sends `GET /api/admin/auth`
- **THEN** the endpoint SHALL return `{ authenticated: true | false }` without leaking secrets

#### Scenario: Brute-force login attempts are rate-limited
- **WHEN** repeated invalid password attempts exceed the login rate limit
- **THEN** `POST /api/admin/auth` SHALL respond with `429 Too Many Requests`

#### Scenario: Unauthenticated or cross-origin mutation is rejected
- **WHEN** a request mutates `/api/admin/*` without a valid session cookie or with a mismatched `Origin` header
- **THEN** the route SHALL reject with `401 Unauthorized` or `403 Forbidden` respectively

#### Scenario: Session cookie is scoped to the base path
- **WHEN** a successful `POST /api/admin/auth` issues a session and a later `DELETE /api/admin/auth` clears it
- **THEN** both `Set-Cookie` headers SHALL use the name `photowall_session` and `Path=/photos`, and neither SHALL contain `Path=/;`

#### Scenario: Proxy origin allowed through TRUSTED_ORIGIN_HOSTS
- **WHEN** `TRUSTED_ORIGIN_HOSTS` is `gregory-lazatin.com, www.gregory-lazatin.com` and a mutation arrives with `Origin: https://gregory-lazatin.com` and `Host: photo-wall.vercel.app`, with no `x-forwarded-host`
- **THEN** `isSameOriginRequest` SHALL return `true`

#### Scenario: Unlisted origin still rejected when TRUSTED_ORIGIN_HOSTS is set
- **WHEN** `TRUSTED_ORIGIN_HOSTS` is `gregory-lazatin.com` and a mutation arrives with `Origin: https://evil.example` and `Host: photo-wall.vercel.app`
- **THEN** `isSameOriginRequest` SHALL return `false`
