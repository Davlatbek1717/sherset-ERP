-- K1 migratsiyasini LOKAL dev bazada TEKSHIRISH (F-reja 2-bo'lim, 7-qoida).
-- Bu fayl FAQAT O'QIYDI — hech narsa yozmaydi.
-- Migratsiya IKKI MARTA yugurtirilgandan KEYIN yugurtiriladi.
--
--   cd packages/db && psql -h localhost -U postgres -d sherset_v2_dev \
--     -f ../../apps/api/src/scripts/k1-local-stock-piece-verify.sql

\echo '=== 1. products.piece_tracked USTUNI (BOOLEAN NOT NULL DEFAULT false) ==='
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'products' AND column_name = 'piece_tracked';

\echo '=== 2. MAVJUD TOVARLARDA bayroq holati (hammasi FALSE bo`lishi SHART) ==='
SELECT piece_tracked, count(*) AS tovarlar
  FROM products
 GROUP BY piece_tracked
 ORDER BY piece_tracked;

\echo '=== 3. stock_pieces USTUNLARI ==='
SELECT column_name, data_type, character_maximum_length, numeric_precision,
       numeric_scale, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'stock_pieces'
 ORDER BY ordinal_position;

\echo '=== 4. CHECK cheklovlari (modelning qat`iy qoidalari) ==='
SELECT con.conname, pg_get_constraintdef(con.oid) AS ta_rif
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE rel.relname = 'stock_pieces' AND con.contype = 'c'
 ORDER BY con.conname;

\echo '=== 5. FK SIYOSATI (c=cascade, r=restrict, n=set null) ==='
SELECT con.conname, con.confdeltype AS ochirish_siyosati,
       pg_get_constraintdef(con.oid) AS ta_rif
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE rel.relname = 'stock_pieces' AND con.contype = 'f'
 ORDER BY con.conname;

\echo '=== 6. INDEKSLAR (nomlari Prisma nikiga AYNAN mos bo`lishi SHART) ==='
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'stock_pieces'
 ORDER BY indexname;

\echo '=== 7. REYESTR HOLATI (K1 dan keyin 0 bo`lishi SHART — hech kim yozmaydi) ==='
SELECT count(*) FILTER (WHERE status = 'active') AS faol_bolaklar,
       count(*)                                  AS jami_qatorlar
  FROM stock_pieces;

\echo '=== 8. QOLDIQQA TEGILMAGANI (K1 hech bir qoldiq qatorini o`zgartirmaydi) ==='
SELECT (SELECT count(*) FROM stocks)        AS stocks_qatorlari,
       (SELECT count(*) FROM stock_by_cell) AS stock_by_cell_qatorlari,
       (SELECT sum(qty) FROM stocks)        AS jami_qoldiq;
