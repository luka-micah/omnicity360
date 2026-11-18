# Hotel Booking Marketplace — AI Build Specification

> **Purpose:** This document is the project brief and source of truth for an AI coding agent building a hotel-booking marketplace for Nigeria.
>
> **How to use:** Save this file as `BUILD_SPEC.md` in the repository root. Give it to your coding AI before asking it to implement anything. The AI must read this document first, inspect the existing repository, and implement the project incrementally.
>
> **Product name:** Omnicity360. Use this name consistently in customer-facing branding and product metadata.
>
> **Current scope:** Multi-city Nigeria, responsive web application, Android-first mobile application, hotel partner portal, and platform admin portal.

---

## 1. Instructions to the AI coding agent

You are the lead software architect and implementation engineer for this project.

### Mandatory working rules

1. Read this entire file before making changes.
2. Inspect the repository and identify the existing framework, code conventions, tests, and incomplete work before choosing or changing architecture.
3. If the repository is empty, create the project structure specified below. If it already contains a working implementation, preserve useful code and propose migrations rather than replacing everything.
4. Work in small, verifiable increments. Do not attempt to generate the entire product in one response.
5. Start by producing:
   - a concise implementation plan;
   - the proposed repository structure;
   - key assumptions and unresolved decisions;
   - the first milestone's tasks.
6. Then implement **Phase 1 only** unless explicitly asked to continue. Finish each phase with tests, linting, type checking, and a summary of changed files and remaining work.
7. Do not create fake production integrations. Payment, SMS, email, cloud storage, maps, and other external integrations must use documented adapters and environment configuration.
8. Never claim a command or test passed unless you actually ran it and checked its result.
9. Never put secrets, API keys, passwords, private tokens, or real customer data in source control.
10. Do not use placeholder success responses for core business operations such as booking confirmation, payment verification, refunds, or payouts.
11. Do not trust prices, payment status, commissions, hotel ownership, roles, or inventory values sent by the client. Validate and calculate these on the server.
12. Use database transactions, appropriate constraints, and idempotency for financial and inventory operations.
13. When a decision is not specified, choose a conservative, maintainable default, document it, and ask only when the decision blocks safe implementation.
14. Keep `BUILD_SPEC.md` aligned with material product decisions. Record new decisions in `docs/DECISIONS.md`.
15. Do not expose internal error details, secrets, stack traces, or sensitive personal data in API responses or logs.

### Definition of implementation-ready

A feature is not complete merely because a screen or endpoint exists. It must have validation, authorization, loading/error/empty states where relevant, tests, auditability for sensitive operations, and documented behavior.

---

## 2. Product overview

Build a multi-hotel marketplace where:

- Hotels can register, submit their properties for approval, and manage hotel information.
- Approved hotels can create room categories and optionally manage individual physical rooms.
- Hotel staff can manage rates, availability, bookings, check-in/check-out, cancellation policies, and their financial statements.
- Customers can discover hotels across Nigerian cities, compare properties and room categories, check availability, see the full price, and book.
- Customers can book as registered users or as guests.
- Customers can pay online using a supported payment provider.
- The platform earns a configurable commission from each eligible booking.
- The platform maintains a financial ledger and reconciles hotel payouts, which are initially processed manually.
- Platform administrators manage hotel approval, customer support, bookings, refunds, commissions, settlements, audit logs, and platform configuration.

### Initial market and assumptions

- Primary market: Nigeria.
- Initial currency: NGN.
- Time zone for display and hotel operations: hotel-local time; store timestamps in UTC.
- Locations: multiple Nigerian cities, not just one city.
- Mobile priority: Android first.
- Web: responsive desktop, tablet, and mobile.
- Commission: configurable per hotel/agreement, with a platform default.
- Inventory: support both category-level quantity inventory and individually tracked physical rooms.
- Cancellations: hotels may choose from platform-approved policy options and configure permitted terms within platform rules.
- Checkout: registered-user and guest checkout.
- Hotel payouts: manual payout workflow supported by a traceable ledger and reconciliation.
- Payment provider: not permanently locked in. Implement a provider adapter. Validate the intended marketplace/collection/settlement model with the chosen provider and qualified advisers before production.
- Product name and visual identity: to be decided.

---

## 3. User roles and permissions

Use role-based access control (RBAC). A user may have more than one authorized relationship, but permissions must be checked on the server for every protected operation.

### Roles

1. **Guest**
   - Browse public hotels and room categories.
   - Search availability and request a price quote.
   - Create a booking using required contact information.
   - Access booking details using a secure, unguessable booking-access token or verified account flow.

2. **Customer**
   - All guest capabilities.
   - Manage profile and contact details.
   - View booking history.
   - Request cancellation and view payment/refund status.
   - Manage consent and notification preferences.

3. **Hotel owner / partner**
   - Create and manage only hotels they own or are explicitly assigned to.
   - Submit hotels for review.
   - Manage property content, room categories, physical rooms, inventory, rates, policies, and authorized staff.
   - View bookings for their own hotels.
   - Manage operational booking states within allowed rules.
   - View hotel statements and payout history.
   - Cannot approve their own hotel, change platform-wide settings, or alter the financial ledger directly.

