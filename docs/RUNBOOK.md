# Runbook

Operational procedures for local development and (later) staging/production.

## Local development

```bash
pnpm install
cp .env.example apps/api/.env   # set DATABASE_URL, SESSION_SECRET
pnpm db:generate
pnpm db:migrate:deploy          # apply committed migrations
pnpm db:seed
pnpm dev                        # http://localhost:3001
```

The API loads `apps/api/.env` automatically. Variables already set in the shell or CI
environment take precedence over the file. `apps/api/.env` is git-ignored; never commit it.

Checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Test database

Integration tests truncate identity tables and require committed migrations. They must never run
against a development, staging, or production database.

Create a disposable local database (PostgreSQL must be running):

```bash
psql -U postgres -c "CREATE DATABASE hotel_marketplace_test;"
```

Apply migrations to it:

```bash
# PowerShell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_marketplace_test?schema=public'
pnpm --filter @hotel-marketplace/api exec prisma migrate deploy
Remove-Item Env:DATABASE_URL

# bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/hotel_marketplace_test?schema=public' \
  pnpm --filter @hotel-marketplace/api exec prisma migrate deploy
```

Run tests with either `TEST_DATABASE_URL` or the local fallback:

```bash
# Preferred: explicit test URL
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_marketplace_test?schema=public'
pnpm test
Remove-Item Env:TEST_DATABASE_URL
```

Selection order is `TEST_DATABASE_URL`, then `DATABASE_URL`, then
`postgresql://postgres:postgres@localhost:5432/hotel_marketplace_test`. The test setup refuses any
database whose name does not end in `_test`. CI provides a disposable PostgreSQL 16 service and
applies migrations before running tests.

## Database migrations

Development:

```bash
pnpm db:migrate            # creates a new migration from schema changes
```

Shared environments (staging/production):

```bash
pnpm --filter @hotel-marketplace/api exec prisma migrate deploy
```

Rules:

- Commit migration SQL. Never edit an applied migration.
- Back up before destructive migrations.
- Run migrations as a release step before starting new API instances.
- `prisma db push` is for disposable local databases only.

### Restore exercise (required before production)

1. Provision a clean database.
2. Restore the latest encrypted backup.
3. Verify row counts and a sample of financial invariants (ledger balanced, payout totals).
4. Run `prisma migrate status` and confirm it is up to date.
5. Record the exercise date, operator, and duration.

## Health and monitoring

| Endpoint        | Meaning              | Alert                 |
| --------------- | -------------------- | --------------------- |
| `/health/live`  | Process is running   | Restart if failing    |
| `/health/ready` | PostgreSQL reachable | Page on sustained 503 |
| `/health`       | Simple uptime probe  | Load balancer check   |

Logs are structured JSON with `requestId`. Correlate client reports with that ID.

## Authentication and session incidents

Access tokens are JWTs, but every authenticated request checks the referenced session in
PostgreSQL. Revoking the session therefore blocks the access token immediately, even before the
JWT expires.

Revoke all sessions for a user:

```sql
UPDATE user_sessions
SET revoked_at = now()
WHERE user_id = '<user-uuid>'
  AND revoked_at IS NULL;
```

Verify:

```sql
SELECT id, created_at, last_used_at, expires_at, revoked_at
FROM user_sessions
WHERE user_id = '<user-uuid>'
ORDER BY created_at DESC;
```

Review the audit trail:

```sql
SELECT created_at, action, actor_email, entity_type, entity_id, ip_address, severity
FROM audit_logs
WHERE actor_id = '<user-uuid>'
ORDER BY created_at DESC;
```

Response steps:

1. Revoke the affected user's sessions; for a suspected signing-key compromise, rotate
   `SESSION_SECRET` **and** revoke sessions. Rotating the secret invalidates access tokens, but
   opaque refresh tokens remain usable until sessions are revoked.
2. Force a password reset for the affected account if credential compromise is suspected. A
   successful reset revokes all sessions.
3. Preserve audit logs and relevant request IDs; do not edit audit rows.
4. If refresh-token reuse is suspected, note that the old token is invalid after rotation but the
   API does not yet implement refresh-token-family reuse detection. Revoke the session and
   investigate.
