-- moysklad «Дата документа» (processingorder.moment) for WorkOrder.
--
-- Parity gap (grounded 2026-06-11e from dev.moysklad.ru document-schemas:
-- processingorder.moment exists): our WorkOrder header had no editable
-- document date — the /new editor bound an editable date control whose value
-- was silently DROPPED in the create payload (only the immutable created_at
-- was ever stored). Sibling docs (InternalOrder, Production) already carry
-- `moment`; this closes the WorkOrder-only gap.
--
-- Additive NOT NULL column with a default so existing rows stay valid; the
-- backfill then sets each existing row's document date to its created_at
-- (its real creation moment) instead of the migration run time.
ALTER TABLE "work_orders" ADD COLUMN "moment" TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE "work_orders" SET "moment" = "created_at";