4. **Hotel staff**
   - Access only hotels to which they have been assigned.
   - Permissions must be configurable by staff role (for example, front desk, inventory manager, finance viewer).
   - Cannot change ownership, platform commission agreements, or global settings unless explicitly granted by a narrowly scoped platform permission.

5. **Platform support**
   - Access only the minimum customer/booking information needed for support.
   - Sensitive actions must be audited.
   - No direct modification of payment-provider results or ledger history.

6. **Platform administrator**
   - Approve, reject, or suspend hotels.
   - Manage platform-wide configuration, approved cancellation rules, commission agreements, disputes, and authorized refunds.
   - Review audit logs, reconciliation reports, and payout batches.
   - Privileged actions must be audited; use stronger authentication for high-impact operations.

### Authorization requirements

- Enforce tenant isolation at the API/service layer and, where appropriate, database query helpers.
- A partner must never read or mutate another partner's hotels, rooms, bookings, customer data, or finance records by changing an ID in a request.
- Do not rely on hidden buttons or frontend role checks for security.
- Deny access by default.
- Use explicit permission checks for refunds, hotel approval, suspension, commission changes, payout recording, and staff management.

---

## 4. Core product modules

### 4.1 Authentication and identity

- Customer registration, login, logout, refresh/session handling, password reset, and email/phone verification as appropriate.
- Guest checkout without requiring account creation.
- Secure account linking if a guest later registers, with verification to prevent account takeover.
- Hotel partner registration and onboarding.
- Staff invitations and revocation.
- Secure password hashing using a current, well-maintained algorithm.
- Rate-limit login, password reset, verification, booking access, and other abuse-prone endpoints.
- Use secure, HTTP-only cookies for browser sessions where appropriate; never store long-lived sensitive credentials in insecure browser storage.
- Mobile authentication must use platform-appropriate secure token storage.
- Support session revocation and logout from active sessions.

### 4.2 Hotel onboarding and management

A hotel profile should support:

- Public name and slug.
- Description and property type.
- Address, city, state, country, and map coordinates if available.
- Contact information.
- Check-in/check-out times.
- Amenities and facilities.
- Images and image captions/ordering.
- House rules and accessibility information.
- Hotel-defined cancellation options within platform rules.
- Verification/onboarding documents where required.
- Approval status, rejection reason, suspension status, and internal notes.
- Created/updated timestamps and change history.

Hotel lifecycle:

`draft -> submitted -> under_review -> approved`

Alternative outcomes: `rejected`, `suspended`, `archived`.

Only approved, active hotels are publicly bookable. Do not delete historical booking or financial records when a hotel is suspended or archived.

### 4.3 Room categories and physical rooms

A hotel can create multiple room categories, for example Standard, Deluxe, Executive, or Suite.

Room-category fields may include:

- Name, slug, description.
- Maximum adults and children.
- Bed configuration.
- Room size and unit.
- Amenities.
- Images.
- Smoking/accessibility attributes where applicable.
- Base rate and applicable rate plans.
- Active/inactive state.
- Inventory mode.

Support two inventory modes:

**A. Category quantity inventory**
- Track the number of sellable units available per room category and date.
- Useful when the hotel does not need to assign a specific physical room at booking time.
- Availability must never go below zero.

**B. Individual physical-room inventory**
- Track each room by a hotel-scoped room identifier/number and category.
- Track maintenance/out-of-service status and date-specific occupancy.
- Avoid assigning the same physical room to overlapping confirmed bookings.
- Room assignment may occur at booking or during hotel operations, depending on hotel configuration.

Do not mix the two inventory modes for the same sellable unit in a way that double-counts capacity. Document and enforce the chosen mode for each category.

### 4.4 Rates, availability, and restrictions

Support:

- Date-specific nightly prices.
- Base/default rates with date overrides.
- Optional rate plans, such as refundable and non-refundable.
- Minimum/maximum stay restrictions where configured.
- Closed-to-arrival/closed-to-departure restrictions where configured.
- Inventory closures and maintenance blocks.
- Taxes and mandatory fees, clearly itemized.
- Optional extras, if enabled, clearly itemized.
- Currency code stored with monetary amounts.

All date ranges for hotel stays use **check-in inclusive, check-out exclusive** semantics. A stay from December 10 to December 13 covers the nights of December 10, 11, and 12: three nights.

Do not trust availability displayed earlier in a search result. Recalculate it when quoting and again atomically when creating a booking hold.

### 4.5 Search and discovery

Customer search should support:

- Destination: city or area.
- Check-in and check-out dates.
- Number of adults and children.
- Number of rooms.
- Filters for price, amenities, property type, and other useful attributes.
- Sorting by relevance, price, and rating when trustworthy review data exists.
- Pagination or cursor-based loading.
- Hotel detail pages with images, amenities, room categories, policies, location, and transparent pricing.
- Clear empty, loading, and error states.

Do not invent ratings or reviews. If reviews are not included in the first MVP, omit rating-based sorting and design the schema so reviews can be added later.

