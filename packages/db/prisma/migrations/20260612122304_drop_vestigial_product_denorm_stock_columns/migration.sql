-- Drop the vestigial per-product denormalised stock rollup columns.
--
-- `stock_minor` / `reserve_minor` / `in_transit_minor` were a designed-but-
-- unwired denormalisation on `products`: no application write, DB trigger, or
-- seed ever maintained them, so they sat at their migration DEFAULT 0 forever.
-- The one place that read `stock_minor` (the «Ниже минимума» re-order filter)
-- produced silently-wrong results against the permanent 0 and was rewritten in
-- 2026-06-11h to aggregate the live Stock ledger; the «Остаток»/«Резерв»/
-- «Доступно» list columns (2026-06-11i) do the same. Nothing references these
-- columns any more (verified repo-wide: no app code, seed, sync, or test read),
-- so they are removed to delete a proven silent-failure trap.
ALTER TABLE "products" DROP COLUMN "in_transit_minor",
DROP COLUMN "reserve_minor",
DROP COLUMN "stock_minor";
