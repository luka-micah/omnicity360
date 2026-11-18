# Omnicity360

A multi-city hotel booking marketplace for Nigeria. This repository is a modular monolith
monorepo containing the API, shared domain logic, API contracts, and (in later phases) the web
and Android clients.

> **Governing specification:** [`BUILD_SPEC.md`](./BUILD_SPEC.md). Read it before changing
> product behaviour. Material decisions are recorded in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## Current status

**Phase 4 — Search and pending bookings** is in progress. The monorepo includes a responsive web
app with a marketplace landing page, partner hotel onboarding, and an admin hotel review queue.
Customer and partner authentication is connected to the API. Phase 1 provides the API foundation, domain
package, contracts, Prisma schema, migrations, seed, tests, and CI. Phase 2 adds registration,
login, refresh-token rotation, logout/session revocation, password reset/change, email verification,
profiles, hotel memberships, staff invitations, RBAC, tenant isolation, audit logging, and per-route
rate limits.

Public search, nightly availability, server-calculated quotes, and idempotent guest/customer booking
requests with short inventory holds are implemented. Partner inventory/rate management, customer
booking retrieval/cancellation, notifications, finance, Android, and live payment processing remain
incomplete — see [`docs/implementation-plan.md`](./docs/implementation-plan.md). The web app labels
its sample stay cards as illustrative; search results come from approved listings. Booking requests
remain pending and are **not confirmed**: no payment provider or charge is connected. Live payment
processing is intentionally **blocked** until marketplace collection and settlement are validated
in writing (BUILD_SPEC §4.8, §16). Hotel documents and images remain metadata-only external URLs.
Transactional email is not configured, so reset/verification raw tokens are exposed only in
development/test.

## Repository layout

```text
apps/
  api/                 Fastify + TypeScript API
    prisma/            Prisma schema, migrations, seed
    src/               API source
    test/              API integration tests
  web/                 React + Vite customer, partner, and admin experiences
packages/
  contracts/           Zod request/response schemas (wire boundary)
  domain/              Pure business rules: money, dates, state machines
docs/
  implementation-plan.md
  ARCHITECTURE.md
  DECISIONS.md
  SECURITY.md
  RUNBOOK.md
  API.md
BUILD_SPEC.md          Product and engineering specification
```

## Requirements

- Node.js >= 20
- pnpm 9.x
- PostgreSQL 14+ (16 recommended)
- Redis (not required through Phase 2; introduced for background jobs or distributed rate limits
  later)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
#    The API loads apps/api/.env automatically at startup.
cp .env.example apps/api/.env
# Edit apps/api/.env and set DATABASE_URL and SESSION_SECRET.
# On PowerShell: Copy-Item .env.example apps/api/.env

# 3. Generate the Prisma client
pnpm db:generate

# 4. Apply committed migrations and seed fictional development data
pnpm db:migrate:deploy
pnpm db:seed

# 5. Optional: prepare the test database (must end in "_test")
#    psql -U postgres -c "CREATE DATABASE hotel_marketplace_test;"
#    Set DATABASE_URL to the test database and run pnpm db:migrate:deploy.
#    Tests also accept TEST_DATABASE_URL and refuse non-"_test" databases.

# 6. Start the API
pnpm dev
```

The API starts on `http://localhost:3001` by default:

- `GET /` — redirects to Swagger UI
- `GET /health` — simple health check
- `GET /health/live` — liveness
- `GET /health/ready` — readiness (checks PostgreSQL)
- `GET /docs` — Swagger UI
- `GET /docs/json` — OpenAPI 3.0 document
- `GET /api/v1` — API metadata
- `POST /api/v1/auth/*` — registration, login, refresh, logout, password reset/change, email verify
- `GET/PATCH /api/v1/me/profile` — current user profile
- `GET /api/v1/me/sessions`, `DELETE /api/v1/me/sessions/:id` — session management
- `GET /api/v1/me/memberships` — hotel memberships
- `POST /api/v1/partner/staff/invitations` — invite an existing user
- `GET/DELETE /api/v1/partner/hotels/:hotelId/staff*` — staff listing/revocation

