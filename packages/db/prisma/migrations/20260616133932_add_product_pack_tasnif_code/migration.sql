-- «Код упаковки ТАСНИФ» — Uzbekistan TASNIF package classification code on a
-- product pack (moysklad «Товары и услуги» offers it as a column + Фильтр field).
-- Additive + nullable; existing packs default to NULL.

-- AlterTable
ALTER TABLE "product_packs" ADD COLUMN "tasnif_code" VARCHAR(50);