### 4.6 Quotes and pricing

A quote must be calculated by the backend and include:

- Hotel and room category.
- Stay dates and number of nights.
- Guest and room counts.
- Night-by-night rate breakdown.
- Discounts, if any, with who funds them.
- Taxes and mandatory fees.
- Optional extras, if selected.
- Total payable by customer.
- Currency.
- Applicable cancellation terms.
- Quote creation time and expiry time.
- A quote identifier/token that cannot be modified by the client.

The server must revalidate the quote when a booking is created. If the price or availability has changed, return a clear conflict and ask the customer to review the updated quote.

Represent money consistently. Prefer integer minor units (for example, kobo for NGN) with an explicit currency code, or a well-defined exact decimal strategy. Never use floating-point arithmetic for financial calculations.

### 4.7 Booking lifecycle

Suggested booking states:

- `pending_payment`
- `confirmed`
- `checked_in`
- `checked_out`
- `completed`
- `cancellation_requested`
- `cancelled`
- `expired`
- `no_show`
- `manual_review`

Transitions must be explicitly validated in the backend. A client must not set arbitrary states.

Typical flow:

1. Customer searches.
2. Backend returns current availability.
3. Customer requests a quote.
4. Customer submits guest/contact details and accepts relevant terms.
5. Backend creates a booking in `pending_payment` and reserves inventory for a configurable short hold period.
6. Backend initializes payment through the provider adapter.
7. Provider reports payment outcome; the server verifies the outcome using provider-supported server-side verification and signed webhook validation.
8. On verified success, atomically mark the payment successful, confirm the booking, commit inventory, snapshot the final price/policy, and create appropriate ledger entries.
9. Send confirmation and a booking reference.
10. Hotel staff manage operational states such as check-in and check-out.
11. On expiry or failed payment, release the hold safely.
12. Handle late payment success explicitly; do not blindly confirm if the inventory hold has expired and the room is no longer available. Route to a safe recovery/refund/manual-review path.

Use an opaque, hard-to-guess public booking reference. Never expose sequential database IDs as authorization secrets.

### 4.8 Payment processing

Implement a `PaymentProvider` interface so the application can use a chosen provider without spreading provider-specific code through the domain.

The adapter should cover, as supported by the chosen provider:

- Initialize checkout/payment.
- Verify transaction server-side.
- Validate webhook authenticity.
- Normalize provider events.
- Request refunds.
- Query transaction status.
- Map provider errors to safe internal errors.

Payment lifecycle may include:

`initialized -> pending -> processing -> succeeded`

Alternative states include `failed`, `abandoned`, `expired`, `refund_pending`, `partially_refunded`, `refunded`, and `disputed`.

Requirements:

- Never trust a client redirect or client-supplied status as proof of payment.
- Verify the amount, currency, provider reference, and expected booking/payment relationship.
- Webhook processing must be signature-validated, deduplicated, and idempotent.
- Store provider event identifiers and enforce uniqueness where appropriate.
- Use idempotency keys for payment initialization and refund operations where supported.
- Do not store card details or sensitive payment credentials.
- Handle delayed, duplicated, out-of-order, or missing webhooks.
- Do not confirm a booking merely because checkout initialization succeeded.
- Make payment recovery and status lookup available to the customer and support team.
- Keep payment, booking, refund, commission, hotel payable, and payout as distinct concepts.

**Critical pre-production requirement:** confirm in writing that the selected provider supports the intended marketplace model, including collecting customer payments for independent hotels, applicable onboarding/KYC, settlement timing, refunds, chargebacks, and manual payouts. Do not assume that a provider's generic split-payment feature automatically approves this business model.

### 4.9 Commission and hotel finance

- Platform-wide default commission.
- Hotel-specific commission agreement that can override the default.
- Commission stored in basis points (e.g. 5% = 500, 10% = 1000, 12.5% = 1250).
- Effective dates and audit history for commission changes.
- Snapshot the commission rate, calculation basis, and relevant agreement/version at booking confirmation.
- Do not retroactively alter confirmed booking commission when an agreement changes.
- Explicitly define whether commission applies to room revenue before or after discounts and which party funds discounts.
- Exclude taxes, refundable deposits, and other excluded items from the commission basis unless the signed agreement explicitly says otherwise.
- Show hotel partners booking-level statements, gross booking value, commission, refunds/adjustments, and net payable.
- Platform admin can prepare payout batches, mark a payout as sent/paid with reference and evidence, and reconcile the bank/provider statement.
- Payout recording requires actor, timestamp, amount, currency, destination reference, and notes/evidence as appropriate.
- Support partial payouts, failed payouts, adjustments, and reconciliation discrepancies.

#### Ledger rules

- Maintain an append-only or correction-by-reversal financial ledger.
- Never edit or delete posted financial entries to conceal history. Correct errors with linked reversal/adjustment entries.
- Each financial entry must be traceable to a booking, payment, refund, commission, or payout where relevant.
- Prevent duplicate ledger posting through idempotency and unique business references.
- Reconcile totals against the payment provider and payout records.
- Define and test accounting invariants before production.
- Restrict access to finance records and audit every sensitive action.

