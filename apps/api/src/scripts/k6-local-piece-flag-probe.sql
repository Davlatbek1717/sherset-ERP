-- K6 — «qaror qilindimi?» ustunlarining LOKAL ZONDI (qoida 7).
--
-- O'ZI ROLLBACK QILADI: hech nima qolmaydi. Zond nimani isbotlaydi:
--   1. ikkala ustun BOR, IXTIYORIY va sukut NULL (deploy kuni HAMMA tovar
--      «qaror qilinmagan» bo'ladi — bu KUTILGAN holat);
--   2. FK SET NULL — qaror qilgan xodim o'chsa QAROR kuchda qoladi;
--   3. «hal qilinmagan» ro'yxatining so'rovi (`decided_at IS NULL`) qaror
--      muhrlangan zahoti tovarni CHIQARADI;
--   4. 🔴 QOLDIQQA (`stocks` / `stock_by_cell`) va REYESTRGA (`stock_pieces`)
--      bir gramm ham tegilmaydi.
--
-- Yuritish:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file ../../apps/api/src/scripts/k6-local-piece-flag-probe.sql

BEGIN;

-- 0. Boshlang'ich o'lchov (qoldiq + reyestr) --------------------------------
CREATE TEMP TABLE k6_before AS
SELECT (SELECT count(*) FROM "stocks")                     AS stocks_qatorlar,
       (SELECT coalesce(sum(qty), 0) FROM "stocks")        AS stocks_jami,
       (SELECT count(*) FROM "stock_by_cell")              AS sbc_qatorlar,
       (SELECT coalesce(sum(qty), 0) FROM "stock_by_cell") AS sbc_jami,
       (SELECT count(*) FROM "stock_pieces")               AS bolaklar;

-- 1. USTUNLAR ---------------------------------------------------------------
SELECT 'USTUNLAR' AS bosqich, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'products'
   AND column_name IN ('piece_tracked', 'piece_tracked_decided_at', 'piece_tracked_decided_by_id')
 ORDER BY column_name;

-- 2. FK SIYOSATI (n = SET NULL) ---------------------------------------------
SELECT 'FK' AS bosqich, conname, confdeltype
  FROM pg_constraint
 WHERE conrelid = '"products"'::regclass
   AND conname = 'products_piece_tracked_decided_by_id_fkey';

-- 3. Deploy kuni holati: HAMMA tovar «qaror qilinmagan» ---------------------
SELECT 'BOSHLANGICH' AS bosqich,
       count(*)                                                    AS tovarlar,
       count(*) FILTER (WHERE piece_tracked)                       AS bayrogi_yoqilgan,
       count(*) FILTER (WHERE piece_tracked_decided_at IS NOT NULL) AS qaror_qilingan
  FROM "products" WHERE deleted_at IS NULL;

-- 4. Qaror MUHRI: tovar ro'yxatdan chiqadi -----------------------------------
--    Sinov uchun bitta tovar tanlanadi (zond oxirida ROLLBACK bo'ladi).
CREATE TEMP TABLE k6_target AS
SELECT id, account_id FROM "products" WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

-- «Hal qilinmagan» ro'yxatining so'rovi — muhrdan OLDIN tovar RO'YXATDA.
SELECT 'ROYXATDA_MUHRDAN_OLDIN' AS bosqich, count(*) AS topildi
  FROM "products" p JOIN k6_target t ON t.id = p.id
 WHERE p.deleted_at IS NULL AND p.piece_tracked_decided_at IS NULL;

UPDATE "products" p
   SET piece_tracked = true,
       piece_tracked_decided_at = now(),
       piece_tracked_decided_by_id = (SELECT id FROM "employees" WHERE account_id = p.account_id LIMIT 1)
  FROM k6_target t WHERE p.id = t.id;

-- Muhrdan KEYIN o'sha so'rov tovarni TOPMAYDI (K6/3 ning yuragi).
SELECT 'ROYXATDA_MUHRDAN_KEYIN' AS bosqich, count(*) AS topildi
  FROM "products" p JOIN k6_target t ON t.id = p.id
 WHERE p.deleted_at IS NULL AND p.piece_tracked_decided_at IS NULL;

SELECT 'MUHR' AS bosqich,
       p.piece_tracked,
       p.piece_tracked_decided_at IS NOT NULL AS sana_bor,
       p.piece_tracked_decided_by_id IS NOT NULL AS xodim_bor
  FROM "products" p JOIN k6_target t ON t.id = p.id;

-- 5. 🔴 QOLDIQ VA REYESTR O'ZGARMAGANI ---------------------------------------
SELECT 'QOLDIQ' AS bosqich,
       (SELECT count(*) FROM "stocks") = b.stocks_qatorlar                     AS stocks_qatorlar_ozgarmadi,
       (SELECT coalesce(sum(qty), 0) FROM "stocks") = b.stocks_jami            AS stocks_jami_ozgarmadi,
       (SELECT count(*) FROM "stock_by_cell") = b.sbc_qatorlar                 AS sbc_qatorlar_ozgarmadi,
       (SELECT coalesce(sum(qty), 0) FROM "stock_by_cell") = b.sbc_jami        AS sbc_jami_ozgarmadi,
       (SELECT count(*) FROM "stock_pieces") = b.bolaklar                      AS bolaklar_ozgarmadi
  FROM k6_before b;

ROLLBACK;

-- 6. ROLLBACK dan keyin hech qanday qaror qolmaganini tekshirish -------------
SELECT 'ZONDDAN_KEYIN' AS bosqich,
       count(*) FILTER (WHERE piece_tracked_decided_at IS NOT NULL) AS qaror_qilingan
  FROM "products" WHERE deleted_at IS NULL;
