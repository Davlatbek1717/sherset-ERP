-- Dashboard index pack — audit 2026-08-08, REJA faza 26 (PERF-05, PERF-11).
-- Indexes ONLY: no column, constraint or application-logic change.
--
-- PERF-05 — "Недавние документы" UNIONs 12 document tables and takes the 20
-- most recently touched. Not one of the 486 indexes in the schema covered
-- `updated_at`, so every leg read the account's whole table.
--
-- MEASURED (EXPLAIN ANALYZE, Postgres 18, 24k rows in one leg) — the index
-- alone is NOT the fix, and neither is the query rewrite alone:
--   no index / no per-leg LIMIT (as shipped) → Append + top-N Sort   18 ms
--   index    / no per-leg LIMIT              → Append + top-N Sort   66 ms  ← index never used
--   no index / per-leg LIMIT                 → Merge Append + Sorts  33 ms
--   index    / per-leg LIMIT (shipped now)   → Merge Append + Index  0.55 ms
-- The planner does not push an outer LIMIT into UNION ALL branches, so
-- `dashboard.service.ts` now asks each leg for its own top-20 — that is what
-- turns these indexes into an ordered index scan. Keep the two together.
--
-- PERF-11 — the two overdue panels filter `<planned moment>` (a column no
-- index led with) and now read their items through raw SQL; the last two
-- indexes below are that predicate's leading column.
--
-- CREATE INDEX takes a SHARE lock (blocks writes on the table) for its
-- duration; these tables are <100k rows today, so it is seconds — deploy at
-- low load. CONCURRENTLY is not usable: Prisma runs migrations in a transaction.
--
-- IF NOT EXISTS everywhere: the deploy DBs are not `_prisma_migrations`-tracked
-- (see the project notes), so this file is also applied by hand via
-- `prisma db execute` — re-running it must stay a no-op.

-- ---------------------------------------------------------------------------
-- PERF-05 — (account_id, updated_at DESC) on the 12 tables the recent-docs
-- UNION reads. DESC matches the query's sort direction; a Postgres btree can
-- be walked backwards, but making it explicit keeps Merge Append from needing
-- a reverse-scan path on a multi-column key.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_account_id_updated_at_idx" ON "customer_orders"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "demands_account_id_updated_at_idx" ON "demands"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_out_account_id_updated_at_idx" ON "invoices_out"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_in_account_id_updated_at_idx" ON "invoices_in"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplies_account_id_updated_at_idx" ON "supplies"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_returns_account_id_updated_at_idx" ON "sales_returns"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_account_id_updated_at_idx" ON "purchase_orders"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_returns_account_id_updated_at_idx" ON "purchase_returns"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cash_in_account_id_updated_at_idx" ON "cash_in"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cash_out_account_id_updated_at_idx" ON "cash_out"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_in_account_id_updated_at_idx" ON "payments_in"("account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_out_account_id_updated_at_idx" ON "payments_out"("account_id", "updated_at" DESC);

-- ---------------------------------------------------------------------------
-- PERF-11 — overdue panels. Both queries are
-- `WHERE account_id = $1 AND <planned moment> < now()` ordered by that same
-- column, so the index serves filter AND sort. NULL planned dates are simply
-- never matched by `< now()`, so a partial index buys nothing worth the
-- extra drift surface.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_out_account_id_payment_planned_moment_idx" ON "invoices_out"("account_id", "payment_planned_moment");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_account_id_delivery_planned_moment_idx" ON "customer_orders"("account_id", "delivery_planned_moment");
