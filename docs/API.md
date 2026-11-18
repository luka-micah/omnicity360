# API

Base URL: `http://localhost:3001/api/v1` (development).
OpenAPI: `GET /docs/json`; Swagger UI: `GET /docs`.

## Conventions

- JSON request/response bodies.
- Request ID via `x-request-id` (generated if absent, echoed in errors).
- Protected routes require `Authorization: Bearer <access token>`.
- Browser clients receive an HttpOnly `hm_refresh` cookie for refresh/logout. Mobile clients may
  send the same refresh token in a JSON body instead. Cookie-based calls can omit the body; if the
  client sets a JSON content type, send `{}` rather than a zero-length body.
- Booking creation is idempotent via the request body's `idempotencyKey`; the request hash and
  response are retained for 24 hours. Payment, refund, ledger, and payout idempotency is not yet
  implemented.
- Pagination: `page` (>= 1) and `limit` (1–100, default 20); responses include
  `pagination { page, limit, total, totalPages }`.
- Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "…",
    "details": { "issues": [{ "path": "email", "message": "Invalid email" }] }
  }
}
```

| Status | Typical codes                                                                                 |
| ------ | --------------------------------------------------------------------------------------------- |
| 401    | `UNAUTHORIZED`                                                                                |
| 403    | `FORBIDDEN`                                                                                   |
| 404    | `NOT_FOUND` (also used for unauthorized hotel access to prevent tenant enumeration)           |
| 409    | `EMAIL_ALREADY_REGISTERED`, `MEMBERSHIP_ACTIVE`, `CANNOT_REVOKE_OWNER`, `CANNOT_INVITE_SELF`, |
|        | `SLUG_ALREADY_EXISTS`, `SLUG_IMMUTABLE`, `HOTEL_LOCKED_FOR_REVIEW`, `HOTEL_ARCHIVED`,         |
|        | `HOTEL_NOT_SUBMITTABLE`, `HOTEL_INVALID_TRANSITION`, `HOTEL_STATUS_CONFLICT`,                 |
|        | `MEDIA_LIMIT_REACHED`                                                                         |
| 422    | `VALIDATION_ERROR`, `INVITEE_NOT_FOUND`, `INVALID_INVITEE`                                    |
| 429    | `RATE_LIMITED`                                                                                |
| 500    | `INTERNAL_ERROR` (no internals)                                                               |
| 503    | readiness failure                                                                             |

## Implemented endpoints

### Service and documentation

| Method | Path            | Auth | Description                             |
| ------ | --------------- | ---- | --------------------------------------- |
| GET    | `/`             | none | Redirects to Swagger UI                 |
| GET    | `/favicon.ico`  | none | `204 No Content`                        |
| GET    | `/health`       | none | Simple health check (outside `/api/v1`) |
| GET    | `/health/live`  | none | Liveness                                |
| GET    | `/health/ready` | none | Readiness incl. PostgreSQL              |
| GET    | `/docs`         | none | Swagger UI                              |
| GET    | `/docs/json`    | none | OpenAPI document                        |
| GET    | `/api/v1`       | none | API metadata                            |

### Public search, quotes, and booking requests

| Method | Path             | Auth                           | Description                                                                                                   |
| ------ | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/hotels/search` | none                           | Search approved listings and current nightly inventory; prices are totals per room for the requested stay     |
| POST   | `/quotes`        | none                           | Return and persist a server-calculated quote; quotes expire after 15 minutes                                  |
| POST   | `/bookings`      | optional customer bearer token | Create a pending-payment booking and 15-minute inventory hold; supports guest checkout and idempotent retries |

Search and quote requests require future stay dates (maximum 365 nights), room capacity and inventory
are checked against every night, and only NGN rates are currently surfaced. Search ratings remain
`null` because reviews are not implemented. Quotes currently include configured room rates and
cancellation terms; taxes, fees, discounts, and extras are not configured.

Booking requests must match the quote's room, rate plan, dates, occupancy, and price. Server-side
price and inventory are rechecked transactionally before the hold is created. The booking stays in
`pending_payment`; it is **not confirmed**, no payment is initialized, and the hold expires after 15
minutes. Expired holds and pending bookings are released/marked expired when search, quote, or
booking traffic next reaches the API; no background expiry worker is configured.

### Authentication and sessions

