# Security

This document records the security baseline and operational requirements. It is not a claim of
legal or regulatory compliance. NDPA 2023 and payment-provider obligations must be reviewed with
qualified counsel before launch.

## Current implemented controls (through Phase 3)

- Environment configuration validated at startup with Zod. Missing/invalid required values stop
  the process. Production refuses development/placeholder `SESSION_SECRET` values.
- Secrets supplied only via environment; `apps/api/.env` is git-ignored. `.env.example` contains
  placeholders only.
- Helmet security headers; CSP enabled in production.
- CORS restricted to `WEB_BASE_URL` outside development, with credentials and an explicit header
  allow-list.
- Global rate limiting (300 requests/minute; raised in tests only) plus per-route limits for
  registration, login, refresh, logout, password reset/change, email verification, profile
  updates, session revocation, staff management, hotel creation/submission/media, and admin hotel
  actions. Limits are currently in-memory and therefore per API process.
- Request body limit of 1 MB.
- Structured logging with request IDs. Authorization headers, cookies, passwords, tokens, and
  secrets are redacted.
- Central error handler: stable error envelope, request ID, no stack traces or database details.
- Passwords hashed with bcrypt cost 12; password policy enforced server-side.
- Login runs bcrypt even for unknown accounts to reduce timing-based account enumeration. Login
  and forgot-password responses are generic.
- Access tokens are short-lived HS256 JWTs (default 15 minutes) with unique `jti`, bound to a
  server-side session. Every authenticated request re-checks the session and user in PostgreSQL,
  so revocation/deactivation is immediate.
- Refresh tokens are opaque 256-bit values, stored only as SHA-256 hashes, rotated on refresh,
  and revoked on logout, password reset, and all-session logout.
- Browser refresh cookie `hm_refresh` is HttpOnly, SameSite=Lax, Secure in production, and scoped
  to `/api/v1/auth`. Mobile clients receive the refresh token in the response body for platform
  secure storage.
- Password-reset and email-verification tokens are random, stored hashed, single-use, and
  expiring. Raw tokens are exposed as development-only fields and never returned in production.
- RBAC combines global roles with hotel membership roles and explicit permissions. Unauthorized
  hotel access returns 404 to prevent tenant enumeration. Cross-tenant and permission tests exist.
  Hotel content changes (and submission) additionally require `manage_hotel`, and all admin hotel
  review endpoints require `platform_admin`.
- Audit records are written for registration, login, logout/session revocation, password changes,
  email verification, staff invitation/acceptance/revocation, and hotel onboarding (create, update,
  submit, review, approve, reject, suspend, reinstate), including actor, action, entity, IP, and
  user agent where available.
- Hotel approval is not a free-form status write: each admin action validates `HotelStateMachine`
  and then updates the row with `WHERE id AND status`, so two concurrent approvals cannot both
  succeed and no action bypasses the lifecycle.
- Partner updates are partial by contract. Update schemas are deliberately free of `default`
  keywords because Fastify's AJV applies defaults before validation; this prevents request bodies
  from overwriting stored values (D-025).
- Hotel media, submission documents, and external links must be `http(s)` URLs;
  `javascript:`/`data:` schemes are rejected at the contract layer. The API stores metadata only
  and never fetches or proxies those URLs.
- `Hotel.internalNotes` (reviewer working record) is excluded from partner serializers and only
  returned on admin endpoints.
- Registration stores `termsAcceptedAt`; marketing consent is a separate opt-in flag.
- Prisma parameterises queries; no raw SQL is used except the health probe and test-only cleanup.
- Integration tests refuse to run against a database whose name does not end in `_test`.
- Money, dates, and state machines are domain-validated; financial values from clients are not
  trusted by design.

## Required before production

1. **Email delivery and verification policy:** configure a transactional email provider, send
   reset/verification/invitation messages, stop relying on development token fields, and decide
   whether verification is mandatory at launch.
2. **Distributed rate limiting:** move limits to a shared store (for example Redis) before running
   more than one API instance; in-memory limits do not coordinate across processes.
