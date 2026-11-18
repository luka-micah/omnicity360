# Architecture

## Overview

The platform is a **modular monolith**: one Fastify API, one PostgreSQL database, and clear
domain boundaries. This keeps transactional integrity simple for inventory, bookings, and
finance while allowing the web and Android clients to evolve independently.

```text
apps/web (later)      apps/mobile (later)
        \                  /
         \                /
        packages/contracts  (Zod schemas, wire types)
                |
        packages/domain     (pure rules: money, dates, state machines)
                |
            apps/api        (Fastify routes + services + Prisma)
                |
           PostgreSQL
```

### Package responsibilities

| Package              | Responsibility                                                                                                      | Must not                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/domain`    | Pure, framework-free business rules: money arithmetic, date semantics, state machines, commission/refund primitives | Import Fastify, Prisma, or browser APIs          |
| `packages/contracts` | Zod schemas describing the HTTP boundary; shared request/response types                                             | Contain database access or business side effects |
| `apps/api`           | HTTP routing, authentication, authorization, validation, transactions, persistence, providers                       | Duplicate domain calculations in route handlers  |

Business rules belong in services/domain modules. Route handlers validate input, authorize,
call services, and serialise responses.

## API conventions

- Base path: `/api/v1`.
- JSON only; request bodies limited to 1 MB.
- Every response carries a request ID (`x-request-id`), generated or echoed.
- Errors use one shape:

```json
{
  "error": {
    "code": "AVAILABILITY_CHANGED",
    "message": "Availability or price changed. Please review the updated offer.",
    "requestId": "…"
  }
}
```

- Validation failures return `422` with `VALIDATION_ERROR` and safe field issues.
- Authentication errors return `401`; authorization failures return `403`; unknown resources
  return `404`. Internal errors return a generic `500` with no stack trace.
- Rate limiting is applied globally and per-route for authentication, profile/session, and staff
  operations. Limits are in-memory per API process; a shared store is required before horizontal
  scaling. Booking, quote, and payment limits arrive with those routes.

## Request lifecycle

1. Fastify assigns/echoes a request ID and logs a redacted request line.
2. Global rate limit is checked.
3. Route-level schema validation (Zod) rejects malformed input.
4. Authentication verifies the bearer JWT, then reloads the referenced session and user from
   PostgreSQL. Revoked/expired sessions and inactive users are rejected.
5. Authorization checks the actor's global role, hotel membership role, explicit permission, and
   tenant scope. Unauthorized hotel access returns 404.
6. The service loads authoritative data from PostgreSQL inside a transaction where needed.
7. Money, availability, commission, and state changes are recalculated server-side.
8. The response is serialised; errors pass through the central error handler.

## Identity and access

Authentication is split into a short-lived access credential and a revocable server-side session:

- **Access token:** HS256 JWT, default 15-minute TTL, claims `sub`, `sid`, `jti`, issuer, and
  audience. The `sid` points at a `UserSession` row that is checked on every authenticated request.
- **Refresh token:** opaque 256-bit value, stored only as a SHA-256 hash, rotated on every refresh,
  and revoked on logout, password reset, or all-session logout. Default 30 days; 90 days with
  remember-me.
- **Browser transport:** `hm_refresh` cookie, HttpOnly, SameSite=Lax, Secure in production, path
  `/api/v1/auth`. Access tokens are sent in the `Authorization` header.
- **Mobile transport:** refresh token returned in the response body for platform secure storage;
  access token used in the `Authorization` header.
- **Audit:** registration, login, logout/session revocation, password changes, email verification,
  and staff membership actions write `AuditLog` records.

Hotel authorization uses membership roles plus explicit permissions:

| Hotel role          | Permissions                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `owner`             | `manage_hotel`, `manage_staff`, `manage_inventory`, `manage_rates`, `manage_bookings`, `view_finance` |
| `manager`           | `manage_staff`, `manage_inventory`, `manage_rates`, `manage_bookings`, `view_finance`                 |
| `front_desk`        | `manage_bookings`                                                                                     |
| `inventory_manager` | `manage_inventory`, `manage_rates`                                                                    |
| `finance_viewer`    | `view_finance`                                                                                        |

The hotel's `partnerId` is treated as an owner. Platform administrators may bypass tenant scope for
operations; `platform_support` currently has no hotel permissions. Staff invitations only assign
non-owner roles and require an existing active account because email delivery is not implemented.

## Hotel onboarding

Hotel review is split into small modules in `apps/api/src`:

| Module                     | Responsibility                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| `routes/partner-hotels.ts` | Create/list/detail/update, submit, and media metadata endpoints     |
| `routes/admin-hotels.ts`   | Review queue, detail, and the explicit transition endpoints         |
| `hotels/lifecycle.ts`      | State-machine validation, conditional transition, history + audit   |
| `hotels/serializers.ts`    | Contract-shaped payloads; drops `null` for optional contract fields |
| `hotels/slug.ts`           | Slug allocation and unique-race handling (`SLUG_ALREADY_EXISTS`)    |

Rules enforced in code, not by convention:

- The state machine is validated first, then the row is updated with `WHERE id AND status`, so a
  concurrent conflicting request cannot both succeed. History and audit rows are written in the
  same transaction as the transition.
- Partner content edits are blocked while `submitted`/`under_review` (and always for `archived`),
  and the public slug is immutable once approved.
- `internalNotes` never reaches partner serializers; partner payloads exclude it entirely.
- Media and documents reference external `http(s)` URLs only; the API stores no bytes.
- Because Fastify's AJV runs with `useDefaults`, every partial-update schema is kept free of
  `default` keywords (see D-025).

## Data model

The Prisma schema (`apps/api/prisma/schema.prisma`) covers the full conceptual model so later
phases do not require destabilising redesigns. The initial migration creates the tables; Phase 2
adds partner profiles, terms acceptance, hashed refresh tokens, and verification-token relations;
Phase 3 adds `HotelStatusHistory`, `Hotel.submissionNotes`, and review-queue indexes
(`hotels(partner_id, status)`, `hotels(status, created_at)`). Most domain tables are not yet
exposed through endpoints.

Key groups:

- **Identity:** `User` (global role, terms acceptance), `CustomerProfile`, `PartnerProfile`,
  `UserSession` (hashed refresh token, revocation), `VerificationToken`, `HotelMembership`.
- **Hotel & inventory:** `Hotel`, `HotelMedia`, `HotelDocument`, `HotelStatusHistory`,
  `RoomCategory`, `PhysicalRoom`, `RatePlan`, `NightlyRate`, `InventoryDay`, `InventoryHold`,
  `MaintenanceBlock`, `CancellationPolicy`.
- **Booking:** `Booking`, `BookingRoom`, `BookingNight`, `BookingGuest`,
  `BookingStatusHistory`, `CancellationRequest`.
- **Payments:** `Payment`, `PaymentProviderEvent`, `Refund`.
- **Finance:** `CommissionAgreement`, `BookingCommissionSnapshot`, `LedgerTransaction`,
  `LedgerEntry`, `PayoutBatch`, `HotelPayout`, `HotelStatement`, `ReconciliationRun`,
  `ReconciliationItem`.
- **Operations:** `Notification`, `AuditLog`, `IdempotencyRecord`.

Conventions:

- UUID primary keys; no sequential IDs are exposed as authority.
- Money stored as integer minor units (kobo) plus an explicit currency code.
- Instants stored in UTC; stay dates use PostgreSQL `date`.
- Financial and booking history uses restrictive/set-null delete behaviour, never cascade.
- Booking references and guest access tokens are opaque and unique.

## Inventory: avoiding double counting

A `RoomCategory` declares exactly one `inventoryMode`:

- `category_quantity` — capacity is tracked per category per date in `InventoryDay.quantity`.
  Physical rooms are not required and must not be used to derive availability.
- `physical_rooms` — capacity comes from individually tracked `PhysicalRoom` records and their
  maintenance blocks/occupancy. `InventoryDay` must not be authoritative for these categories.

The mode is stored on the category and enforced in services: a category cannot switch modes
while it has active/future inventory or bookings. This prevents counting the same unit twice.
`InventoryHold` reserves units for a short window for either mode; holds are committed or
released transactionally. Phase 4 implements the concurrency-safe availability logic.

## Money and commission

- All amounts are integer minor units. Floating point is never used for money.
- Commission rates are basis points (500 = 5%, 1250 = 12.5%).
- At booking confirmation the server snapshots:
  - nightly rates and the full customer price breakdown,
  - cancellation policy wording/terms,
  - commission rate, calculation basis, and discount funding party.
- Commission basis (room revenue before/after discounts, taxes/fees) is a documented decision;
  it is never inferred from client input.
- Ledger postings are append-only; corrections are reversals/adjustments linked to the original.

## Booking and payment invariants

- Quotes and availability are recalculated by the server; client totals are ignored.
- A booking starts in `pending_payment` with an expiring inventory hold.
- Payment initialization does **not** confirm a booking.
- Only a server-verified provider result (signed webhook or server-side status query) can move a
  payment to `succeeded`; only then may the booking become `confirmed` inside a transaction that
  commits inventory and posts ledger entries.
- Webhook events are deduplicated by `(provider, providerEventId)` and processed idempotently.
- Late payment after hold expiry goes to a defined recovery path — never blindly confirmed when
  inventory is no longer available.
- Booking, payment, refund, commission, and payout remain distinct records and states.

## External integrations

All providers sit behind adapters:

- `PaymentProvider` (initialize, verify, webhook validation, refunds, status, error mapping).
- Notification provider (email first). **Not implemented yet**; Phase 2 reset/verification tokens
  are returned as development-only fields until an email provider is configured.
- Storage provider (e.g. Cloudinary).
- Maps/geocoding (later).

No provider SDK is called directly from domain code. Adapters read configuration from validated
environment variables. Live payment processing is gated on written provider/marketplace
validation.

## Observability

- Structured JSON logs via Pino, with request IDs.
- Sensitive fields (authorization headers, cookies, passwords, tokens, secrets) are redacted.
- `/health/live` reports process liveness; `/health/ready` checks PostgreSQL.
- Authentication, staff-membership, and hotel lifecycle actions (create, update, submit, review,
  approve, reject, suspend, reinstate) are written to `AuditLog` with actor, entity, IP, and user
  agent. Audit retention and tamper-evidence are not yet enforced at the database level.
- Background jobs (Phase 6+) must be retryable and observable.

## Deployment shape

- API: container or Node process behind TLS.
- PostgreSQL: managed or self-hosted with automated backups.
- Redis: introduced when background jobs or distributed rate limiting require it.
- Migrations applied with `prisma migrate deploy` as a release step.
- Secrets injected via environment/secret manager; never baked into images or clients.
- `SESSION_SECRET` signs access tokens. Rotate it with a key-id plan and revoke sessions when
  compromise is suspected; opaque refresh tokens remain valid until their sessions are revoked.

## Current limitations (through Phase 3)

- Authentication, sessions, profiles, memberships, staff management, hotel onboarding, and hotel
  review/approval are implemented.
- No public search, inventory, quote, booking, payment, or finance endpoints yet; schemas and
  contracts exist.
- Hotel media and KYC documents are metadata-only external `http(s)` URLs; there is no upload,
  scanning, or storage integration.
- Email delivery is not implemented. Reset/verification raw tokens are returned only in
  development/test; production password recovery is not launch-ready.
- Rate limits are in-memory per API process; use a shared store before horizontal scaling.
- No CSRF token is used. SameSite=Lax cookies and bearer access tokens mitigate classic CSRF;
  add explicit origin/CSRF checks before cookie-only state-changing routes.
- Refresh-token-family reuse detection and `SESSION_SECRET` key-id rotation are not implemented.
- No Redis/BullMQ worker yet.
- Web and Android clients are not started.
- Seeded development data is fictional and must never be used in production.
