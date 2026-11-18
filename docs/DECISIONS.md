# Decisions

Material product/engineering decisions. Each entry records context, decision, and status.
Unresolved items are tracked explicitly and **must not** be silently assumed in code.

## D-001 — Monorepo with pnpm workspaces

- **Context:** Spec recommends apps/web, apps/mobile, apps/api, packages/contracts, packages/domain.
- **Decision:** pnpm workspace monorepo. Shared packages are compiled with `tsc` before the API
  is built/run. Root scripts build shared packages first.
- **Status:** Accepted (Phase 1).

## D-002 — Modular monolith, not microservices

- **Context:** Inventory, booking, payment, and ledger operations need strong transactional
  consistency.
- **Decision:** One Fastify API + one PostgreSQL database, split into domain modules. No extra
  services until a concrete need is proven.
- **Status:** Accepted (Phase 1).

## D-003 — Money representation

- **Decision:** Integer minor units (kobo/cents) plus an explicit ISO 4217 currency code. All
  arithmetic goes through `packages/domain/src/money.ts`. Floating point is forbidden for
  financial calculations. Commission rates use basis points.
- **Status:** Accepted (Phase 1).

## D-004 — Stay date semantics

- **Decision:** Check-in inclusive, check-out exclusive. A 10–13 December stay covers the nights
  of 10, 11, 12 (three nights). Stay dates are `date` values; instants are UTC timestamps.
- **Status:** Accepted (Phase 1).

## D-005 — Inventory model

- **Context:** Spec requires category-quantity inventory and optionally physical rooms, without
  double counting.
- **Decision:** Each `RoomCategory` declares exactly one `inventoryMode`
  (`category_quantity` or `physical_rooms`). `InventoryDay` is authoritative only for category
  mode; `PhysicalRoom` occupancy/maintenance is authoritative only for physical-room mode.
  Mode is locked while future inventory/bookings exist. Phase 4 implements atomic availability.
- **Status:** Accepted (Phase 1). Publisher workflow for mode changes still to be designed.

## D-006 — Booking reference and guest access

- **Decision:** Public booking references are opaque (prefixed random/time-based strings), never
  sequential IDs. Guest access additionally requires a unique, unguessable access token
  (`Booking.accessToken`); the reference alone is not sufficient authority.
- **Status:** Accepted (Phase 1); access endpoints arrive in Phase 6.

## D-007 — Payment provider and live processing

- **Context:** The spec requires a provider adapter and forbids assuming a generic provider
  supports the marketplace/collection/manual-settlement model.
- **Decision:** Do not implement live payment processing or a specific provider adapter until the
  provider and settlement model are validated in writing. The schema and contracts model
  normalized payment events so an adapter can be added without domain changes.
- **Status:** **Blocked on provider validation.** No live transactions permitted.

## D-008 — Commission basis

- **Context:** Spec requires an explicit basis and snapshot at confirmation.
- **Decision (provisional):** Commission applies to room revenue net of discounts funded by the
  hotel, excluding taxes, refundable deposits, and mandatory fees unless a signed agreement says
  otherwise. The basis is stored per booking snapshot. This must be confirmed with finance/legal
  before production.
- **Status:** Provisional; requires sign-off (BUILD_SPEC §16.4).

## D-009 — Authentication and sessions

- **Context:** The API needs short-lived credentials for web, mobile, and server-to-server clients
  without making stolen refresh tokens or access tokens long-lived.
- **Decision:**
  - Access tokens are HS256 JWTs with `sub`, `sid`, `jti`, issuer `hotel-marketplace`, and
    audience `hotel-marketplace-api`. Default TTL is 15 minutes.
  - Every authenticated request verifies the JWT **and** re-checks the referenced `UserSession`
    and user in PostgreSQL. Revocation and deactivation therefore take effect immediately.
  - Refresh tokens are opaque 256-bit random values. Only a SHA-256 hash is stored. Tokens rotate
    on every refresh; reuse of the previous value fails. Default TTL is 30 days, or 90 days for
    `rememberMe`.
  - Browser refresh cookie is `hm_refresh`: HttpOnly, SameSite=Lax, Secure in production, path
    `/api/v1/auth`. The raw refresh token is also returned in the response body for mobile secure
    storage; web clients rely on the cookie.
  - Logout revokes the current session; password reset revokes all sessions; password change
    revokes all other sessions; logout-all revokes every session.
  - Passwords use bcrypt cost 12. Password policy is 8–128 characters with lowercase, uppercase,
    and numeric characters.
