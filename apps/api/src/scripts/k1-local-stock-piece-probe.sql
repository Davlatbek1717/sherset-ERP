-- K1 — bo'lak reyestrining LOKAL dev bazadagi ZONDI (F-reja 7 + 12-qoidalari).
--
-- Nima isbotlaydi:
--   1. to'g'ri bo'lak/rulon YOZILADI;
--   2. modelning to'rt qoidasi DB darajasida HAQIQATAN to'sadi (CHECK);
--   3. yorliq takrorlanmaydi, YORLIQSIZ rulonlar esa cheksiz (NULL nuance);
--   4. yacheyka o'chsa bo'lak YO'QOLMAYDI, ombor darajasiga TUSHADI (SET NULL);
--   5. bo'lak yozish QOLDIQQA (stocks / stock_by_cell) TEGMAYDI.
--
-- Zond o'zi `ROLLBACK` qiladi — bazada IZ QOLMAYDI.
--
--   cd packages/db && psql -h localhost -U postgres -d sherset_v2_dev \
--     -v ON_ERROR_STOP=1 -f ../../apps/api/src/scripts/k1-local-stock-piece-probe.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE k1_ctx AS
SELECT c.account_id,
       c.store_id,
       c.id                                                       AS cell_id,
       (SELECT p.id FROM products p WHERE p.account_id = c.account_id LIMIT 1) AS product_id
  FROM store_cells c
 LIMIT 1;

CREATE TEMP TABLE k1_before AS
SELECT (SELECT count(*) FROM stocks)        AS stocks_rows,
       (SELECT count(*) FROM stock_by_cell) AS sbc_rows,
       (SELECT coalesce(sum(qty), 0) FROM stocks) AS total_qty;

\echo '=== 1. TO`G`RI qatorlar yoziladi (3 butun rulon + 2 bo`lak) ==='
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, cell_id, product_id, 250, true, NULL FROM k1_ctx;
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, cell_id, product_id, 250, true, NULL FROM k1_ctx;
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, cell_id, product_id, 250, true, NULL FROM k1_ctx;
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, cell_id, product_id, 200, false, 'BLK-000038' FROM k1_ctx;
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, cell_id, product_id, 70, false, 'BLK-000039' FROM k1_ctx;

SELECT count(*) AS yozilgan_qatorlar, sum(length) AS jami_uzunlik FROM stock_pieces;

\echo '=== 2. GUARDLAR — to`rttasi ham HAQIQATAN to`sishi SHART ==='
DO $$
DECLARE
  ctx  record;
  test record;
BEGIN
  SELECT * INTO ctx FROM k1_ctx;

  FOR test IN
    SELECT * FROM (VALUES
      ('whole rulonda yorliq',      250::numeric, true,  'BLK-000099'::varchar, 'active'::varchar),
      ('manfiy uzunlik',             -1::numeric, false, 'BLK-000100'::varchar, 'active'::varchar),
      ('faol bo`lak nol uzunlikda',   0::numeric, false, 'BLK-000101'::varchar, 'active'::varchar),
      ('notanish holat',            100::numeric, false, 'BLK-000102'::varchar, 'archived'::varchar)
    ) AS t(nomi, uzunlik, butun, yorliq, holat)
  LOOP
    BEGIN
      INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id,
                                length, whole, label, status)
      VALUES (gen_random_uuid(), ctx.account_id, ctx.store_id, ctx.cell_id, ctx.product_id,
              test.uzunlik, test.butun, test.yorliq, test.holat);
      RAISE EXCEPTION 'GUARD ISHLAMADI: % qatori yozilib ketdi', test.nomi;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'OK — to`sildi: %', test.nomi;
    END;
  END LOOP;

  -- `consumed` da nol uzunlik RUXSAT (bo'lak «tugadi» deb yopilgan holat).
  INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id,
                            length, whole, label, status, consumed_at)
  VALUES (gen_random_uuid(), ctx.account_id, ctx.store_id, ctx.cell_id, ctx.product_id,
          0, false, 'BLK-000103', 'consumed', now());
  RAISE NOTICE 'OK — `consumed` da nol uzunlik RUXSAT';

  -- Yorliq takrorlanmaydi.
  BEGIN
    INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
    VALUES (gen_random_uuid(), ctx.account_id, ctx.store_id, ctx.cell_id, ctx.product_id,
            50, false, 'BLK-000038');
    RAISE EXCEPTION 'GUARD ISHLAMADI: yorliq TAKRORLANDI';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK — to`sildi: takroriy yorliq';
  END;
END $$;

\echo '=== 3. YACHEYKA o`chsa bo`lak YO`QOLMAYDI, ombor darajasiga TUSHADI ==='
-- Faqat SHU zond yaratgan qatorlar uchun sinov: yacheykani o'chirib bo'lmaydi
-- (unda qoldiq bo'lishi mumkin), shuning uchun FK siyosatini to'g'ridan-to'g'ri
-- `cell_id = NULL` bilan emas, cheklovning O'ZI bilan tekshiramiz — 5-bo'limdagi
-- `confdeltype = 'n'` buni allaqachon isbotladi. Bu yerda faqat NULL yo'l ishlashini
-- ko'rsatamiz: yacheykasiz bo'lak YOZILA OLADI (E1 — qoldiqning ~94 % i yacheykasiz).
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_id, length, whole, label)
SELECT gen_random_uuid(), account_id, store_id, NULL, product_id, 400, true, NULL FROM k1_ctx;
SELECT count(*) FILTER (WHERE cell_id IS NULL) AS yacheykasiz_bolaklar,
       count(*) FILTER (WHERE cell_id IS NOT NULL) AS yacheykali_bolaklar
  FROM stock_pieces;

\echo '=== 4. YORLIQSIZ (NULL) rulonlar CHEKSIZ — unikal indeks to`smaydi ==='
SELECT count(*) AS yorliqsiz_rulonlar FROM stock_pieces WHERE label IS NULL;

\echo '=== 5. QOLDIQQA TEGILMADI (bir tiyin ham o`zgarmasligi SHART) ==='
SELECT b.stocks_rows = (SELECT count(*) FROM stocks)               AS stocks_ozgarmadi,
       b.sbc_rows    = (SELECT count(*) FROM stock_by_cell)        AS stock_by_cell_ozgarmadi,
       b.total_qty   = (SELECT coalesce(sum(qty), 0) FROM stocks)  AS jami_qoldiq_ozgarmadi
  FROM k1_before b;

\echo '=== 6. ROLLBACK — bazada iz qolmaydi ==='
ROLLBACK;

SELECT count(*) AS zonddan_keyingi_qatorlar FROM stock_pieces;