| Method | Path                     | Auth        | Description                                                        |
| ------ | ------------------------ | ----------- | ------------------------------------------------------------------ |
| POST   | `/auth/register`         | none        | Register a customer; returns user + token pair and sets the cookie |
| POST   | `/auth/partner/register` | none        | Register a hotel partner (`hotel_owner`) with company profile      |
| POST   | `/auth/login`            | none        | Sign in; generic error for unknown, inactive, or wrong password    |
| POST   | `/auth/refresh`          | cookie/body | Rotate the refresh token; issue a new access token                 |
| POST   | `/auth/logout`           | cookie/body | Revoke the current refresh session; always `204`                   |
| POST   | `/auth/logout-all`       | bearer      | Revoke every active session for the current user                   |
| POST   | `/auth/password/forgot`  | none        | Request a reset token; always `202`                                |
| POST   | `/auth/password/reset`   | none        | Consume a single-use reset token; revokes all sessions             |
| POST   | `/auth/password/change`  | bearer      | Change the current password; revokes all other sessions            |
| POST   | `/auth/email/verify`     | none        | Consume a single-use email-verification token                      |

Registration and partner registration return `201`; login/refresh return `200`; logout and
logout-all return `204`; forgot returns `202`; reset/change/verify return `200`.

### Current user

| Method | Path                      | Auth   | Description                                                 |
| ------ | ------------------------- | ------ | ----------------------------------------------------------- |
| GET    | `/me/profile`             | bearer | Current user, customer profile, and partner profile         |
| PATCH  | `/me/profile`             | bearer | Partial profile update; at least one field is required      |
| GET    | `/me/sessions`            | bearer | Active sessions, newest activity first, with `current` flag |
| DELETE | `/me/sessions/:sessionId` | bearer | Revoke one of the caller's sessions                         |
| GET    | `/me/memberships`         | bearer | Hotel memberships for the caller, including pending/revoked |

### Partner staff

| Method | Path                                           | Auth   | Description                                          |
| ------ | ---------------------------------------------- | ------ | ---------------------------------------------------- |
| POST   | `/partner/staff/invitations`                   | bearer | Invite an existing active user to a hotel staff role |
| POST   | `/partner/staff/invitations/accept`            | bearer | Accept a pending invitation addressed to the caller  |
| GET    | `/partner/hotels/:hotelId/staff`               | bearer | List non-owner staff; filter by `status`; paginated  |
| DELETE | `/partner/hotels/:hotelId/staff/:membershipId` | bearer | Revoke a staff membership                            |

Staff list/invite/revoke require `manage_staff`. Unauthorized hotel access returns `404`, not
`403`, so hotel IDs cannot be enumerated.

### Partner hotels

| Method | Path                                      | Auth           | Description                                           |
| ------ | ----------------------------------------- | -------------- | ----------------------------------------------------- |
| POST   | `/partner/hotels`                         | hotel_owner    | Create a `draft` hotel; owns the slug, history, audit |
| GET    | `/partner/hotels`                         | bearer         | Hotels owned or actively managed; `status` filter     |
| GET    | `/partner/hotels/:hotelId`                | `manage_hotel` | Hotel detail with documents and status history        |
| PATCH  | `/partner/hotels/:hotelId`                | `manage_hotel` | Partial content update (never status or commission)   |
| POST   | `/partner/hotels/:hotelId/submit`         | `manage_hotel` | Submit a `draft`/`rejected` hotel with documents      |
| POST   | `/partner/hotels/:hotelId/media`          | `manage_hotel` | Add image metadata (external http(s) URL)             |
| PATCH  | `/partner/hotels/:hotelId/media/:mediaId` | `manage_hotel` | Update image metadata                                 |
| DELETE | `/partner/hotels/:hotelId/media/:mediaId` | `manage_hotel` | Remove image metadata                                 |

`POST /partner/hotels` is restricted to the global role `hotel_owner`. Everything else needs
`manage_hotel` (the hotel owner, or a `platform_admin`), plus access to that hotel. Unauthorized
hotel access returns `404`.

### Platform administration (hotels)

| Method | Path                               | Auth           | Description                                      |
| ------ | ---------------------------------- | -------------- | ------------------------------------------------ |
| GET    | `/admin/hotels`                    | platform_admin | Filterable, sortable, paginated review queue     |
| GET    | `/admin/hotels/:hotelId`           | platform_admin | Detail incl. documents, history, internal notes  |
| POST   | `/admin/hotels/:hotelId/review`    | platform_admin | `submitted` → `under_review`                     |
| POST   | `/admin/hotels/:hotelId/approve`   | platform_admin | `under_review` → `approved` (may set commission) |
| POST   | `/admin/hotels/:hotelId/reject`    | platform_admin | `under_review` → `rejected` (reason required)    |
| POST   | `/admin/hotels/:hotelId/suspend`   | platform_admin | `approved` → `suspended` (reason required)       |
| POST   | `/admin/hotels/:hotelId/reinstate` | platform_admin | `suspended` → `approved`                         |

