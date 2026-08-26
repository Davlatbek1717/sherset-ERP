-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — G3 migratsiyasining TESKARISI.
--
-- ⚠️ RETROSPEKTIV yozilgan (2026-08-25, deploy-tayyorlash tekshiruvi). Asl
-- migratsiya 12-qoida kiritilishidan (`902643a9`) OLDIN yozilgan.
-- Dossier: `docs/ops/2026-08-25-deploy-dossieri.md` (B4).
--
-- Migratsiya faqat YANGI ustun + FK (SET NULL) + indeks qo'shadi ⇒ qaytarish
-- tuzilma jihatidan xavfsiz, vozvrat hujjatlarining O'ZI tegilmaydi.
--
-- 🔴 MA'LUMOT YO'QOLADI: `sales_returns.retail_sale_id` — ВП ning manba kassa
--    chekiga bog'lami. Uning ikkita ishi bor edi:
--      (a) qabul ekrani chekdan qatorlarni tortadi;
--      (b) `computeReturnableLines` CAP ni hisoblaydi — «shu chekka bog'langan
--          avvalgi ВП lar» aynan shu ustun orqali topiladi.
--    Ustun tashlangach cap FAQAT POS mirror qaytarishlarini ko'radi, ya'ni
--    ESKI kod ham shu holatga qaytadi (u bu ustunni bilmaydi) — regressiya yo'q.
--    ⇒ Qaytarishdan OLDIN tekshiring va kerak bo'lsa eksport qiling:
--         SELECT count(*) FROM "sales_returns" WHERE "retail_sale_id" IS NOT NULL;
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260824170000_sales_return_retail_sale_down.sql
--   npx prisma migrate resolve --rolled-back 20260824170000_sales_return_retail_sale
--   npx prisma generate
--
-- Har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "sales_returns"
  DROP CONSTRAINT IF EXISTS "sales_returns_retail_sale_id_fkey";

DROP INDEX IF EXISTS "sales_returns_account_id_retail_sale_id_idx";

ALTER TABLE "sales_returns" DROP COLUMN IF EXISTS "retail_sale_id";
