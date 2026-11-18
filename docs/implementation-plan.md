# Implementation Plan

> Governing specification: [`BUILD_SPEC.md`](../BUILD_SPEC.md). The spec ends at §17; there is
> no §18. This plan starts from the final instruction section (§17) and Phase 1 (§14).

## 1. Repository assessment (initial)

- **Before this work:** empty repository containing only `BUILD_SPEC.md`. No framework, code,
  tests, migrations, or tooling existed.
- **Implication:** greenfield build. No migration/preservation work was required.
- **Gaps:** every module in the spec was missing — monorepo, API, database, domain rules,
  identity, hotel onboarding, inventory, rates, search, quotes, bookings, payments, finance,
  notifications, admin, web, mobile, CI, and operational documentation.

## 2. Phase 1 — Foundation (milestone 1) — COMPLETE (code-level)

### Delivered

1. **Monorepo**
   - pnpm workspaces: `apps/*`, `packages/*`.
   - Root `package.json`, `pnpm-workspace.yaml`, shared `tsconfig.base.json`.
   - Prettier, ESLint (TypeScript + import ordering), git ignores, `.env.example`.

2. **`packages/domain`** — pure business rules
   - Branded identifiers/date types and validators (`uuid`, `email`, `phoneNumber`, `isoDate`).
   - Integer minor-unit money arithmetic: add/subtract/multiply/divide, compare, sum, exact
     allocation, percentages, discounts, commission, net payable, formatting.
   - Stay-date utilities with check-in inclusive / check-out exclusive semantics, leap-year and
     boundary handling, overlap detection, stay validation, opaque reference generators.
   - Explicit state machines for booking, payment, and hotel lifecycle, plus transition helpers.
   - 64 unit tests.

3. **`packages/contracts`** — wire contracts
   - Zod schemas for auth, hotels/rooms/rates/inventory/policies/commission agreements,
     availability, quotes, bookings, payments/refunds/webhooks, admin, ledger, payouts,
     reconciliation, and audit logs.
   - Money, pagination, date-range, address, contact, and media primitives.
   - Shared inferred TypeScript types for clients and the API.

4. **`apps/api`** — Fastify API foundation
   - Environment validation (Zod) with safe defaults and fail-fast startup.
   - Fastify app factory with:
     - Pino structured logging, request IDs, sensitive-field redaction;
     - Helmet, environment-scoped CORS, global rate limiting, 1 MB body limit;
     - OpenAPI 3.0 + Swagger UI at `/docs`, generated `docs/openapi.json`;
     - central error handler with stable envelope and no leaked internals;
     - liveness/readiness/health endpoints, readiness checking PostgreSQL;
     - graceful shutdown and database connectivity check on boot.
   - Prisma client singleton and password hashing utility (bcrypt, cost 12).

5. **Database**
   - Prisma schema covering identity, hotel/media/documents, room categories, physical rooms,
     rate plans, nightly rates, inventory days/holds, maintenance blocks, cancellation policies,
     bookings/rooms/nights/guests/status history/cancellation requests, payments/provider
     events/refunds, commission agreements/snapshots, double-entry ledger, payout batches/
     payouts/statements, reconciliation runs/items, notifications, audit logs, idempotency.
   - `20261023000000_init` migration SQL generated from the schema.
   - Fictional development seed (admin, customer, partner, two hotels, room categories, rate
     plans, 90 days of inventory, platform cancellation policies).

6. **Tests & CI**
   - Vitest: 64 domain tests + 18 contract-schema tests + 16 API tests = **98 tests**.
   - GitHub Actions: install, Prisma generate/validate/migrate, format, lint, typecheck, test,
     build against PostgreSQL 16.

7. **Documentation**
   - `README.md`, `.env.example`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
     `docs/SECURITY.md`, `docs/RUNBOOK.md`, `docs/API.md`, this plan.

### Commands actually run and results

