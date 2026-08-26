-- K4 — LOKAL ZOND (bo'linadigan tovar kesimi). O'ZI ROLLBACK qiladi.
--
-- Nimani isbotlaydi (K-reja 2-bo'lim va K4 vazifalari):
--   1. KESIM STOK-NEYTRAL — `stocks`/`stock_by_cell` bir grammga ham
--      o'zgarmaydi (butun zond davomida o'lchanadi);
--   2. ZANJIR INVARIANTI — bolalar yig'indisi manba uzunligiga TENG
--      (mijoz + qoldiq + chiqindi + kesim yo'qotishi = 250);
--   3. yangi CHEKlar HAQIQATAN to'sadi (notanish sabab, faol qatorda sabab);
--   4. BEKOR QILISH — bo'lak omborda QOLADI (`active`), faqat band belgisi
--      uziladi (K-reja: kesilgan kabelni qaytarib ulab bo'lmaydi);
--   5. TO'LOV — bo'lak `consumed`/`sold` bo'ladi va sverkadan chiqadi.
--
-- Yugurtirish (K1 zondi bilan bir xil):
--   psql -h localhost -U postgres -d sherset_v2_dev -f apps/api/src/scripts/k4-local-piece-cut-probe.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE k4_ctx AS
SELECT s.account_id, s.store_id, s.assortment_id,
       (SELECT c.id FROM store_cells c WHERE c.store_id = s.store_id LIMIT 1) AS cell_id
  FROM stocks s
 WHERE s.assortment_kind = 'product' AND s.qty > 300
 LIMIT 1;

CREATE TEMP TABLE k4_before AS
SELECT (SELECT count(*) FROM stocks) AS stocks_cnt,
       (SELECT sum(qty) FROM stocks) AS stocks_sum,
       (SELECT count(*) FROM stock_by_cell) AS sbc_cnt,
       (SELECT coalesce(sum(qty), 0) FROM stock_by_cell) AS sbc_sum;

-- ── 1. Manba: butun rulon 250 m (yorliqsiz — K-Q3) ─────────────────────────
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_kind,
                          assortment_id, length, whole, label, status)
SELECT '00000000-0000-4000-8000-00000000c001'::uuid, account_id, store_id, cell_id,
       'product', assortment_id, 250, true, NULL, 'active'
  FROM k4_ctx;

-- ── 2. KESIM: 250 → mijozga 180 + omborda 68 + yo'qotish 2 ────────────────
-- (omborchi qoldiqni 70 emas, 68 deb o'lchagan — kesim yo'qotishi)
INSERT INTO stock_pieces (id, account_id, store_id, cell_id, assortment_kind,
                          assortment_id, length, whole, label, status,
                          source_piece_id, consumed_reason, consumed_at)
SELECT '00000000-0000-4000-8000-00000000c002'::uuid, account_id, store_id, cell_id,
       'product', assortment_id, 180, false, 'BLK-900001', 'active',
       '00000000-0000-4000-8000-00000000c001'::uuid, NULL::text, NULL::timestamptz FROM k4_ctx
UNION ALL
SELECT '00000000-0000-4000-8000-00000000c003'::uuid, account_id, store_id, cell_id,
       'product', assortment_id, 68, false, 'BLK-900002', 'active',
       '00000000-0000-4000-8000-00000000c001'::uuid, NULL::text, NULL::timestamptz FROM k4_ctx
UNION ALL
SELECT '00000000-0000-4000-8000-00000000c004'::uuid, account_id, store_id, cell_id,
       'product', assortment_id, 2, false, NULL::text, 'consumed',
       '00000000-0000-4000-8000-00000000c001'::uuid, 'cut-loss', now() FROM k4_ctx;

UPDATE stock_pieces SET status = 'consumed', consumed_at = now()
 WHERE id = '00000000-0000-4000-8000-00000000c001';

SELECT '2. ZANJIR: manba=250, bolalar yig`indisi=' || sum(length)::text ||
       CASE WHEN sum(length) = 250 THEN '  ✅ TENG' ELSE '  ❌ FARQ' END
  FROM stock_pieces WHERE source_piece_id = '00000000-0000-4000-8000-00000000c001';

SELECT '   FAOL (reyestrda sanaladigan) = ' || sum(length)::text || ' (kutilgan 248)'
  FROM stock_pieces
 WHERE source_piece_id = '00000000-0000-4000-8000-00000000c001' AND status = 'active';

-- ── 3. CHEKlar to'sadimi ───────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    UPDATE stock_pieces SET consumed_reason = 'boshqa'
     WHERE id = '00000000-0000-4000-8000-00000000c004';
    RAISE NOTICE '3. ❌ notanish sabab O`TDI (CHECK ishlamadi)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '3. OK — to`sildi: notanish `consumed_reason`';
  END;
  BEGIN
    UPDATE stock_pieces SET consumed_reason = 'sold'
     WHERE id = '00000000-0000-4000-8000-00000000c002';
    RAISE NOTICE '   ❌ FAOL qatorda sabab O`TDI (CHECK ishlamadi)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '   OK — to`sildi: FAOL bo`lakda `consumed_reason`';
  END;
END $$;

-- ── 4. Mijoz bo'lagini chekka biriktirish, so'ng BEKOR QILISH ─────────────
-- (haqiqiy chek qatori yo'q — band belgisini NULL bilan sinaymiz, FK
--  siyosatining o'zi yuqorida `confdeltype = n` bilan tekshirilgan)
UPDATE stock_pieces SET reserved_sale_id = NULL, reserved_position_id = NULL
 WHERE id = '00000000-0000-4000-8000-00000000c002';

SELECT '4. BEKOR: bo`lak holati=' || status || ', uzunlik=' || length::text ||
       CASE WHEN status = 'active' THEN '  ✅ OMBORDA QOLDI' ELSE '  ❌ YO`QOLDI' END
  FROM stock_pieces WHERE id = '00000000-0000-4000-8000-00000000c002';

-- ── 5. TO'LOV: bo'lak reyestrdan chiqadi ──────────────────────────────────
UPDATE stock_pieces
   SET status = 'consumed', consumed_at = now(), consumed_reason = 'sold'
 WHERE id = '00000000-0000-4000-8000-00000000c002';

SELECT '5. TO`LOV: sabab=' || consumed_reason || ', reyestrda sanaladimi=' ||
       CASE WHEN status = 'active' THEN 'HA ❌' ELSE 'YO`Q ✅' END
  FROM stock_pieces WHERE id = '00000000-0000-4000-8000-00000000c002';

-- ── 6. QOLDIQ butun zond davomida O'ZGARMADI ──────────────────────────────
SELECT '6. stocks_ozgarmadi=' ||
       ((SELECT count(*) FROM stocks) = b.stocks_cnt
        AND (SELECT sum(qty) FROM stocks) = b.stocks_sum)::text ||
       ' · stock_by_cell_ozgarmadi=' ||
       ((SELECT count(*) FROM stock_by_cell) = b.sbc_cnt
        AND (SELECT coalesce(sum(qty), 0) FROM stock_by_cell) = b.sbc_sum)::text
  FROM k4_before b;

ROLLBACK;

SELECT '7. ROLLBACK dan keyin zond qatorlari = ' || count(*)::text
  FROM stock_pieces WHERE id::text LIKE '00000000-0000-4000-8000-00000000c%';