### 4.10 Cancellation, refund, and no-show

- Hotels can select permitted cancellation templates and configure terms within platform rules.
- Snapshot the policy and customer-facing wording at booking time so later changes do not rewrite an existing booking's terms.
- Support cancellation requests and outcomes.
- Calculate refund eligibility and amount on the server based on the booked policy and current state.
- Keep booking cancellation and payment refund as distinct processes and statuses.
- Support full and partial refunds, refund failures, hotel-initiated cancellation, no-show, and manual review.
- Refund operations must be idempotent and provider-verified.
- Clearly communicate the expected refund status without promising a bank settlement date that is not guaranteed.
- Log the actor, reason, calculation, and outcome for each cancellation/refund decision.

### 4.11 Notifications

Create a notification service abstraction for:

- Booking confirmation.
- Payment success/failure or pending status.
- Cancellation/refund updates.
- Booking reminders.
- Hotel booking alerts.
- Hotel approval/rejection/suspension.
- Payout and reconciliation notifications.

Email should be supported first. SMS or messaging integrations can be added through adapters. Notifications must not be the sole source of truth for booking/payment status.

### 4.12 Admin, support, and reporting

Admin portal features:

- Hotel review queue and hotel approval/rejection/suspension.
- Booking lookup and support tools.
- Payment and refund status.
- Commission agreement management.
- Finance ledger and hotel payable statements.
- Payout batch preparation and recording.
- Reconciliation reports and discrepancy flags.
- Audit-log search.
- Platform settings and operational monitoring.

Never give administrators an undocumented “force success” button for payments. If manual remediation is needed, implement a controlled, reason-required, audited workflow that does not falsify provider facts.

### 4.13 Reviews (post-MVP unless needed)

If reviews are added later:
- Only eligible guests with a completed stay can review.
- Prevent duplicate reviews for the same booking unless an explicit revision flow exists.
- Include moderation/reporting.
- Do not fabricate ratings or display unverified reviews as verified stays.

---

## 5. Recommended technical architecture

Use TypeScript throughout the web/API/mobile code where practical.

### Default stack

- **Web frontend:** Next.js + TypeScript.
- **Mobile:** React Native with Expo + TypeScript; Android first.
- **Backend API:** Node.js + Fastify + TypeScript.
- **Database:** PostgreSQL.
- **ORM and migrations:** Prisma.
- **Background jobs:** Redis + BullMQ, introduced when required for expiry, notifications, retries, and reconciliation.
- **Image storage:** Cloudinary or another object-storage provider through an adapter.
- **API documentation:** OpenAPI.
- **Testing:** Vitest or an equivalent supported test runner; API integration tests and end-to-end tests.
- **Deployment:** select services based on operational needs; keep secrets in environment/secret management, not in source code.

Do not introduce extra services or complex microservices without a concrete need. Start with a modular monolith: one API, one database, and clear domain boundaries.

### Suggested monorepo

```text
hotel-marketplace/
├── apps/
│   ├── web/                 # Next.js customer, partner and admin web experiences
│   ├── mobile/              # React Native / Expo Android-first app
│   └── api/                 # Fastify API
├── packages/
│   ├── contracts/           # Shared schemas/types/API contracts
│   ├── config/              # Shared lint/TypeScript configuration
│   └── domain/              # Shared domain types and pure business rules
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   ├── DECISIONS.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   └── RUNBOOK.md
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── BUILD_SPEC.md
```

Adapt this structure to the repository if it already has a sound setup. Keep shared API contracts free of browser, server, and mobile runtime assumptions.

### Domain boundaries

Keep modules clearly separated:

- identity and access;
- hotel onboarding and partner management;
- hotel content and media;
- room categories and physical rooms;
- rates and availability;
- search and discovery;
- quotes and pricing;
- bookings and inventory holds;
- payments and webhooks;
- cancellations and refunds;
- commissions and ledger;
- payouts and reconciliation;
- notifications;
- admin and audit.

Business rules belong in services/domain modules, not duplicated in UI components or route handlers.

---

## 6. Initial database model

Design the Prisma schema around these entities. This is a conceptual list, not a command to blindly create every table before checking relationships and normalization.

### Identity and access
- `User`
- `UserSession` or equivalent session/token record
- `CustomerProfile`
- `HotelMembership` or `HotelStaffMembership`
- `Role` / `Permission` if a configurable permission model is needed
- `VerificationToken` or equivalent

### Hotel and inventory
- `Hotel`
- `HotelAddress` if address normalization is useful
- `HotelMedia`
- `Amenity`
- `HotelAmenity`
- `RoomCategory`
- `RoomCategoryMedia`
- `PhysicalRoom`
- `RatePlan`
- `NightlyRate` or date-based rate override
- `InventoryDay` or equivalent category inventory record
- `InventoryHold`
- `MaintenanceBlock`
- `CancellationPolicy`
- `HotelCancellationPolicy` or equivalent policy configuration