| Command                                                     | Result                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install`                                              | Passed (484 packages; Prisma client generated separately)                                  |
| `pnpm db:generate`                                          | Passed after fixing two relation issues in the schema                                      |
| `pnpm --filter @hotel-marketplace/api exec prisma validate` | Passed (with a dummy `DATABASE_URL`)                                                       |
| `pnpm build:packages`                                       | Passed                                                                                     |
| `pnpm --filter @hotel-marketplace/domain run test`          | **64/64 passed**                                                                           |
| `pnpm --filter @hotel-marketplace/contracts run test`       | **18/18 passed**                                                                           |
| `pnpm --filter @hotel-marketplace/api run test`             | **16/16 passed** (includes root redirect and favicon)                                      |
| `pnpm lint`                                                 | Passed                                                                                     |
| `pnpm typecheck`                                            | Passed                                                                                     |
| `pnpm format` / `format:check`                              | Passed after formatting                                                                    |
| `pnpm build`                                                | Passed                                                                                     |
| `pnpm docs:api`                                             | Passed; wrote `docs/openapi.json`                                                          |
| `pnpm db:migrate:deploy`                                    | Passed; applied `20261023000000_init` to the configured PostgreSQL database                |
| `pnpm db:seed`                                              | Passed; 3 users, 2 hotels, 4 room categories, 4 rate plans, 360 inventory days, 4 policies |
| API start + `GET /health/ready`                             | Passed; returned `{"status":"ok","checks":{"database":"ok"}}`                              |

### Environment configuration

- Secrets live in `apps/api/.env`, which is git-ignored. The committed template is the root
  `.env.example`; copy it to `apps/api/.env` and fill in real values.
- The API loads `apps/api/.env` automatically via `apps/api/src/config/load-env.ts` regardless of
  the process working directory. Existing shell/CI variables take precedence.
- The Prisma CLI also loads `apps/api/.env`, so database commands work from the repo root scripts.
- Use the provider's direct (non-pooled) host for migrations; switch to the pooled URL for
  serverless runtime traffic if required.

### Known limitations

- No authentication, hotel, inventory, quote, booking, payment, or finance endpoints yet;
  schemas/contracts are ready for them.
- Rate limiting is global only. Per-route abuse protection is required with the routes.
- Redis/BullMQ workers are not introduced yet (not needed until holds/expiry/notifications).
- Payment provider adapter intentionally not implemented; live payments are blocked on written
  provider/marketplace/settlement validation (see `docs/DECISIONS.md` D-007).
- Web and mobile apps are not started.

## 3. First milestone acceptance

| Criterion                            | Status |
| ------------------------------------ | ------ |
| Clean install works                  | ✅     |
| API starts using documented commands | ✅     |
| Database migration and seed work     | ✅     |
| Health endpoint and OpenAPI work     | ✅     |
| Lint, typecheck, tests, build pass   | ✅     |

## 4. Phase 2 — Identity and Access — COMPLETE (code-level)

### Delivered

1. **Schema and migrations**
   - `PartnerProfile`, `User.termsAcceptedAt`, `VerificationToken` user relation, and hashed
     `UserSession.refreshToken` support.
   - `20261023120000_phase2_identity` and `20261023130000_terms_acceptance` applied to the local
     test database and the configured development database with `prisma migrate deploy`.

2. **Authentication and sessions**
   - Customer and partner registration, login, refresh, logout, logout-all, password
     forgot/reset/change, and email verification.
   - Short-lived HS256 access JWTs bound to server-side sessions; every protected request
     re-checks the session and user.
   - Opaque refresh tokens stored only as SHA-256 hashes, rotated on refresh, revoked on
     logout/password reset/all-session logout.
   - Browser `hm_refresh` cookie: HttpOnly, SameSite=Lax, Secure in production, path
     `/api/v1/auth`; refresh token also returned in the body for mobile clients.
   - bcrypt cost 12; password policy; dummy-hash login timing mitigation; generic login and
     forgot-password responses; registration duplicate returns `409 EMAIL_ALREADY_REGISTERED`.
   - Hashed, single-use, expiring reset/verification tokens. Raw tokens are returned only as
     development/test `devResetToken`/`devEmailVerificationToken`.

3. **Current-user features**
   - Profile GET/PATCH with customer/partner profile data.
   - Active session listing with `current` marker and per-session revocation.
   - Membership listing including pending and revoked invitations.

4. **Partner memberships and RBAC**
   - Hotel owner/manager invitation of an existing active user; pending membership; authenticated
     acceptance by membership ID; staff listing and revocation.
   - Global roles plus hotel membership roles and explicit permissions (`manage_hotel`,
     `manage_staff`, `manage_inventory`, `manage_rates`, `manage_bookings`, `view_finance`).
   - Unauthorized hotel access returns 404 to prevent tenant enumeration; platform admins bypass
     tenant restrictions.
   - Revoking the last active staff membership restores a `hotel_staff` user to `customer`.

5. **Abuse protection and audit**
   - Per-route rate limits for registration, login, refresh, logout, reset/change, email
     verification, profile updates, session revocation, and staff operations.
   - Audit records for registration, login, logout/session revocation, password changes, email
     verification, and staff invitation/acceptance/revocation.

6. **Contracts, tests, and documentation**
   - Expanded auth/profile/session/staff Zod contracts.
   - Auth integration tests (12), RBAC/tenant-isolation tests (7), and auth contract tests (5).
   - Updated `README.md`, `.env.example`, `docs/API.md`, `docs/ARCHITECTURE.md`,
     `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/RUNBOOK.md`, and generated OpenAPI.

### Commands actually run and results

Final verification run on the completed Phase 2 tree:

| Command                                                           | Result                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`                                                | Passed after stopping the development API process that held the Windows Prisma query engine                                                       |
| `pnpm --filter @hotel-marketplace/api exec prisma migrate deploy` | Passed; applied `20261023130000_terms_acceptance` to the configured development database                                                          |
| `prisma migrate deploy` with `DATABASE_URL` pointing at `_test`   | Passed; local test database has all three migrations                                                                                              |
| `pnpm db:seed`                                                    | Passed; 3 users, 2 hotels, room categories, rate plans, inventory, and policies                                                                   |
| `pnpm docs:api`                                                   | Passed; wrote `docs/openapi.json` with Phase 2 paths and `cookieAuth`                                                                             |
| `pnpm format:check`                                               | Passed                                                                                                                                            |
| `pnpm lint`                                                       | Passed                                                                                                                                            |
| `pnpm typecheck`                                                  | Passed                                                                                                                                            |
| `pnpm test`                                                       | **122/122 passed**: 64 domain, 23 contracts, 35 API (12 auth + 7 RBAC/tenant + 16 foundation)                                                     |
| `pnpm build`                                                      | Passed                                                                                                                                            |
| Production placeholder `SESSION_SECRET` check                     | Passed: process exited with `SESSION_SECRET must be set to a unique value in production`                                                          |
| Manual API smoke (local server)                                   | Passed: seeded login, cookie refresh, profile, session list, logout, refresh reuse `401`, partner staff list `200`, cross-tenant staff list `404` |

