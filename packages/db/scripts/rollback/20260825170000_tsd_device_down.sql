-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — G5 migratsiyasining TESKARISI.
--
-- Bu migratsiya faqat YANGI jadval va YANGI ustun qo'shadi, ya'ni mavjud
-- ma'lumotni O'ZGARTIRMAYDI — qaytarish xavfsiz va yo'qotishsiz. Yagona
-- yo'qoladigan narsa — juftlangan TSD terminallari va ularning sessiyalari
-- (terminallar qayta juftlanadi; kassa/omborga aloqasi yo'q).
--
-- TARTIB MUHIM: avval FK va ustun, keyin jadval — aks holda RESTRICT
-- bog'lanish jadvalni o'chirishga yo'l bermaydi.
--
-- ⚠️ Fayl ATAYLAB migratsiya papkasidan TASHQARIDA: prisma migratsiya
-- papkasida faqat `migration.sql` ni kutadi va u yerdagi begona fayl
-- kelajakdagi tooling uchun tuzoq bo'lardi.
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260825170000_tsd_device_down.sql
--   npx prisma migrate resolve --rolled-back 20260825170000_tsd_device   # kuzatilayotgan bo'lsa
--   npx prisma generate
--
-- Har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_tsd_device_id_fkey";
DROP INDEX IF EXISTS "refresh_tokens_tsd_device_id_idx";
ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "tsd_device_id";
DROP TABLE IF EXISTS "tsd_devices";
