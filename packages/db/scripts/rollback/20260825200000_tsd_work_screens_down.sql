-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — G6 migratsiyasining TESKARISI.
--
-- Bu migratsiya faqat YANGI ustunlar va YANGI jadval qo'shadi, mavjud
-- ma'lumotni O'ZGARTIRMAYDI ⇒ qaytarish qoldiqqa ham, chekka ham tegmaydi.
-- Yo'qoladigan narsa: (a) omborchilar qo'ygan yetishmovchilik BELGILARI
-- (topshiriq qatorining `quantity` si o'zgarmagan — qaytargandan keyin ham
-- kontrol chekni ko'z bilan tekshiradi); (b) TSD oflayn amallarining
-- idempotentlik kalitlari.
--
-- ⚠️ (b) NING NARXI: kalit jadvali yo'q bo'lsa, o'sha paytda TSD navbatida
-- turgan amal qayta yuborilsa IKKI marta bajarilishi mumkin. Shuning uchun
-- qaytarish TSD terminallari ishlamayotgan paytda qilinadi (kechqurun) yoki
-- avval terminallar `revoked_at` bilan bekor qilinadi.
--
-- ⚠️ IKKINCHI SHART: qaytarishdan oldin OCHIQ topshiriqlarda yetishmovchilik
-- belgisi bor qatorlar bo'lmasin. Bor bo'lsa, ustun yo'qolgach o'sha qatorlar
-- yana «ochiq» bo'lib qoladi va topshiriq `done` dan `in_progress` ga
-- tushmaydi (holat ustuni alohida saqlanadi) — ya'ni chek kontrolda qolib,
-- omborchi esa qayta yig'ishga chaqirilmaydi. Tekshiruv:
--   SELECT count(*) FROM restock_task_lines WHERE shortage_qty IS NOT NULL;
--
-- TARTIB: avval indekslar va FK, keyin jadval; ustunlar oxirida (ular hech
-- nimaga bog'liq emas).
--
-- ⚠️ Fayl ATAYLAB migratsiya papkasidan TASHQARIDA: prisma u yerda faqat
-- `migration.sql` ni kutadi.
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260825200000_tsd_work_screens_down.sql
--   npx prisma migrate resolve --rolled-back 20260825200000_tsd_work_screens   # kuzatilayotgan bo'lsa
--   npx prisma generate
--
-- Har qadam idempotent: qayta yugurtirish no-op.

DROP INDEX IF EXISTS "client_operations_account_id_created_at_idx";
DROP INDEX IF EXISTS "client_operations_account_id_client_op_id_key";
ALTER TABLE IF EXISTS "client_operations" DROP CONSTRAINT IF EXISTS "client_operations_account_id_fkey";
DROP TABLE IF EXISTS "client_operations";

ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "shortage_by_name";
ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "shortage_by_id";
ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "shortage_at";
ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "shortage_note";
ALTER TABLE "restock_task_lines" DROP COLUMN IF EXISTS "shortage_qty";