### Booking
- `Quote` if persistent quote tracking is required
- `Booking`
- `BookingGuest`
- `BookingRoom` / booking line item
- `BookingNight` or immutable nightly price snapshot
- `BookingStatusHistory`
- `BookingPolicySnapshot`
- `CancellationRequest`

### Payments and finance
- `Payment`
- `PaymentProviderEvent`
- `Refund`
- `CommissionAgreement`
- `BookingCommissionSnapshot`
- `LedgerAccount` if using a double-entry model
- `LedgerTransaction`
- `LedgerEntry`
- `HotelPayout`
- `PayoutBatch`
- `ReconciliationRun`
- `ReconciliationItem`

### Operations
- `Notification`
- `AuditLog`
- `IdempotencyRecord` where useful
- `Review` (optional/post-MVP)

### Schema rules

- Use stable IDs (UUIDs or another deliberate non-sequential public-safe identifier strategy).
- Add `createdAt` and `updatedAt` where appropriate.
- Use explicit enums or constrained state representations.
- Add unique constraints and indexes based on actual access patterns.
- Store currency explicitly with monetary values.
- Use UTC timestamps for stored instants.
- Preserve historical booking, payment, refund, commission, and payout data.
- Snapshot the customer-facing price breakdown, cancellation terms, and commission basis/rate at the appropriate point in the lifecycle.
- Avoid storing derived totals in multiple places unless the invariant and update strategy are clear.
- Never use a simple read-then-write sequence to reserve the last room without transaction/locking/conditional-update protection.
- Define foreign-key delete behavior deliberately. Financial and booking history must not cascade-delete.
- Add indexes for hotel status/location, room category lookup, date-based availability, booking reference, user booking history, payment references, and ledger/payout queries as appropriate.
- Consider PostgreSQL exclusion constraints or transactional conflict checks for overlapping bookings of physical rooms.
- Document any limitation in Prisma's ability to express a required database constraint and add a migration when needed.

Before implementing migrations, write a short relationship map and explain how category inventory and physical-room inventory avoid double-counting.

---

## 7. API conventions and initial endpoint map

Prefix the API with `/api/v1`. Use JSON, schema validation, consistent errors, pagination, and OpenAPI documentation.

### Public and customer endpoints

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/password/forgot
POST   /api/v1/auth/password/reset

GET    /api/v1/hotels
GET    /api/v1/hotels/:slug
GET    /api/v1/hotels/:hotelId/room-categories
POST   /api/v1/availability/search
POST   /api/v1/bookings/quotes
POST   /api/v1/bookings
GET    /api/v1/bookings/:reference
POST   /api/v1/bookings/:reference/cancellation-requests
GET    /api/v1/me/bookings
GET    /api/v1/me/profile
PATCH  /api/v1/me/profile

POST   /api/v1/payments/:paymentId/initialize
GET    /api/v1/payments/:paymentId/status
POST   /api/v1/webhooks/:provider
```

Guest booking access must require an appropriate secure access mechanism; possession of a predictable booking ID alone is insufficient.

### Hotel partner endpoints

```text
POST   /api/v1/partner/hotels
GET    /api/v1/partner/hotels
GET    /api/v1/partner/hotels/:hotelId
PATCH  /api/v1/partner/hotels/:hotelId
POST   /api/v1/partner/hotels/:hotelId/submit

POST   /api/v1/partner/hotels/:hotelId/room-categories
GET    /api/v1/partner/hotels/:hotelId/room-categories
PATCH  /api/v1/partner/room-categories/:roomCategoryId

POST   /api/v1/partner/room-categories/:roomCategoryId/rooms
PATCH  /api/v1/partner/rooms/:roomId

PUT    /api/v1/partner/room-categories/:roomCategoryId/inventory
PUT    /api/v1/partner/room-categories/:roomCategoryId/rates

GET    /api/v1/partner/bookings
GET    /api/v1/partner/bookings/:bookingId
POST   /api/v1/partner/bookings/:bookingId/check-in
POST   /api/v1/partner/bookings/:bookingId/check-out
POST   /api/v1/partner/bookings/:bookingId/no-show

GET    /api/v1/partner/finance/statement
GET    /api/v1/partner/payouts
```

### Platform admin endpoints

```text
GET    /api/v1/admin/hotels
POST   /api/v1/admin/hotels/:hotelId/approve
POST   /api/v1/admin/hotels/:hotelId/reject
POST   /api/v1/admin/hotels/:hotelId/suspend

GET    /api/v1/admin/bookings
GET    /api/v1/admin/payments
GET    /api/v1/admin/refunds
POST   /api/v1/admin/bookings/:bookingId/refunds

GET    /api/v1/admin/commission-agreements
POST   /api/v1/admin/commission-agreements
PATCH  /api/v1/admin/commission-agreements/:agreementId

GET    /api/v1/admin/finance/ledger
GET    /api/v1/admin/finance/payout-batches
POST   /api/v1/admin/finance/payout-batches
POST   /api/v1/admin/finance/payouts/:payoutId/mark-paid
POST   /api/v1/admin/finance/reconciliation-runs