Admin list rows include `documentCount` and the `partner` identity instead of nested documents and
history; use the detail endpoint for those.

### Hotel lifecycle

```text
draft ──submit──▶ submitted ──review──▶ under_review ──approve──▶ approved ──suspend──▶ suspended
                                           │                                           │
                                           └──reject──▶ rejected ──submit──▶ submitted │
                                                                              approved ◀──reinstate──┘
```

- `POST /partner/hotels/:hotelId/submit` accepts `draft` or `rejected` (a rejected partner fixes
  the issues and resubmits); any other status returns `409 HOTEL_NOT_SUBMITTABLE`.

- Content edits (including media) are allowed in `draft`, `rejected`, `approved`, and `suspended`.
  While a submission is with reviewers the API returns `409 HOTEL_LOCKED_FOR_REVIEW`;
  `archived` returns `409 HOTEL_ARCHIVED`.
- The public slug may only change while the hotel is `draft` or `rejected`
  (`409 SLUG_IMMUTABLE`), because the slug is the public URL once approved.
- Partners cannot set `defaultCommissionBps`; only `POST /admin/hotels/:hotelId/approve` can.
- Every transition is applied with a conditional update, so exactly one concurrent request wins
  (`409 HOTEL_STATUS_CONFLICT` on the loser), and each writes a `HotelStatusHistory` row plus an
  `AuditLog` entry in the same transaction.
- Media and documents store external `http(s)` URLs only (`javascript:`/`data:` are rejected), and
  are metadata-only: file storage is a later phase.

## Authentication and session behaviour

### Token model

- Access tokens are short-lived HS256 JWTs. Default TTL is **900 seconds**; configurable with
  `ACCESS_TOKEN_TTL_SECONDS`. Claims include `sub` (user), `sid` (session), `jti` (unique), and
  standard issuer/audience values (`hotel-marketplace` / `hotel-marketplace-api`).
- Every authenticated request verifies the JWT **and** re-loads the session and user from
  PostgreSQL. A revoked/expired session or deactivated user is rejected immediately, even if the
  JWT has not expired.
- Refresh tokens are opaque 256-bit random values. Only their SHA-256 hash is stored. They are
  rotated on every refresh; the previous token stops working immediately.
- Refresh TTL defaults to **30 days**, or **90 days** when `rememberMe: true` is sent at login.
  Configure with `REFRESH_TOKEN_TTL_DAYS` and `REMEMBER_ME_TTL_DAYS`.
- Browser cookie: `hm_refresh`, `HttpOnly`, `SameSite=Lax`, `Secure` in production, path
  `/api/v1/auth`. The cookie is not sent to `/me` or partner routes.
- The refresh response also returns the new refresh token in the body so mobile clients can store
  it in platform secure storage. Web clients should ignore that body field and rely on the cookie.
- Logout is idempotent. Password reset revokes all sessions; password change revokes all sessions
  except the current one. `logout-all` revokes all, including the current session.

### Registration, verification, and reset

- `acceptTerms` must be literally `true`; the server stores `termsAcceptedAt` on the user.
- Registration auto-creates a session and logs the user in. Email verification is **not currently
  required** to log in.
- Duplicate registration returns `409 EMAIL_ALREADY_REGISTERED`. Login and forgot-password use
  generic responses to reduce account enumeration; registration intentionally reveals that an
  email is already in use.
- Passwords must be 8–128 characters and contain lowercase, uppercase, and numeric characters.
  Passwords are hashed with bcrypt cost 12.
- Reset and verification tokens are random, stored only as SHA-256 hashes, single-use, and
  expiring. A successful reset invalidates all existing sessions.
- Email delivery is not implemented yet. In development/test only, registration returns
  `devEmailVerificationToken` and forgot-password returns `devResetToken` for existing active
  accounts. These fields are **never returned in production**.

### Roles and permissions

Global user roles: `customer`, `hotel_owner`, `hotel_staff`, `platform_support`,
`platform_admin`.

Hotel membership roles and permissions:

| Hotel role          | Permissions                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `owner`             | `manage_hotel`, `manage_staff`, `manage_inventory`, `manage_rates`, `manage_bookings`, `view_finance` |
| `manager`           | `manage_staff`, `manage_inventory`, `manage_rates`, `manage_bookings`, `view_finance`                 |
| `front_desk`        | `manage_bookings`                                                                                     |
| `inventory_manager` | `manage_inventory`, `manage_rates`                                                                    |
| `finance_viewer`    | `view_finance`                                                                                        |

