-- Optimistic concurrency version column (moysklad parity) for RetailSale —
-- the FINAL Tier-2 entity with a field-edit update() path. Additive: existing
-- rows default to version 1. The lock is applied ONLY to the draft field-edit
-- update() (POS/e-commerce integration PATCH); the POS FSM (post/cancel/refund)
-- and cashier-session open/close stay unlocked. retail-sale is a Class A
-- child-array doc: the version-guarded header update + the position deleteMany
-- now run in ONE transaction, so a stale-version 409 rolls the position rewrite
-- back (also fixes a pre-existing corruption where the deleteMany ran outside a
-- tx). The other "remaining" Tier-2 entities (cashier-session, online-order,
-- commission-report, consignment, facture-in/out) have NO field-edit update()
-- path — FSM-only or read-only/derived — so there is nothing to version-guard;
-- this column completes the optimistic-lock rollout. See
-- _PHASE2-optimistic-lock.audit.md for the design.

ALTER TABLE "retail_sales" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
