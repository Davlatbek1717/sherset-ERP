-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — Q1 migratsiyasining TESKARISI.
--
-- ⚠️ RETROSPEKTIV yozilgan (2026-08-25, deploy-tayyorlash tekshiruvi). Asl
-- migratsiya (`ff2db056`) 12-qoidadan KEYIN yozilgan, ya'ni teskarisi o'sha
-- sessiyada yozilishi KERAK edi.
-- Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` (Q1).
-- Dossier: `docs/ops/2026-08-25-deploy-dossieri.md` (B4).
--
-- Migratsiya `debts` ga ikkita NULLABLE ustun va BITTA UNIKAL indeks qo'shadi.
-- Mavjud qatorlar o'zgarmaydi (ikkala ustun NULL bo'lib tug'iladi).
--
-- 🔴 MA'LUMOT YO'QOLADI: `source_doc_type` + `source_doc_id` — qarz qatorining
--    manba hujjati (kassa cheki / vozvrat / chek tahriri). Bularsiz reyestr
--    qatorini hujjatga qaytarib bog'lab bo'lmaydi, va `recompute` ning
--    adopsiya filtri manbani ko'rmay qoladi.
--    ESKI kod bu ustunlarni bilmaydi ⇒ ishlashda regressiya yo'q, faqat iz yo'qoladi.
--    ⇒ Qaytarishdan OLDIN eksport qiling:
--         \copy (SELECT "id","account_id","source_doc_type","source_doc_id"
--                  FROM "debts" WHERE "source_doc_id" IS NOT NULL)
--               TO 'debt-source-doc-backup.csv' CSV HEADER
--
-- TARTIB MUHIM: avval UNIKAL indeks, keyin ustunlar. (Postgres ustun bilan
-- birga indeksni o'zi ham tashlaydi, lekin ochiq yozish niyatni ko'rsatadi va
-- indeks nomi keyinchalik boshqa ustunga ko'chsa ham to'g'ri ishlaydi.)
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260825120000_debt_source_doc_down.sql
--   npx prisma migrate resolve --rolled-back 20260825120000_debt_source_doc
--   npx prisma generate
--
-- Har qadam idempotent: qayta yugurtirish no-op.

DROP INDEX IF EXISTS "debts_account_id_source_doc_type_source_doc_id_key";

ALTER TABLE "debts" DROP COLUMN IF EXISTS "source_doc_id";
ALTER TABLE "debts" DROP COLUMN IF EXISTS "source_doc_type";
