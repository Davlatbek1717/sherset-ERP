-- K5 — bo'lak reyestriga OMMAVIY KIRITISH: lokal zond (o'zi ROLLBACK qiladi).
-- Reja: docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md, K5 fazasi.
--
-- Nima isbotlanadi (K1 `k1-local-stock-piece-probe.sql` va K4 zondi naqshi):
--   1. uchala hujjat jadvalida `piece_entry` ustuni BOR va matn qabul qiladi;
--   2. `consumed_reason = 'recount'` endi CHECK dan O'TADI (K4 dagi lug'at
--      kengaytirildi), notanish sabab esa HAMON to'siladi;
--   3. sanash sikli (yopish + yangi qator) reyestrni to'g'ri hizalaydi;
--   4. 🔴 butun sikl davomida `stocks` va `stock_by_cell` BIR GRAMMGA HAM
--      o'zgarmaydi — K5 ning eng muhim da'vosi (2026-08-24 hodisasi sinfi).
--
-- Yugurtirish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file ../../apps/api/src/scripts/k5-local-piece-intake-probe.sql

BEGIN;

-- ── Boshlang'ich o'lchov ────────────────────────────────────────────────────
CREATE TEMP TABLE k5_before AS
SELECT (SELECT count(*) FROM "stocks")                AS stocks_qatorlar,
       (SELECT coalesce(sum(qty), 0) FROM "stocks")   AS stocks_jami,
       (SELECT count(*) FROM "stock_by_cell")         AS sbc_qatorlar,
       (SELECT coalesce(sum(qty), 0) FROM "stock_by_cell") AS sbc_jami;

-- ── Doira: mavjud akkaunt · ombor · tovar ──────────────────────────────────
CREATE TEMP TABLE k5_scope AS
SELECT s.account_id, s.id AS store_id, p.id AS product_id
  FROM "stores" s
  JOIN "products" p ON p.account_id = s.account_id AND p.deleted_at IS NULL
 LIMIT 1;

\echo '=== 1. USTUNLAR ==='
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE column_name = 'piece_entry'
   AND table_name IN ('inventory_positions', 'supply_positions', 'sales_return_positions')
 ORDER BY table_name;

\echo '=== 2. `recount` SABABI CHECK dan O`TADI ==='
INSERT INTO "stock_pieces"
  (id, account_id, store_id, cell_id, assortment_kind, assortment_id,
   length, whole, label, status, consumed_reason, consumed_at, created_at, updated_at)
SELECT gen_random_uuid(), account_id, store_id, NULL, 'product', product_id,
       250, true, NULL, 'consumed', 'recount', now(), now(), now()
  FROM k5_scope;
SELECT count(*) AS recount_qatorlar FROM "stock_pieces" WHERE consumed_reason = 'recount';

\echo '=== 3. NOTANISH sabab HAMON to`siladi ==='
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO "stock_pieces"
      (id, account_id, store_id, cell_id, assortment_kind, assortment_id,
       length, whole, label, status, consumed_reason, consumed_at, created_at, updated_at)
    SELECT gen_random_uuid(), account_id, store_id, NULL, 'product', product_id,
           250, true, NULL, 'consumed', 'sanaldi', now(), now(), now()
      FROM k5_scope;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  RAISE NOTICE '%', CASE WHEN ok THEN 'OK — to`sildi: notanish `consumed_reason`'
                         ELSE 'XATO — notanish sabab O`TIB KETDI' END;
END $$;

\echo '=== 4. SANASH sikli: eski qator yopiladi, yangisi ochiladi ==='
-- Boshlang'ich holat: 3 butun rulon (250×3) + 1 bo'lak (200).
INSERT INTO "stock_pieces"
  (id, account_id, store_id, cell_id, assortment_kind, assortment_id,
   length, whole, label, status, created_at, updated_at)
SELECT gen_random_uuid(), account_id, store_id, NULL, 'product', product_id,
       250, true, NULL, 'active', now(), now()
  FROM k5_scope, generate_series(1, 3);
INSERT INTO "stock_pieces"
  (id, account_id, store_id, cell_id, assortment_kind, assortment_id,
   length, whole, label, status, created_at, updated_at)
SELECT gen_random_uuid(), account_id, store_id, NULL, 'product', product_id,
       200, false, 'BLK-999001', 'active', now(), now()
  FROM k5_scope;

SELECT sum(length) AS sanashdan_oldin, count(*) AS qatorlar
  FROM "stock_pieces" sp, k5_scope sc
 WHERE sp.account_id = sc.account_id AND sp.assortment_id = sc.product_id
   AND sp.status = 'active';

-- Sanoq natijasi: «250x2 + BLK-999001:180 + ?:70» = 750.
-- Bitta rulon topilmadi ⇒ `recount`; bo'lak uzunligi tuzatildi; yangi bo'lak.
UPDATE "stock_pieces" SET status = 'consumed', consumed_reason = 'recount', consumed_at = now()
 WHERE id = (SELECT sp.id FROM "stock_pieces" sp, k5_scope sc
              WHERE sp.account_id = sc.account_id AND sp.assortment_id = sc.product_id
                AND sp.status = 'active' AND sp.whole LIMIT 1);
UPDATE "stock_pieces" SET length = 180 WHERE label = 'BLK-999001';
INSERT INTO "stock_pieces"
  (id, account_id, store_id, cell_id, assortment_kind, assortment_id,
   length, whole, label, status, created_at, updated_at)
SELECT gen_random_uuid(), account_id, store_id, NULL, 'product', product_id,
       70, false, 'BLK-999002', 'active', now(), now()
  FROM k5_scope;

SELECT sum(length) AS sanashdan_keyin, count(*) AS qatorlar
  FROM "stock_pieces" sp, k5_scope sc
 WHERE sp.account_id = sc.account_id AND sp.assortment_id = sc.product_id
   AND sp.status = 'active';
-- Kutilgan: 250 + 250 + 180 + 70 = 750, 4 qator.

\echo '=== 5. 🔴 QOLDIQ O`ZGARMADI ==='
SELECT (SELECT count(*) FROM "stocks") = stocks_qatorlar               AS stocks_qatorlar_ozgarmadi,
       (SELECT coalesce(sum(qty), 0) FROM "stocks") = stocks_jami      AS stocks_jami_ozgarmadi,
       (SELECT count(*) FROM "stock_by_cell") = sbc_qatorlar           AS sbc_qatorlar_ozgarmadi,
       (SELECT coalesce(sum(qty), 0) FROM "stock_by_cell") = sbc_jami  AS sbc_jami_ozgarmadi
  FROM k5_before;

ROLLBACK;

\echo '=== 6. ROLLBACK dan keyin zond qatorlari = 0 ==='
SELECT count(*) AS qolgan_zond_qatorlar
  FROM "stock_pieces"
 WHERE label IN ('BLK-999001', 'BLK-999002') OR consumed_reason = 'recount';