5. Document the incident, scope, and remediation.

Rate limits are in-memory per API process. Before running multiple instances, move the limiter to
a shared store (for example Redis); otherwise a client can exceed the intended global limit across
instances.

## Email delivery

Transactional email is **not implemented**. Password-reset and email-verification tokens are
generated and stored hashed, and the raw values are exposed only in development/test as
`devResetToken`/`devEmailVerificationToken`. Production returns neither field and does not claim an
email was sent. Do not launch production password recovery until a provider is configured and
tested. Hotel suspend/reject also carry a partner-notification intent that is recorded in audit
metadata only; no message is queued or sent (Phase 7).

## Hotel review operations

The admin review queue is `GET /api/v1/admin/hotels` (filters: `status`, `city`, `state`,
`partnerId`, `search`, `sortBy`, `sortOrder`, `page`, `limit`).

Inspect one hotel's full history:

```sql
SELECT to_status, from_status, actor_id, actor_type, reason, notes, created_at
FROM hotel_status_history
WHERE hotel_id = '<hotel-uuid>'
ORDER BY created_at;
```

Inspect reviewer notes and the audit trail for a decision:

```sql
SELECT status, internal_notes, rejection_reason, approved_by, approved_at, suspended_at
FROM hotels WHERE id = '<hotel-uuid>';

SELECT created_at, action, actor_email, severity, metadata
FROM audit_logs
WHERE entity_type = 'hotel' AND entity_id = '<hotel-uuid>'
ORDER BY created_at;
```

Operational rules:

- Transitions are only possible through the explicit endpoints (`/review`, `/approve`, `/reject`,
  `/suspend`, `/reinstate`). If a request returns `409 HOTEL_INVALID_TRANSITION`, the hotel is not
  in the expected status — reload it rather than forcing the value in SQL.
- `409 HOTEL_STATUS_CONFLICT` means another request changed the status first; it is safe to retry
  only after re-reading the row.
- Never write `hotels.status` directly. Bypassing the endpoint skips `HotelStatusHistory` and the
  audit record.
- To unblock a hotel stuck in `under_review`, reject it with a reason so the partner can edit and
  resubmit; do not move it to `approved` without verification.
- Suspending an approved hotel immediately stops it being bookable; reinstate restores the previous
  approval without changing the original `approved_at`/`approved_by`.

## Payment/webhook incidents

1. Do **not** manually flip payment or booking status.
2. Look up the payment by provider reference and inspect stored provider events.
3. Verify the provider's dashboard/server status independently.
4. Replay is safe only through the idempotent webhook pipeline; never fabricate events.
5. If a payment succeeded after the hold expired, follow the defined recovery path (manual
   review/refund), not blind confirmation.
6. Record actions in the audit log and notify support/finance.

## Inventory anomalies

- If oversell is suspected, stop new bookings for the affected category (set stop-sell) while
  investigating.
- Compare `InventoryDay`, active `InventoryHold` rows, and confirmed bookings for overlapping
  dates inside a transaction.
- Never adjust history; post corrections and document the cause.

## Ledger and payouts

- Posted entries are immutable. Correct errors with linked reversal/adjustment transactions.
- Payout records require actor, timestamp, amount, currency, destination reference, and evidence.
- Reconcile payout batches against bank/provider statements before marking a batch complete.

## Deployment and rollback

1. Build artefacts and run all quality gates.
2. Apply migrations (`migrate deploy`).
3. Deploy the API; confirm `/health/ready`.
4. Roll back application code if needed; migrations are forward-only — write a new corrective
   migration rather than editing history.
5. Keep the previous image available for rollback.
6. Regenerate `docs/openapi.json` with `pnpm docs:api` after route/schema changes.

## Environment separation

- `development`: local database, fictional seed, verbose logs, development-only token fields.
- `test`: ephemeral `*_test` database, no external side effects.
- `staging`: production-like, test-mode payment provider only.
- `production`: live secrets, restricted access, audited admin actions, no development token
  fields.

No environment may share production credentials with development or CI.