### Phase 2 acceptance

| Criterion                                              | Status                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| Customer registration/login/session management         | ✅                                       |
| Hotel partner identity and memberships                 | ✅                                       |
| Role/permission guards                                 | ✅                                       |
| Tenant isolation and abuse-protection tests            | ✅                                       |
| Auth/RBAC integration tests and full quality gates     | ✅                                       |
| Production email delivery                              | ⏳ Deferred; development tokens only     |
| Shared rate-limit store / multi-instance deployment    | ⏳ Required before horizontal scaling    |
| CSRF/origin hardening for future cookie-only mutations | ⏳ Required before such routes are added |
| `SESSION_SECRET` key-id rotation                       | ⏳ Production hardening item             |

### Known limitations

- Transactional email is not implemented. Password-reset and verification raw tokens are exposed
  only in development/test; production recovery is not launch-ready.
- Staff invitations require an existing active account and have no email delivery.
- Rate limits are in-memory per API process.
- No CSRF token is used; SameSite=Lax cookies and bearer access tokens mitigate classic CSRF.
- Refresh-token-family reuse detection and `SESSION_SECRET` key-id rotation are not implemented.
- Hotel onboarding APIs and a web UI for the supported onboarding/review steps are now available.
  Partner-managed inventory/rates, booking retrieval/cancellation, notifications, finance, and
  Android remain unimplemented. Public search, quotes, and pending booking requests are tracked in
  Phase 4 below.