GET    /api/v1/admin/audit-logs
```

These routes are a starting contract. The agent may refine them if it records the reason and updates OpenAPI/docs. Never implement sensitive endpoints without authentication, authorization, validation, and audit logging.

### Standard error format

Use a consistent error shape, for example:

```json
{
  "error": {
    "code": "AVAILABILITY_CHANGED",
    "message": "Availability or price changed. Please review the updated offer.",
    "requestId": "request-correlation-id"
  }
}
```

Do not expose stack traces, database details, secrets, or provider credentials in client-facing errors.

### API requirements

- Validate all request params, query params, and bodies.
- Use a consistent pagination convention.
- Generate and return a request/correlation ID.
- Support idempotency for booking creation, payment initialization, refunds, and other retry-prone operations.
- Document authentication requirements and response schemas in OpenAPI.
- Use safe logging and redact sensitive fields.
- Use appropriate HTTP status codes.
- Never trust `hotelId`, `userId`, role, price, commission, or payment status merely because it came from the request body.

---

## 8. Concurrency, inventory, and idempotency

Inventory and payment races are core business risks. Treat them as first-class engineering requirements.

### Inventory reservation

- Use a PostgreSQL transaction with row locking or a conditional atomic update.
- A category's sellable quantity must never be oversold.
- Physical rooms must not have overlapping confirmed occupancy.
- Pending holds must reduce available inventory during the hold window.
- Holds need an expiry timestamp and a reliable background expiry/recovery process.
- Never release inventory just because a timer elapsed if a payment may still be processing; check payment status and follow a defined recovery path.
- Expired holds and late payment success must be reconciled safely.
- Use database constraints as a backstop, not only frontend checks.

### Idempotency

- A retry must not create duplicate bookings, charges, refunds, webhook effects, ledger postings, or payout records.
- Store idempotency keys and the result/operation association for a defined retention period.
- Provider event IDs must be deduplicated.
- A webhook may arrive more than once and may arrive out of order.
- A customer redirect page is not authoritative proof of payment.
- Use transaction boundaries that keep booking, inventory, payment state, and financial postings consistent.
- If external API calls cannot be part of a database transaction, use a reliable state machine/outbox or retryable workflow rather than assuming atomicity across systems.

---

## 9. Security, privacy, and compliance

Build security into the foundation.

- Follow least privilege and server-side authorization.
- Validate and normalize all inputs.
- Protect against injection, cross-site scripting, CSRF where relevant, brute force, account enumeration, and insecure direct object references.
- Use secure cookies and suitable CORS/CSRF settings for the deployment model.
- Rate-limit authentication, guest booking access, quotes, payment initialization, and sensitive endpoints.
- Verify webhook signatures using the provider's documented method.
- Store secrets only in environment/secret management.
- Redact tokens, passwords, payment data, and unnecessary personal information from logs.
- Encrypt traffic in transit; use appropriate encryption and access controls for stored data and backups.
- Define retention/deletion policies for personal data while preserving legally required booking/financial records.
- Collect only necessary guest data and document why each field is needed.
- Provide clear privacy information and customer-facing terms.
- Maintain an auditable trail for privileged changes and financial operations.
- Review the Nigeria Data Protection Act 2023 and applicable NDPC guidance with qualified counsel/privacy expertise.
- Confirm payment-provider approval, merchant/marketplace terms, KYC obligations, chargeback/refund responsibilities, tax treatment, and settlement obligations before production.
- Do not claim the system is legally compliant solely because it implements this document.

Create `docs/SECURITY.md` and document operational secrets, webhook configuration, backup/restore, incident response, and access review.

---

## 10. Web and mobile UX requirements

### Customer web and Android app

Minimum screens:

1. Home/search.
2. Search results with filters and sorting.
3. Hotel details.
4. Room-category/rate selection.
5. Guest/contact details.
6. Booking summary and full price breakdown.
7. Payment handoff/status/recovery.
8. Booking confirmation.
9. Booking details and cancellation request.
10. Sign in/register.
11. Customer profile and booking history.
12. Help/support and terms/privacy links.

UX rules:

- Responsive layout and accessible labels/contrast/focus states.
- Clear loading, empty, validation, error, offline, and retry states.
- Show dates, nights, guests, room count, currency, fees, cancellation terms, and total before payment.
- Never show a false success screen based only on a redirect.
- Handle app termination and reopening during payment by fetching booking/payment status from the server.
- Use secure mobile storage for credentials.
- Deep links must be validated and must not bypass authorization.

### Hotel partner portal

Minimum screens:

1. Partner registration/login.
2. Onboarding progress and hotel submission.
3. Hotel profile editor.
4. Image/media manager.
5. Room categories and room editor.
6. Rates and availability calendar/table.
7. Booking list and booking details.
8. Check-in/check-out/no-show actions.
9. Cancellation/policy settings.
10. Finance statement and payout history.
11. Staff access management (can be staged after MVP).

### Admin portal

Minimum screens:

1. Admin overview.
2. Hotel review queue.
3. Hotel detail and approval decision.
4. Booking search and support details.
5. Payment/refund monitoring.
6. Commission agreement management.
7. Ledger/statement/payout management.
8. Reconciliation discrepancies.
9. Audit-log viewer.

Use reusable components and shared design tokens. Do not create a different, inconsistent visual language for every module.

---

## 11. Testing strategy

### Unit tests

Test pure domain logic, including:

- Number of nights and date boundaries.
- Price calculations and rounding.
- Commission calculations.
- Cancellation/refund eligibility.
- Booking state transitions.
- Quote expiry.
- Inventory availability calculations.
- Permission checks.

### Integration tests

Test API + database behavior:

- Registration/login and authorization.
- Hotel tenant isolation.
- Hotel submission and approval.
- Category and physical-room inventory.
- Quote and booking creation.
- Concurrent attempts to reserve the last unit.
- Payment webhook signature/deduplication.
- Repeated webhook events.
- Duplicate payment initialization.
- Late payment after hold expiry.
- Refund idempotency.
- Ledger posting and reversal.
- Payout recording and reconciliation.
- Invalid state transitions.

### End-to-end tests

Cover at least:

1. Guest searches, books, pays in test mode, and retrieves confirmation.
2. Registered customer completes a booking and views booking history.
3. Partner creates a hotel and submits it for approval.
4. Admin approves the hotel.
5. Partner adds room inventory/rates and receives a booking.
6. Partner views financial statement.
7. Customer requests cancellation and a permitted refund workflow completes in test mode.
8. Unauthorized partner access to another hotel's records is denied.
9. Simultaneous booking attempts cannot oversell inventory.

### Required quality gates

Before marking a phase complete, run the relevant:

- formatter;
- linter;
- type checker;
- unit tests;
- integration tests;
- build;
- migration validation.

Report failures honestly. Do not silence tests or disable type checking just to get a green result.

---

## 12. Environment and operations

Create `.env.example` with names and safe example placeholders only. Do not include real secrets.

Likely variables:

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=
REDIS_URL=
WEB_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001
MOBILE_SCHEME=
SESSION_SECRET=
PAYMENT_PROVIDER=
PAYMENT_SECRET_KEY=
PAYMENT_PUBLIC_KEY=
PAYMENT_WEBHOOK_SECRET=
EMAIL_PROVIDER=
EMAIL_API_KEY=
EMAIL_FROM=
STORAGE_PROVIDER=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
LOG_LEVEL=info
```

