-- Optimistic concurrency version column (moysklad parity) for the money-document
-- cohort (Tier-2 — FSM/positions docs). Additive: existing rows default to
-- version 1. The lock is applied ONLY to the draft field-edit update() path of
-- each service, never to FSM transitions / mass-edit / soft-delete / balance
-- posting. See the Tier-1 rollout (optimistic_lock_tier1_entities) for the
-- pattern and _PHASE2-optimistic-lock.audit.md for the design.

ALTER TABLE "cash_in" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "cash_out" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payments_in" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payments_out" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "prepayments" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "prepayment_returns" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "counterparty_adjustments" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