- **Status:** Accepted and implemented (Phase 2). Key-id rotation for `SESSION_SECRET` is still a
  production hardening task.

## D-010 — Error and logging policy

- **Decision:** One error envelope with a request ID. Clients never receive stack traces,
  database errors, provider credentials, or secrets. Logs redact authorization headers, cookies,
  passwords, tokens, and payment secrets. Provider errors are mapped to safe internal codes.
- **Status:** Accepted and implemented for the foundation.

## D-011 — Idempotency

- **Decision:** Retry-prone write operations (booking creation, payment initialization, refunds,
  ledger posting, payout recording) require idempotency keys stored with request hash and prior
  response. Provider event IDs are unique per provider and deduplicated. Phase 1 provides the
  `IdempotencyRecord` schema; enforcement arrives with the endpoints.
- **Status:** Accepted (Phase 1 schema); enforcement in later phases.

## D-012 — Development seed data

- **Decision:** Seed data is entirely fictional and only for development/test. Seed accounts use
  documented throwaway passwords. Production seeding is not permitted.
- **Status:** Accepted (Phase 1).

## D-013 — Live migration and seed verification

- **Context:** A database connection was initially unavailable, so the schema was validated
  statically and the migration SQL generated.
- **Decision/outcome:** The initial migration was applied with `prisma migrate deploy` to the
  configured PostgreSQL database, and the development seed completed successfully. The API was
  started and `/health/ready` returned `database: ok`.
- **Status:** Resolved (Phase 1 verification complete).

## D-014 — Environment file location and loading

- **Context:** The API and Prisma CLI both run with `apps/api` as their working directory in the
  pnpm workspace. A root-level `.env` was not reliably discovered.
- **Decision:** The API uses `apps/api/.env` (git-ignored). The committed template remains
  `.env.example` at the repository root and documents copying it to `apps/api/.env`. The API
  loads the file automatically via `apps/api/src/config/load-env.ts`, independent of the process
  working directory. Variables already present in the shell or CI environment take precedence,
  so CI and production continue to use injected secrets.
- **Status:** Accepted and implemented.

## D-015 — Email delivery deferred; development token exposure

- **Context:** Phase 2 needs password-reset and email-verification flows, but no transactional
  email provider is configured.
- **Decision:** Reset and verification tokens are generated with 256 bits of randomness, stored
  only as SHA-256 hashes, single-use, and expiring. In development/test, the raw token is returned
  as `devResetToken` or `devEmailVerificationToken` so flows can be tested. In production those
  fields are omitted and the API does not claim an email was delivered. Email verification is not
  required to sign in.
- **Status:** Token mechanics implemented. Transactional email and the launch policy for mandatory
  verification remain open; production must configure a provider and remove reliance on dev tokens.

## D-016 — Staff invitations require an existing account

- **Context:** There is no invitation-email delivery yet, and unauthenticated invite acceptance
  would create an account-enumeration and account-takeover surface.
- **Decision:** A hotel owner/manager invites an existing active user by email. The invitation is
  a `pending` hotel membership; the invitee accepts it by membership ID while authenticated.
  Platform administrators cannot be invited, and the `owner` role cannot be assigned through an
  invitation. Re-inviting a pending membership updates its role; an active membership conflicts.
  Unauthorized hotel access returns 404. Revoking the last active staff membership restores a
  `hotel_staff` user to `customer`.
- **Status:** Accepted and implemented (Phase 2). Email-based invitations remain a later addition.

## D-017 — Test database isolation

- **Context:** Integration tests truncate tables and must never touch a development, staging, or
  production database.
- **Decision:** Tests select `TEST_DATABASE_URL`, then `DATABASE_URL`, then the local
  `hotel_marketplace_test` fallback. The setup refuses to run unless the database name ends in
  `_test`. Tests truncate identity tables between cases and require committed migrations to have
  been applied. CI provides a disposable PostgreSQL 16 service.
- **Status:** Accepted and implemented (Phase 2).

## D-018 — Terms acceptance and marketing consent

- **Context:** Registration must collect consent without collecting unnecessary data.
- **Decision:** `acceptTerms` must be literally `true`, and registration stores `termsAcceptedAt`
  on `User`. Marketing email consent is a separate `CustomerProfile.marketingOptIn` flag. The terms
  version and retention/deletion policy are not yet stored or finalized.
- **Status:** Accepted and implemented (Phase 2). Terms versioning and retention require legal
  review before production.

## D-019 — Registration duplicate disclosure