3. **CSRF/origin checks:** the refresh cookie is SameSite=Lax and access tokens are sent in an
   Authorization header, which mitigates classic CSRF. Add explicit origin/CSRF validation before
   adding any state-changing route authenticated solely by cookie.
4. **Token/key rotation:** implement a key-id strategy for `SESSION_SECRET` so signing keys can be
   rotated without invalidating every access token at once. Revoke sessions after suspected
   refresh-token compromise.
5. **Guest access:** booking reference plus unguessable access token; rate-limit lookup; never
   authorize on a sequential ID alone.
6. **Payments:** signed webhook verification, amount/currency/reference matching, replay
   deduplication, idempotent initialization/refunds, no client-trusted status.
7. **Audit controls:** define retention, access control, and tamper-evidence for `AuditLog`; the
   current table is application-written but not yet append-only at the database level.
8. **Data minimisation and retention:** collect only necessary guest data; document purpose,
   retention, deletion, and NDPA 2023 obligations.
9. **Encryption and backups:** TLS in transit; encrypted backups; access-controlled production
   database; tested restore procedure.
10. **Dependency and secret scanning:** CI checks for known vulnerabilities; secrets never logged.
11. **Incident response:** runbook, contact tree, and provider escalation paths.
12. **Deployment cookie strategy:** confirm the production cookie domain and whether web/API share
    a registrable domain.
13. **Media and KYC document handling:** hotel images and verification documents are currently
    unverified external links. Before they can support approval decisions, introduce controlled
    uploads (signed URLs), malware scanning, size/type limits, and retention/deletion rules.

## Secrets management

| Secret                                          | Purpose                       | Notes                                                           |
| ----------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                                  | PostgreSQL connection         | Use least-privilege DB role; TLS in non-local environments      |
| `SESSION_SECRET`                                | Access-token signing          | >= 32 random bytes; production guard; rotate with a key-id plan |
| `PAYMENT_SECRET_KEY` / `PAYMENT_WEBHOOK_SECRET` | Provider API and webhook auth | Never exposed to web/mobile bundles                             |
| `EMAIL_API_KEY`                                 | Transactional email           | Scoped to sending only                                          |
| `CLOUDINARY_*`                                  | Media storage                 | Use signed uploads; restrict transformations                    |

Rules:

- Never use `NEXT_PUBLIC_`/mobile-bundled variables for server secrets.
- Rotate any secret that may have been exposed; assume compromise until proven otherwise.
- Rotating `SESSION_SECRET` invalidates existing access tokens, but opaque refresh tokens remain
  valid until their sessions are revoked. For a signing-key incident, rotate the secret **and**
  revoke sessions.
- Do not paste production secrets into tickets, chat, logs, or test fixtures.

## Logging and PII

- Log request metadata, status, latency, and request ID.
- Do not log passwords, tokens, cookies, authorization headers, full card data, or provider
  secrets. Redaction is configured centrally; add paths when new sensitive fields appear.
- Audit records include actor email, IP address, and user agent. Treat them as personal data,
  restrict access, and define retention.
- Provider payloads may contain PII. Store only what is needed for reconciliation, restrict
  access, and define retention.

## Development-only token fields

`devEmailVerificationToken` and `devResetToken` are returned only when `NODE_ENV` is not
`production`. They exist to test flows before email delivery is implemented. Production must not
depend on them, and they must not appear in client bundles or logs. The API omits them in
production.

## Vulnerability handling

Report suspected vulnerabilities privately to the project owner. Do not open public issues with
exploit details. Triage by impact, rotate credentials if exposed, preserve evidence, and document
the remediation.

## Payment-specific requirements

- Validate in writing that the provider supports collecting payments for independent hotels,
  KYC/onboarding, settlement timing, refunds, chargebacks, and manual payouts.
- Never add a "force success" action. Manual remediation must be a reason-required, audited
  workflow that does not alter provider facts.
- Keep payment, booking, refund, commission, payable, and payout states distinct.
