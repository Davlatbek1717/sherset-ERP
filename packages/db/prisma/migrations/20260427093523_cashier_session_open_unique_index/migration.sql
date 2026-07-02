-- Partial unique index: at most one OPEN session per (account, cashier).
--
-- Prisma's schema language can't express partial uniques (Postgres-only feature),
-- so we declare the index in raw SQL. The application layer's pre-create read
-- in CashierSessionService.open() is best-effort; this index makes the invariant
-- bulletproof under concurrent opens — the second tx hits a P2002 unique
-- violation and the service maps it to ConflictException.
--
-- The condition `state = 'open'` is essential: a cashier can have many CLOSED
-- sessions historically, but only one OPEN at any time.

CREATE UNIQUE INDEX "cashier_sessions_open_per_cashier_idx"
  ON "cashier_sessions" ("account_id", "cashier_id")
  WHERE "state" = 'open';