The hotel's `partnerId` is treated as an owner even without an explicit membership row.
`platform_admin` bypasses tenant restrictions for operational access. `platform_support` has no
hotel permissions yet. Staff invitations may use `manager`, `front_desk`,
`inventory_manager`, or `finance_viewer`; `owner` cannot be assigned through invitations.

### Staff invitation limitation

There is no email delivery yet. An invitation can only be sent to an **existing, active account**.
The invitee sees the pending membership through `GET /me/memberships` and accepts it by
`membershipId`. Re-inviting a pending membership updates its role and returns `200`; an active
membership returns `409 MEMBERSHIP_ACTIVE`. Platform administrators cannot be invited. When the
last active staff membership is revoked, a `hotel_staff` user is restored to `customer`.

### Abuse protection

| Route group                                         | Limit                       |
| --------------------------------------------------- | --------------------------- |
| Global (non-test)                                   | 300 requests/minute         |
| Registration                                        | 20/hour                     |
| Partner registration                                | 5/hour                      |
| Login                                               | 10/minute                   |
| Refresh                                             | 60/minute                   |
| Logout / logout-all                                 | 30/minute / 10/minute       |
| Forgot / reset / change password                    | 5/hour / 10/hour / 10/hour  |
| Email verification                                  | 10/hour                     |
| Profile update                                      | 20/minute                   |
| Session revoke                                      | 30/minute                   |
| Staff invite / accept / revoke                      | 20/hour / 20/hour / 30/hour |
| Partner hotel create                                | 30/hour                     |
| Partner hotel submit                                | 60/hour                     |
| Partner media create/update/delete                  | 120/hour each               |
| Admin hotel review/approve/reject/suspend/reinstate | 120/hour each               |

Limits are currently in-memory per API process. A shared store (for example Redis) is required
before running multiple API instances. Tests raise the global limit to avoid interference;
per-route limits remain active.

## Planned contract (not yet implemented)

The Zod schemas in `packages/contracts` define intended wire shapes for later phases. Routes are
added with validation, authorization, and audit logging when their phase begins.

### Hotels, rooms, inventory

```text
GET    /hotels
GET    /hotels/:slug
GET    /hotels/:hotelId/room-categories

POST   /partner/hotels/:hotelId/room-categories
GET    /partner/hotels/:hotelId/room-categories
PATCH  /partner/room-categories/:roomCategoryId
POST   /partner/room-categories/:roomCategoryId/rooms
PATCH  /partner/rooms/:roomId
PUT    /partner/room-categories/:roomCategoryId/inventory
PUT    /partner/room-categories/:roomCategoryId/rates
```

### Remaining booking lifecycle (planned)

```text
GET  /bookings/:reference        (reference + secure access token)
POST /bookings/:reference/cancellation-requests
GET  /me/bookings

GET  /partner/bookings
GET  /partner/bookings/:bookingId
POST /partner/bookings/:bookingId/check-in
POST /partner/bookings/:bookingId/check-out
POST /partner/bookings/:bookingId/no-show
```

### Payments

```text
POST /payments/:paymentId/initialize
GET  /payments/:paymentId/status
POST /webhooks/:provider
```

Live payment processing remains blocked until the provider and marketplace/settlement model are
validated in writing.

### Admin

```text
GET  /admin/bookings
GET  /admin/payments
GET  /admin/refunds
POST /admin/bookings/:bookingId/refunds
GET  /admin/commission-agreements
POST /admin/commission-agreements
PATCH /admin/commission-agreements/:agreementId
GET  /admin/finance/ledger
GET  /admin/finance/payout-batches
POST /admin/finance/payout-batches
POST /admin/finance/payouts/:payoutId/mark-paid
POST /admin/finance/reconciliation-runs
GET  /admin/audit-logs
```

Route shapes may be refined with documented reasons and updated OpenAPI.

## Critical invariants

- Availability and prices are recalculated server-side at quote and booking time.
- Client-supplied hotel IDs, user IDs, roles, prices, commissions, and payment status are not
  trusted.
- Payment success requires server-side verification and/or a signature-validated webhook.
- Duplicate/out-of-order/duplicate webhook delivery must be safe.
- Booking, payment, refund, commission, payable, and payout remain distinct.
- Guest booking lookup requires the access token, not just the booking reference.
