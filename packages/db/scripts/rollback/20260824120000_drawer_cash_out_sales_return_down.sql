-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — G1 migratsiyasining TESKARISI.
--
-- ⚠️ RETROSPEKTIV yozilgan (2026-08-25, deploy-tayyorlash tekshiruvi). Asl
-- migratsiya 12-qoida kiritilishidan (`902643a9`) OLDIN yozilgan, shuning uchun
-- o'z sessiyasida teskarisi yo'q edi. Dossier: `docs/ops/2026-08-25-deploy-dossieri.md` (B4).
--
-- Migratsiya faqat YANGI ustun + FK + indeks qo'shadi, mavjud qatorlarni
-- O'ZGARTIRMAYDI ⇒ qaytarish tuzilma jihatidan xavfsiz.
--
-- 🔴 LEKIN MA'LUMOT YO'QOLADI, va u PUL izi:
--    `retail_drawer_cash_out.sales_return_id` — qaysi chiqim qaysi vozvratga
--    to'langanining yagona bog'lami (`kind = 'return_payout'`, hujjat `ВВ-`).
--    Ustun tashlansa hujjatlar QOLADI (pul daftari va Z-hisobot buzilmaydi),
--    lekin «qaysi vozvrat uchun» degan bog'lam yo'qoladi.
--    ⇒ Deploy qaytarilayotgan bo'lsa AVVAL tekshiring:
--         SELECT count(*) FROM "retail_drawer_cash_out" WHERE "sales_return_id" IS NOT NULL;
--       Natija 0 dan katta bo'lsa — o'sha qatorlarni EXPORT qiling
--       (id, sales_return_id) va faqat keyin qaytaring.
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260824120000_drawer_cash_out_sales_return_down.sql
--   npx prisma migrate resolve --rolled-back 20260824120000_drawer_cash_out_sales_return
--   npx prisma generate
--
-- Har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "retail_drawer_cash_out"
  DROP CONSTRAINT IF EXISTS "retail_drawer_cash_out_sales_return_id_fkey";

DROP INDEX IF EXISTS "retail_drawer_cash_out_account_id_sales_return_id_idx";

ALTER TABLE "retail_drawer_cash_out" DROP COLUMN IF EXISTS "sales_return_id";
