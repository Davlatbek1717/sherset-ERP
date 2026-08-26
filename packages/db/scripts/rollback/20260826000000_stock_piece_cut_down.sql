-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — K4 migratsiyasining TESKARISI.
--
-- Migratsiya faqat QO'SHADI: `stock_pieces` ga uchta ustun (`reserved_sale_id`,
-- `reserved_position_id`, `consumed_reason`), `retail_sale_positions` ga bitta
-- (`piece_lengths`) va `restock_task_lines` ga bitta (`position_id`) + ularning
-- FK/CHECK/indekslari. Birorta MAVJUD ustun o'zgarmagan, birorta qator
-- ko'chirilmagan ⇒ qaytarish qoldiqqa (`stocks`/`stock_by_cell`), chekka,
-- kassaga va yacheykalarga TEGMAYDI.
--
-- 🔴 MA'LUMOT YO'QOLADI (uchtasi ham K-reja doirasida, qoldiq EMAS):
--   (a) `stock_pieces.reserved_*` — qaysi kesilgan bo'lak qaysi chek qatoriga
--       ajratilgani. Yo'qolsa bo'laklarning O'ZI joyida qoladi (ular
--       `active` va sverkada sanaladi), faqat «mijoz oldida turibdi»
--       bog'lanishi uziladi ⇒ o'sha ondagi ochiq cheklar uchun omborchi
--       kesimni qaytadan biriktirishi kerak bo'ladi.
--   (b) `stock_pieces.consumed_reason` — bo'lak nega reyestrdan chiqqani.
--       Sverkadagi farqni tushuntiradigan yagona joy shu (chiqindi/kesim
--       yo'qotishi qoldiqqa TEGMAYDI — egasining 2026-08-25 qarori).
--   (c) `retail_sale_positions.piece_lengths` — kassirning mijoz bilan
--       kelishgan tarkibi («150+30»).
--
--   Qaytarishdan OLDIN EKSPORT qiling (uchalasi ham qo'l mehnati bilan
--   tiklanadi, avtomatik EMAS):
--     \copy (SELECT id, label, length, status, consumed_reason, reserved_sale_id, reserved_position_id FROM "stock_pieces") TO 'k4-pieces-backup.csv' CSV HEADER
--     \copy (SELECT id, retail_sale_id, product_id, quantity, piece_lengths FROM "retail_sale_positions" WHERE piece_lengths IS NOT NULL) TO 'k4-piece-lengths-backup.csv' CSV HEADER
--
-- TEKSHIRUV (qaytarishdan oldin — nima yo'qolishini raqam bilan ko'ring):
--   SELECT count(*) FILTER (WHERE reserved_position_id IS NOT NULL) AS band_bolaklar,
--          count(*) FILTER (WHERE consumed_reason IS NOT NULL)      AS sababli_qatorlar
--     FROM "stock_pieces";
--   SELECT count(*) AS kelishuvli_qatorlar
--     FROM "retail_sale_positions" WHERE "piece_lengths" IS NOT NULL;
--   Uchala son ham 0 bo'lsa qaytarish MUTLAQO izsiz (K4 deploy'idan keyin,
--   birinchi kesimgacha bo'lgan holat aynan shunday).
--
-- ⚠️ TARTIB: K4 ni K1 dan OLDIN qaytarib bo'lmaydi — bu skript K1 ning
-- jadvalini (`stock_pieces`) shundoq qoldiradi. To'liq qaytarish kerak bo'lsa:
-- avval SHU fayl, keyin `20260825230000_stock_piece_registry_down.sql`.
--
-- ⚠️ Fayl ATAYLAB migratsiya papkasidan TASHQARIDA: prisma u yerda faqat
-- `migration.sql` ni kutadi (K1/G5/G6 rollback skriptlari bilan bir naqsh).
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260826000000_stock_piece_cut_down.sql
--   npx prisma migrate resolve --rolled-back 20260826000000_stock_piece_cut
--   npx prisma generate
--
-- Har qadam idempotent: ikkinchi yugurish to'liq no-op.

-- CHECK va FK lar ustun bilan birga ketadi (`DROP COLUMN` ularni o'zi olib
-- tashlaydi), lekin ustunsiz qolgan qoldiq cheklovni ham ochiq tushiramiz —
-- yarim qaytgan holatda (masalan qo'lda ustun o'chirilgan) skript yiqilmasin.
ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_consumed_reason_known";
ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_reason_only_when_consumed";
ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_reserved_sale_id_fkey";
ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_reserved_position_id_fkey";
ALTER TABLE "restock_task_lines" DROP CONSTRAINT IF EXISTS "restock_task_lines_position_id_fkey";

DROP INDEX IF EXISTS "stock_pieces_account_reserved_position_idx";
DROP INDEX IF EXISTS "stock_pieces_account_reserved_sale_idx";
DROP INDEX IF EXISTS "restock_task_lines_position_id_idx";

ALTER TABLE "stock_pieces" DROP COLUMN IF EXISTS "reserved_sale_id";
ALTER TABLE "stock_pieces" DROP COLUMN IF EXISTS "reserved_position_id";
ALTER TABLE "stock_pieces" DROP COLUMN IF EXISTS "consumed_reason";

ALTER TABLE "retail_sale_positions" DROP COLUMN IF EXISTS "piece_lengths";

ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "position_id";