- Live payment processing remains blocked on written provider/marketplace/settlement validation
  (D-007).

### Phase 2 preconditions — resolution

- **Session/token lifetimes:** defaults chosen: 15-minute access, 30-day refresh, 90-day
  remember-me. All are environment-configurable.
- **Cookie domain:** still deployment-specific; the cookie path is fixed to `/api/v1/auth`, and
  `Secure` is enabled in production.
- **Email verification mandatory at launch:** not required in Phase 2; the policy remains open.
- **Terms versioning/retention:** `termsAcceptedAt` is stored; versioning and retention policy
  remain open (D-018).

## 5. Phase 3 — Hotel onboarding (in progress)

### Delivered

- Partner hotel create/list/detail/update, external media/document metadata, submission, and
  lifecycle APIs with tenant and permission checks.
- Admin hotel queue/detail, start-review, approve, reject, and suspend APIs with audit history.
- Responsive web app (`apps/web`) with:
  - a customer-facing landing page and clearly identified illustrative stay cards;
  - customer and partner registration/sign-in using the API's HttpOnly refresh cookie and
    in-memory access token;
  - partner property create/edit/list and submit-for-review screens;
  - admin submission queue, detail view, review, approve, and reason-required return-to-partner
    flow;
  - explicit preview disclosures, form feedback, loading/error/empty states, and mobile layouts.

The customer landing page retains illustrative inspiration cards, but the search form now uses
public discovery, live availability, and server-calculated prices. The separate pending booking
journey and current payment limitation are recorded in Phase 4. Hotel documents and images are
external URL metadata; the web app does not upload files.

### Remaining

1. Complete Phase 3 API integration, permission, and tenant-isolation verification.
2. Confirm hotel verification/KYC documents and review operations before a production pilot.
3. Keep media uploads deferred until storage, file validation, scanning, and retention are designed
   (D-023).
4. Add browser end-to-end coverage for the live search-to-pending-booking flow.

Payments remain blocked on written provider/marketplace/settlement validation (D-007).

## 6. Phase 4 — Search, quotes, and booking requests (in progress)

### Delivered

- Public search returns only approved hotels with current room inventory, date-specific rates,
  guest capacity, amenity/property filters, pagination, and price ordering.
- Availability accounts for overlapping confirmed stays and unexpired holds per night. Both
  category-quantity inventory and physical-room maintenance blocks are checked.
- Quotes are calculated from server-owned nightly rates, include the selected cancellation terms,
  persist for 15 minutes, and do not accept client-supplied prices or promotional discounts.
- Guest and signed-in-customer booking requests revalidate the quote price and availability in a
  database transaction, acquire per-category advisory locks, create a 15-minute inventory hold,
  snapshot booking details, and support 24-hour idempotent retries.
- Expired pending bookings/holds are released when search, quote, or booking traffic next reaches
  the API. This is lazy cleanup, not a background worker.
- The customer web experience now displays search results, server-calculated rates, a price and
  cancellation summary, guest details, and an honest pending-payment state.
- Live payments remain blocked by D-007. The API does not initialize charges or mark a booking
  confirmed; pending requests expire if payment cannot be completed.

### Remaining

1. Validate the marketplace collection and settlement model in writing, select a provider, and
   implement verified payment initialization/webhooks only after D-007 is cleared.
2. Add a background worker and durable monitoring for booking/hold expiry and payment recovery.
3. Implement partner inventory/rate management and booking operations, customer booking access and
   cancellations, notifications, and finance workflows.
4. Add browser end-to-end coverage and deploy the migration to each configured environment.

### Known pricing and booking boundaries

- NGN is the only currency surfaced by public search. Reviews/ratings, taxes, mandatory fees,
  promotions, and extras are not configured; search returns no synthetic ratings.
- Quotes contain an exact price/policy snapshot. Booking creation rejects an expired/used quote,
  changed nightly price, insufficient inventory, or request details that do not match the quote.
- A `pending_payment` booking is not a reservation confirmation. No payment API or charge exists.
