-- A1 — «MAVJUD QATORLAR nima bo'ladi» ZONDI (HAQIQIY jadval ustida).
--
-- Dev bazada `retail_drawer_cash_in` BO'SH, shuning uchun migratsiyaning
-- backfill xulqi o'z-o'zidan ko'rinmaydi. Bu zond uni MAJBURAN ko'rsatadi:
--
--   1. ustunni olib tashlaydi (migratsiyagacha bo'lgan holatga qaytaradi);
--   2. `kind` SIZ bitta qator yozadi — ya'ni «migratsiyadan OLDIN mavjud
--      bo'lgan» qator;
--   3. migratsiyani QAYTA yugurtiradi;
--   4. o'sha qator qanday qiymat olganini O'QIYDI.
--
-- 🔴 Butun zond BITTA tranzaksiyada va oxirida O'ZI ROLLBACK qiladi —
-- bazada hech qanday iz qolmaydi (Postgres'da DDL tranzaksion). Ya'ni
-- qoida 12 ma'nosidagi «teskari yo'l» skriptning O'ZIDA (Q2 zondi naqshi).
--
-- 1-bosqichdagi uch bayonot AYNAN migratsiyaning TESKARISI — hisobotdagi
-- «Teskari yo'l» retsepti shu yerda ham sinaladi.
--
-- LOKAL dev bazada yugurtirish:
--   psql -h localhost -U <rol> -d sherset_v2_dev -v ON_ERROR_STOP=1 \
--        -f apps/api/src/scripts/a1-local-drawer-kind-probe.sql
--
-- ⚠️ FAQAT DEV BAZADA. Jonli bazada yugurtirilmaydi va kerak ham emas:
-- u yerda jadval bo'sh emas, ya'ni `a1-local-drawer-kind-verify.sql` ning
-- 3-so'rovi backfill dalilini o'z-o'zidan beradi.
BEGIN;

\echo '--- 0. Boshlangich holat (migratsiya QOLLANGAN) ---'
SELECT count(*) AS ustun_bor FROM information_schema.columns
 WHERE table_name='retail_drawer_cash_in' AND column_name='kind';

\echo '--- 1. Ustunni olib tashlaymiz (migratsiyagacha holat) ---'
DROP INDEX IF EXISTS "retail_drawer_cash_in_account_id_agent_id_kind_idx";
DROP INDEX IF EXISTS "retail_drawer_cash_in_account_id_retail_shift_id_kind_idx";
ALTER TABLE "retail_drawer_cash_in" DROP COLUMN IF EXISTS "kind";

SELECT count(*) AS ustun_bor_endi FROM information_schema.columns
 WHERE table_name='retail_drawer_cash_in' AND column_name='kind';

\echo '--- 2. `kind` SIZ qator yozamiz (= migratsiyadan OLDINGI hujjat) ---'
INSERT INTO retail_drawer_cash_in
  (id, account_id, name, retail_shift_id, organization_id,
   moment, applicable, state, posted_at, sum_minor, currency, updated_at)
SELECT
  gen_random_uuid(),
  s.account_id,
  'ZOND-ESKI-QATOR',
  s.id,
  (SELECT id FROM organizations LIMIT 1),
  now(), true, 'posted', now(), 777000, 'UZS', now()
FROM cashier_sessions s
LIMIT 1;

SELECT name, sum_minor FROM retail_drawer_cash_in WHERE name='ZOND-ESKI-QATOR';

\echo '--- 3. Migratsiyani QAYTA yugurtiramiz ---'
ALTER TABLE "retail_drawer_cash_in"
  ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'other';
CREATE INDEX IF NOT EXISTS "retail_drawer_cash_in_account_id_retail_shift_id_kind_idx"
  ON "retail_drawer_cash_in"("account_id", "retail_shift_id", "kind");
CREATE INDEX IF NOT EXISTS "retail_drawer_cash_in_account_id_agent_id_kind_idx"
  ON "retail_drawer_cash_in"("account_id", "agent_id", "kind");

\echo '--- 4. ESKI QATOR qanday qiymat oldi (other bo`lishi SHART) + summa TEGILMAGANmi ---'
SELECT name, kind, sum_minor
  FROM retail_drawer_cash_in WHERE name='ZOND-ESKI-QATOR';

\echo '--- 5. DEFAULT yangi qatorga ham qollanadimi (kind SIZ INSERT) ---'
INSERT INTO retail_drawer_cash_in
  (id, account_id, name, retail_shift_id, organization_id,
   moment, applicable, state, posted_at, sum_minor, currency, updated_at)
SELECT gen_random_uuid(), s.account_id, 'ZOND-YANGI-QATOR', s.id,
       (SELECT id FROM organizations LIMIT 1),
       now(), true, 'posted', now(), 555000, 'UZS', now()
FROM cashier_sessions s LIMIT 1;

SELECT name, kind FROM retail_drawer_cash_in
 WHERE name IN ('ZOND-ESKI-QATOR','ZOND-YANGI-QATOR') ORDER BY name;

\echo '--- 6. ROLLBACK ---'
ROLLBACK;

\echo '--- 7. ROLLBACKdan KEYIN: zond qatorlari 0, ustun JOYIDA ---'
SELECT (SELECT count(*) FROM retail_drawer_cash_in WHERE name LIKE 'ZOND-%') AS qolgan_zond_qatorlari,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name='retail_drawer_cash_in' AND column_name='kind') AS ustun_joyida,
       (SELECT count(*) FROM pg_indexes
         WHERE tablename='retail_drawer_cash_in' AND indexname LIKE '%kind%') AS indekslar_joyida;
