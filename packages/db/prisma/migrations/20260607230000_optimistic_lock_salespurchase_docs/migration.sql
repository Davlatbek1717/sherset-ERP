-- Optimistic concurrency version column (moysklad parity) for the sales/purchase
-- position-document cohort (Tier-2 — FSM/positions docs). Additive: existing
-- rows default to version 1. The lock is applied ONLY to the draft field-edit
-- update() path of each service (the destructive position deleteMany + the
-- versioned header update are moved into ONE $transaction so a stale-version
-- 409 rolls the position deletion back), never to FSM transitions / mass-edit /
-- soft-delete / cascade appliers. See the money-doc rollout
-- (optimistic_lock_money_docs) for the Class A tx-wrap pattern and
-- _PHASE2-optimistic-lock.audit.md for the design.

ALTER TABLE "customer_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "demands" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoices_out" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoices_in" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "supplies" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sales_returns" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_returns" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