- **Context:** Generic responses reduce account enumeration, but silently accepting a duplicate
  registration creates a confusing dead end.
- **Decision:** Duplicate registration returns `409 EMAIL_ALREADY_REGISTERED`. Login and
  forgot-password remain generic and run comparable bcrypt work to reduce timing leakage.
  Registration and partner registration are rate-limited. This is a deliberate usability/security
  trade-off and must be re-reviewed before public launch.
- **Status:** Accepted (Phase 2).

## D-020 — Hotel review lifecycle and who may act

- **Context:** Phase 3 introduces partner onboarding and admin review. The spec requires that
  approval authority sits with the platform, and that partner edits never bypass review.
- **Decision:**
  - Partner side: `POST/GET/PATCH /partner/hotels`, `POST .../submit`, plus media metadata
    endpoints. Creation requires the global `hotel_owner` role; every other partner action
    requires access to the hotel and the `manage_hotel` permission (owner or `platform_admin`, per
    the permission table in `docs/ARCHITECTURE.md`; see D-026).
  - Admin side: `GET /admin/hotels`, `GET /admin/hotels/:hotelId`, and the explicit transitions
    `/review`, `/approve`, `/reject`, `/suspend`, `/reinstate`, all restricted to
    `platform_admin`. There is deliberately no generic "set status" endpoint, so an admin action
    can never bypass `HotelStateMachine`.
  - Every transition runs `HotelStateMachine` validation, then a conditional update
    (`WHERE id AND status = <expected>`), then a `HotelStatusHistory` row and an `AuditLog` row in
    one transaction. Concurrent conflicting requests resolve to exactly one winner; the loser gets
    `409 HOTEL_STATUS_CONFLICT`.
- **Status:** Accepted and implemented (Phase 3).

## D-021 — Rejected hotels resubmit directly

- **Context:** `canSubmit` allows `draft` or `rejected`, but the state machine only allowed
  `rejected → draft`. One of the two had to change.
- **Decision:** `rejected → submitted` was added to `HotelStateMachine.transitions` so a partner
  fixes the reported problems and resubmits in one action instead of an artificial detour through
  `draft`. This is a material domain change; the transition table is now the single source of
  truth that matches `canSubmit`.
- **Status:** Accepted and implemented (Phase 3).

## D-022 — Commission is platform-set only

- **Context:** `defaultCommissionBps` controls marketplace earnings and must not be
  self-assigned by the party being paid less.
- **Decision:** The partner create/update contracts omit `defaultCommissionBps` entirely, so a
  partner cannot set it even by sending an unknown field. Only
  `POST /admin/hotels/:hotelId/approve` may set it, and it is recorded in audit metadata. Signed
  commission agreements remain a Phase 8 concern (see D-008).
- **Status:** Accepted and implemented (Phase 3).

## D-023 — Media and documents are metadata-only external http(s) URLs

- **Context:** Phase 3 needs images and KYC documents, but no object-storage adapter exists and
  file upload would introduce malware, signed-URL, and retention questions.
- **Decision:** `HotelMedia.url` and `HotelDocument.url` must be external `http`/`https` URLs
  validated by `httpUrlSchema`, which also rejects `javascript:` and `data:` schemes. No bytes are
  stored or proxied by the API; `mimeType`/`width`/`height`/`sizeBytes` are optional descriptive
  metadata. A storage adapter, upload flow, and retention rules arrive with a later phase.
- **Status:** Accepted and implemented (Phase 3). Storage/retention is still an open question.

## D-024 — Review notes, history, and partner notification

- **Context:** Reviewers need a record, and suspend/reject should reach the partner, but email
  delivery is deferred (D-015).
- **Decision:** `HotelStatusHistory` records every transition with `fromStatus`, `toStatus`,
  `actorId`, `actorType`, `reason`, and `notes`, and is shown to partners (it is their hotel).
  `Hotel.internalNotes` is the reviewer working record: it is appended with an ISO timestamp and
  actor email, and is returned **only** on admin endpoints — partner serializers omit it. The
  suspend `notifyPartner` flag is stored in audit metadata only; no `Notification` row is created
  and no email is claimed, because a row that never sends would be misleading.
- **Status:** Accepted and implemented (Phase 3). Notification delivery is Phase 7.

## D-025 — PATCH schemas must carry no AJV defaults

- **Context:** Fastify validates bodies with AJV configured with `useDefaults`, which runs
  **before** the handler's Zod parse. `hotelUpdateRequestSchema` was derived with `.partial()` from
  schemas containing `.default()`, so `checkInTime`, `checkOutTime`, `amenities`, `address.country`
  and `media.sortOrder` were silently injected into every PATCH and overwrote stored values.
