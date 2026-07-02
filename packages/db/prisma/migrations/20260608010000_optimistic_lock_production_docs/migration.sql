-- Optimistic concurrency version column (moysklad parity) for the production
-- cohort (Tier-2). Additive: existing rows default to version 1. The lock is
-- applied ONLY to the draft field-edit update() path of each service (FSM
-- transitions / post / stock-reservation cascades stay unlocked). production /
-- processing-order / work-order are header-only (single versioned update);
-- processing rewrites materials+products and bom/process/stage rewrite their
-- child rows nested-in / inside the same update transaction, so a stale-version
-- 409 rolls those child writes back. bom / process / stage are config/template
-- entities (no posted state) — versioned all the same. See
-- _PHASE2-optimistic-lock.audit.md for the design.

ALTER TABLE "productions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "processings" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "processing_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bills_of_materials" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "work_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "processing_processes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "processing_stages" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
