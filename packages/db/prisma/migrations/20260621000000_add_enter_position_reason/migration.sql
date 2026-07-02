-- «Причина оприходования» — moysklad models the entry reason as free text PER
-- POSITION, not as a document-level enum. This adds the per-position column.
-- The old document-level Enter.reason enum column is DEPRECATED (kept for
-- back-compat, NOT dropped — no destructive change). Additive + nullable, so
-- existing enter_positions rows get NULL and no backfill is required.
ALTER TABLE "enter_positions" ADD COLUMN "reason" VARCHAR(255);