Adapt variables to the selected provider and architecture. Never expose secret values through a `NEXT_PUBLIC_` variable or mobile bundle.

Required operational practices:

- Separate development, test, staging, and production configuration.
- Database migrations are version-controlled.
- Seed data is fictional and only used in development/test.
- Automated backups and a tested restore procedure.
- Health/readiness endpoints that do not leak sensitive details.
- Structured logs with request IDs.
- Error monitoring and alerts for payment/webhook failures, inventory anomalies, and reconciliation mismatches.
- A repeatable deployment process and rollback plan.
- Background jobs must be retryable and observable.

---

## 13. MVP scope and exclusions

### MVP must include

- Authentication plus guest checkout.
- Partner registration and hotel submission.
- Admin hotel approval.
- Hotel profile and media.
- Room categories.
- At least one reliable inventory mode, with the schema designed to support both modes without double-counting.
- Nightly rates and date-based availability.
- Hotel search and detail pages.
- Server-side quotes and transparent totals.
- Booking creation with expiring inventory holds.
- One payment provider in test mode behind an adapter.
- Verified webhooks and payment recovery.
- Booking confirmation and notifications.
- Cancellation policy snapshot and initial cancellation/refund workflow.
- Hotel-specific commission snapshot.
- Finance ledger and manual payout/reconciliation workflow.
- Partner booking dashboard.
- Admin support/finance tools.
- Android app with core customer search-to-book flow.
- Tests, audit logging, OpenAPI, and deployment documentation.

### Defer unless specifically prioritized

- Multi-country and multi-currency support.
- Flights, transport, tours, or package bookings.
- Loyalty points, coupons, and complex promotions.
- Reviews and ratings.
- AI-powered recommendations or chatbot.
- Dynamic pricing.
- Corporate accounts and negotiated rates.
- Offline booking.
- Automated bank payouts.
- Multiple payment providers in production.
- Advanced analytics/data warehouse.
- iOS launch, unless required by the product owner.

Do not expand the MVP without recording the scope change.

---

## 14. Suggested implementation phases

### Phase 1 — Foundation