- **Decision:** Update contracts are built from default-free field sets (`hotelProfileFields`,
  `addressPatchSchema`, `hotelMediaFields`); defaults are re-applied only on the create schemas
  via `.extend()`. Query-string and create-body defaults are unaffected and still apply. The rule
  is: **a schema used for a partial update must contain no `default` keyword.**
- **Status:** Accepted and implemented (Phase 3); guarded by tests in `openapi.test.ts` and
  `contracts.test.ts`.

## D-026 — Content edits require `manage_hotel`

- **Context:** The Phase 2 permission matrix gives `manage_hotel` to `owner` (and bypass to
  `platform_admin`) only; `manager` has full operational permissions except hotel identity,
  ownership, and commission changes.
- **Decision:** Hotel content, media, and submission actions check `manage_hotel`, so a `manager`
  can run staff, inventory, rates, and bookings but cannot edit hotel content or submit for
  review. The matrix is unchanged from Phase 2; this is simply Phase 3 consuming it.
- **Status:** Accepted (Phase 3).

## D-027 — Web preview scope and session handling

- **Context:** The repository had no web app. The initial customer search and example stays were
  preview-only while identity and hotel-onboarding APIs were being built.
- **Decision:** Add a responsive React/Vite web app in `apps/web` for customer discovery, partner
  onboarding, and admin hotel review. Access tokens stay in React memory and browser refresh uses
  the API's HttpOnly cookie. Example stays remain illustrative; partner document/image fields
  remain external URL metadata only (D-023).
- **Session handling:** Keep access tokens in React memory and use the API's HttpOnly refresh cookie
  for browser refresh; do not persist tokens in local or session storage. Registration explicitly
  acknowledges that the terms and privacy pages are preview notices, not final legal documents.
- **Status:** Accepted. Production legal notices remain open; the search and pending-booking
  implementation is governed by D-028. The product brand is recorded in D-029.

## D-028 — Quote and pending-booking behavior before payment approval

- **Context:** The API has no validated payment provider, while the customer journey needs live
  availability, server pricing, and safe inventory reservation.
- **Decision:** Search only approved hotels and calculate availability from nightly inventory,
  active reservations, and unexpired holds. Persist immutable server-calculated quotes for 15
  minutes. Booking creation rechecks quote prices and availability under a per-category
  transaction lock, uses idempotency keys, and creates a 15-minute `pending_payment` hold.
  Commission snapshots use only an effective signed agreement; no agreement means a zero
  commission snapshot instead of inventing one from the hotel's provisional default.
- **Payment limitation:** Booking requests remain explicitly pending and are never confirmed or
  charged. The customer UI warns that payment is unavailable. Live payment processing remains
  blocked until D-007 is cleared in writing.
- **Expiry:** Expired quotes, holds, and pending bookings are cleaned up opportunistically when
  search/quote/booking routes are used. A background expiry/recovery worker is still required
  before launch.
- **Status:** Accepted for development; taxes, fees, discount funding, commission basis, and
  cancellation rules still require business/legal validation.

## D-029 — Product brand

- **Decision:** The product name is **Omnicity360**. Use it in customer-facing branding, page
  metadata, documentation, and API display metadata. Internal package names, database identifiers,
  and existing authentication token issuer/audience values remain unchanged unless separately
  migrated.
- **Status:** Accepted.

## Open questions (do not assume)

1. Payment provider selection and written marketplace/settlement approval.
2. Hotel verification documents, KYC, and bank-account verification.
3. Commission basis and discount funding (see D-008).
4. Cancellation policy minimum protections and permitted hotel choices.
5. Required guest identity fields and verification level.
6. Tax display, invoicing, revenue recognition, and reporting.
7. Data retention/deletion policy and NDPA 2023 compliance review.
8. Initial launch cities and hotel acquisition strategy.
9. Support escalation, no-show evidence, and emergency contact flow.
10. Whether high-value payouts require a second approver.
11. Cookie domain strategy and whether web/API share a registrable domain in production.
12. Whether email verification becomes mandatory at launch (currently not required to sign in).
13. Terms versioning, consent records, and data retention/deletion policy.
14. Object storage, upload, scanning, and retention for hotel media and KYC documents (currently
    external `http(s)` URLs only — see D-023).
15. Whether `platform_support` should gain read-only access to the admin hotel review queue
    (currently `platform_admin` only).