See [`docs/API.md`](./docs/API.md) for request/response details, token lifetimes, RBAC, and rate
limits.

### Web app

```bash
# Start the API separately, then:
pnpm dev:web
```

The web app is served at `http://localhost:3000` and uses
`VITE_API_BASE_URL=http://localhost:3001/api/v1` by default. Change it in the web build environment
to point at the deployed API. The partner portal supports hotel drafts and submission; the admin portal supports review and
approval. Customer search uses current approved hotel inventory and server-calculated prices. The
booking form saves a pending request and temporary hold only; payment is unavailable and no stay is
confirmed.

### Development accounts (fictional, seeded)

| Role     | Email                   | Password             |
| -------- | ----------------------- | -------------------- |
| Admin    | `admin@example.test`    | `Admin123!Change`    |
| Customer | `customer@example.test` | `Customer123!Change` |
| Partner  | `partner@example.test`  | `Partner123!Change`  |

These accounts exist only in development/test databases. Never reuse these passwords.

## Quality gates

```bash
pnpm format:check   # Prettier
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit for every package
pnpm test           # Vitest: 159 tests (69 domain, 28 contracts, 62 API)
pnpm build          # Compile packages and API
pnpm build:web      # Type-check and build the web app
```

`pnpm typecheck`, `pnpm test`, and `pnpm dev` first build the shared packages so that package
imports resolve to emitted declarations. Run `pnpm build` before `pnpm start`.

API integration tests require a migrated PostgreSQL database whose name ends in `_test`. See
[`docs/RUNBOOK.md`](./docs/RUNBOOK.md#test-database) for setup. The test setup refuses to run
against any other database.

## Database

```bash
pnpm db:generate        # Prisma client
pnpm db:migrate         # Create/apply a development migration
pnpm db:migrate:deploy  # Apply committed migrations (CI/staging/production)
pnpm db:seed            # Fictional development data
pnpm db:studio          # Prisma Studio
```

Migrations are version-controlled under `apps/api/prisma/migrations`. Apply committed
migrations with `prisma migrate deploy`; do not use `db push` against shared environments.

## Configuration

All configuration is validated at startup by `apps/api/src/config/env.ts`. See
[`.env.example`](./.env.example) for the full list. Secrets must never be committed. The API
refuses to start if required configuration is missing or malformed, and production refuses the
development `SESSION_SECRET` default.

Auth defaults are 15-minute access tokens, 30-day refresh tokens, and 90-day refresh tokens with
`rememberMe`. Override with `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`,
`REMEMBER_ME_TTL_DAYS`, `PASSWORD_RESET_TTL_MINUTES`, and `EMAIL_VERIFICATION_TTL_HOURS`.

## Security notes

- Access tokens are short-lived JWTs bound to server-side sessions; every protected request
  re-checks the session and user. Refresh tokens are opaque, stored hashed, rotated, and revocable.
- Browser refresh cookies are HttpOnly, SameSite=Lax, Secure in production, and scoped to
  `/api/v1/auth`. Mobile clients use secure storage for the refresh token.
- Server-side authorization and tenant isolation are mandatory for every protected operation.
  Unauthorized hotel access returns 404 to prevent ID enumeration.
- Prices, commissions, inventory, roles, and payment status are always recalculated/verified on
  the server. Client input is never trusted for financial values.
- Password reset and email-verification tokens are hashed, single-use, and expiring. Development
  token fields are never returned in production.
- Rate limits are in-memory per API process; use a shared store before horizontal scaling.
- Webhooks must be signature-validated, deduplicated, and idempotent.
- API errors return a stable shape with a request ID; stack traces and internals are never
  returned to clients.
- See [`docs/SECURITY.md`](./docs/SECURITY.md).
# omnicity360
