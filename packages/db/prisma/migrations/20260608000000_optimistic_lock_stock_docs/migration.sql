-- Optimistic concurrency version column (moysklad parity) for the stock
-- position-document cohort (Tier-2 — FSM/positions docs). Additive: existing
-- rows default to version 1. The lock is applied ONLY to the draft field-edit
-- update() path of each service (the destructive position deleteMany + the
-- versioned header update run in ONE $transaction so a stale-version 409 rolls
-- the position deletion back), never to FSM transitions (post/unpost/cancel,
-- which write the stock deltas) / mass-edit / soft-delete. These docs have NO
-- two-step totals (sumMinor is set only at post time, except internal-order
-- whose reporting totals fold into the single header update). See the
-- sales/purchase rollout (optimistic_lock_salespurchase_docs) for the Class A
-- tx-wrap pattern and _PHASE2-optimistic-lock.audit.md for the design.

ALTER TABLE "moves" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "enters" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "losses" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inventories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "internal_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
