-- Kassa TZ §5.3 — freeze the cost / base price onto each POS receipt line.
--
-- Both columns are NULLABLE on purpose: NULL means "never collected" and is
-- distinct from a real 0. Rows written before this migration stay NULL, so the
-- profitability report can mark them «tan narx yig'ilmagan» instead of showing
-- a fake 100% margin. No backfill is possible or attempted — the historical
-- buyPrice at the time of each old sale is simply not recorded anywhere.
--
-- Reversible: DROP COLUMN "cost_minor", DROP COLUMN "base_price_minor".
ALTER TABLE "retail_sale_positions" ADD COLUMN "cost_minor" BIGINT;
ALTER TABLE "retail_sale_positions" ADD COLUMN "base_price_minor" BIGINT;
