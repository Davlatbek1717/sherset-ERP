-- A1 migratsiyasini LOKAL dev bazada tekshirish (qoida 7).
-- Bu fayl FAQAT O'QIYDI — hech narsa yozmaydi.
-- Migratsiya IKKI MARTA yugurtirilgandan KEYIN yugurtiriladi.

\echo '=== 1. USTUN BORMI (kind, VARCHAR(20), NOT NULL, default other) ==='
SELECT column_name, data_type, character_maximum_length,
       is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'retail_drawer_cash_in'
   AND column_name = 'kind';

\echo '=== 2. IKKI INDEKS BORMI (nomlar Prisma niki bilan AYNAN bir xil) ==='
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'retail_drawer_cash_in'
   AND indexname LIKE '%kind%'
 ORDER BY indexname;

\echo '=== 3. MAVJUD QATORLAR nima bo`ldi (hammasi other bo`lishi SHART) ==='
SELECT kind, count(*) AS qatorlar, sum(sum_minor) AS summa_tiyin
  FROM retail_drawer_cash_in
 GROUP BY kind
 ORDER BY kind;

\echo '=== 4. AVANS hujjatlari (hozircha 0 bo`lishi SHART — kod deploy qilinmagan) ==='
SELECT count(*) AS avans_hujjatlari
  FROM retail_drawer_cash_in
 WHERE kind = 'customer_prepay';

\echo '=== 5. BALANS JURNALIDA customerPrepay qatori (hozircha 0 bo`lishi SHART) ==='
SELECT count(*) AS avans_jurnal_qatorlari
  FROM counterparty_balance_entries
 WHERE doc_type = 'customerPrepay';