- Inspect repository and document findings.
- Set up monorepo/workspaces if needed.
- Configure TypeScript, linting, formatting, environment validation, and CI.
- Set up Fastify API with health endpoint and OpenAPI.
- Set up PostgreSQL and Prisma.
- Add first migrations and development seed.
- Add structured logging and request IDs.
- Write `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and setup instructions.
- Add basic unit/integration test setup.

**Acceptance:** clean install works; app/API start using documented commands; database migration and seed work; health endpoint and OpenAPI work; lint/typecheck/tests/build pass.

### Phase 2 — Identity and access

- Customer registration/login/session management.
- Hotel partner identity and memberships.
- Role/permission guards.
- Test tenant isolation and abuse protection.

### Phase 3 — Hotel onboarding

- Hotel CRUD and media metadata.
- Submission/review/approval lifecycle.
- Admin approval UI/API.
- Partner dashboard foundation.

### Phase 4 — Room inventory and rates

- Room categories and inventory modes.
- Physical rooms where enabled.
- Date-based rates, restrictions, and maintenance blocks.
- Concurrency-safe availability logic.
- Inventory tests.

### Phase 5 — Search and quotes

- Destination/date/guest search.
- Filters, pagination, hotel detail.
- Pricing service and immutable quote result.
- Full price breakdown and expiry.

### Phase 6 — Booking engine

- Booking state machine.
- Inventory holds and expiry/recovery worker.
- Booking details and secure guest access.
- Booking history and hotel booking operations.

### Phase 7 — Payments and notifications

- Provider adapter and test-mode integration.
- Server-side verification and signed webhooks.
- Idempotency, retries, recovery, email notifications.
- Late payment and failed-payment workflows.

### Phase 8 — Cancellation and finance

- Cancellation/refund workflow.
- Commission agreements and booking snapshots.
- Ledger, hotel statements, payout batches, reconciliation.
- Admin finance tools and audit review.

### Phase 9 — Web and Android customer experiences

- Complete responsive web booking journey.
- Android search-to-book journey.
- Payment return/recovery/deep links.
- Accessibility and UX polish.

### Phase 10 — Hardening and pilot

- End-to-end, concurrency, security, and regression tests.
- Performance checks and observability.
- Backup/restore rehearsal.
- Provider and legal/compliance validation.
- Pilot with a small set of approved hotels.
- Reconcile real-world workflows before public launch.

A reasonable early planning estimate is approximately 14–18 weeks for a focused team, but this is not a guarantee. Scope, team size, payment-provider approval, design, and integration complexity can materially change the timeline.

---

## 15. Core acceptance criteria

The product must not be considered production-ready until these conditions are satisfied:

- Unapproved or suspended hotels cannot accept new bookings.
- A partner cannot access another partner's data.
- Availability is rechecked on the server at quote and booking time.
- Concurrent attempts cannot oversell the final available category unit.
- A physical room cannot be assigned to overlapping stays.
- Quote totals and commission are calculated server-side using exact money arithmetic.
- The booking stores the relevant price and policy snapshots.
- A booking is not confirmed solely from a client redirect or payment initialization.
- Duplicate or delayed webhooks do not duplicate charges, bookings, refunds, or ledger entries.
- A payment received after a hold expires follows a defined safe recovery path.
- Refunds are authorized, idempotent, and traceable.
- Ledger corrections preserve the original entries and create linked adjustments/reversals.
- Manual payouts are traceable to a batch, amount, currency, operator, timestamp, and reference/evidence.
- Customer-facing price and cancellation terms are clear before payment.
- Sensitive data and secrets are not leaked in logs or API errors.
- Core flows have automated tests.
- Deployment, migration, backup, and recovery procedures are documented.
- The payment-provider marketplace/settlement model has been validated before live transactions.

---

## 16. Known risks and decisions to validate

Track these in `docs/DECISIONS.md` rather than silently assuming them:

1. **Brand/name:** final name, domain, visual identity.
2. **Payment model:** whether the selected provider explicitly supports the proposed collection and manual settlement model for independent hotels.
3. **Hotel verification:** exact business documents, identity checks, bank-account verification, and review process.
4. **Commission basis:** gross/net room revenue, discount funding, taxes/fees, refunds, and adjustments.
5. **Inventory mode:** whether each hotel/category uses quantity inventory, physical-room assignment, or a controlled mix.
6. **Cancellation rules:** platform-wide minimum protections and permitted hotel policy choices.
7. **Guest identity:** required fields, verification, and secure access to booking details.
8. **Taxes and accounting:** tax display, invoicing, platform revenue recognition, and reporting.
9. **Data protection:** retention, deletion, consent, privacy notices, and incident handling.
10. **Launch geography:** initial cities and hotel acquisition/onboarding strategy.
11. **Support operations:** dispute escalation, no-show evidence, hotel cancellation, and emergency contact flow.
12. **Payout approvals:** whether high-value payouts require a second approver.

Do not launch live payments until critical provider, legal, tax, and operational questions have been resolved.

---

## 17. First instruction to the coding AI

After reading this file, do the following **in order**:

1. Inspect the current repository and report its structure and current state.
2. Identify whether it is empty or contains existing code.
3. Present a short architecture and Phase 1 implementation plan consistent with this document.
4. Identify blocking decisions only; do not delay foundation work for non-blocking branding decisions.
5. Implement **Phase 1 only**.
6. Add setup instructions and `.env.example`.
7. Run and report formatting, lint, type checking, tests, migrations, seed, and build as applicable.
8. Summarize:
   - files created/changed;
   - commands run and actual results;
   - decisions made;
   - known limitations;
   - the exact next phase and its first tasks.

Do not implement all phases in one pass. Prioritize a reliable foundation and preserve this file as the project's governing specification.
