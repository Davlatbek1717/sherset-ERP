-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — K5 migratsiyasining TESKARISI.
--
-- Migratsiya faqat QO'SHADI: uchta hujjat jadvaliga bitta ixtiyoriy matn ustuni
-- (`piece_entry`) va `stock_pieces_consumed_reason_known` CHECK ga bitta yangi
-- qiymat (`recount`). Birorta MAVJUD ustun o'zgarmagan, birorta qator
-- ko'chirilmagan ⇒ qaytarish qoldiqqa (`stocks`/`stock_by_cell`), chekka,
-- kassaga va yacheykalarga TEGMAYDI.
--
-- 🔴 MA'LUMOT YO'QOLADI (hammasi K-reja doirasida, qoldiq EMAS):
--   (a) `inventory_positions.piece_entry` — omborchi SANAGAN bo'lak tarkibi.
--       Yo'qolsa sanoq QATORINING O'ZI (miqdor, variance, qoldiq) joyida
--       qoladi — faqat «qaysi rulon/bo'lak sanaldi» tafsiloti ketadi.
--       Reyestrning O'ZI (`stock_pieces`) ham joyida qoladi: post allaqachon
--       yozib bo'lgan.
--   (b) `supply_positions.piece_entry` — kelgan rulonlar tarkibi.
--   (c) `sales_return_positions.piece_entry` — qaytgan bo'lak yorlig'i.
--
-- 🔴 CHECK QAYTARILGANDA: `recount` sababli qatorlar bazada QOLADI, lekin
-- eski (K4) cheklov ularni RAD ETADI ⇒ `ALTER TABLE ... ADD CONSTRAINT`
-- YIQILADI. Shuning uchun pastdagi ikkinchi blok avval o'sha qatorlarni
-- `closed` ga o'giradi (ma'no jihatidan eng yaqini: «bo'lak reyestrdan
-- chiqarildi»). Bu YO'QOTISH — sverkadagi farqning manbai «sanashda
-- topilmadi» dan «qo'lda yopildi» ga aylanadi.
--
--   Qaytarishdan OLDIN EKSPORT qiling (hammasi qo'l mehnati bilan tiklanadi):
--     \copy (SELECT id, inventory_id, assortment_id, cell_id, actual_qty, piece_entry FROM "inventory_positions" WHERE piece_entry IS NOT NULL) TO 'k5-inventory-entry.csv' CSV HEADER
--     \copy (SELECT id, supply_id, assortment_id, quantity, piece_entry FROM "supply_positions" WHERE piece_entry IS NOT NULL) TO 'k5-supply-entry.csv' CSV HEADER
--     \copy (SELECT id, sales_return_id, assortment_id, quantity, piece_entry FROM "sales_return_positions" WHERE piece_entry IS NOT NULL) TO 'k5-return-entry.csv' CSV HEADER
--     \copy (SELECT id, label, length, status, consumed_reason FROM "stock_pieces" WHERE consumed_reason = 'recount') TO 'k5-recount-pieces.csv' CSV HEADER
--
-- TEKSHIRUV (qaytarishdan oldin — nima yo'qolishini raqam bilan ko'ring):
--   SELECT (SELECT count(*) FROM "inventory_positions"   WHERE piece_entry IS NOT NULL) AS sanoq_tarkibi,
--          (SELECT count(*) FROM "supply_positions"      WHERE piece_entry IS NOT NULL) AS priyomka_tarkibi,
--          (SELECT count(*) FROM "sales_return_positions" WHERE piece_entry IS NOT NULL) AS vozvrat_tarkibi,
--          (SELECT count(*) FROM "stock_pieces"          WHERE consumed_reason = 'recount') AS recount_qatorlar;
--   Hammasi 0 bo'lsa qaytarish MUTLAQO izsiz.
--
-- BUYRUQ:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260826120000_stock_piece_intake_down.sql
--   npx prisma migrate resolve --rolled-back 20260826120000_stock_piece_intake
--   npx prisma generate
--
-- Har qadam idempotent: ikkinchi yugurish to'liq no-op.

ALTER TABLE "inventory_positions" DROP COLUMN IF EXISTS "piece_entry";
ALTER TABLE "supply_positions" DROP COLUMN IF EXISTS "piece_entry";
ALTER TABLE "sales_return_positions" DROP COLUMN IF EXISTS "piece_entry";

-- `recount` qatorlarini eski lug'atga sig'diramiz (yuqoridagi ogohlantirish).
UPDATE "stock_pieces" SET "consumed_reason" = 'closed' WHERE "consumed_reason" = 'recount';

ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_consumed_reason_known";
ALTER TABLE "stock_pieces"
  ADD CONSTRAINT "stock_pieces_consumed_reason_known"
  CHECK ("consumed_reason" IS NULL
         OR "consumed_reason" IN ('sold', 'scrap', 'cut-loss', 'closed'));
