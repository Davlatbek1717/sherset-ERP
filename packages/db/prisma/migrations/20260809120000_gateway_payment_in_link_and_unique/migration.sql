-- Faza 19 (audit INT-02 + INT-04) — to'lov-gateway'ni ERP moliyasiga ulash.
--
-- 1) payment_gateway_txs.payment_in_id — capture natijasida tug'ilgan PaymentIn
--    hujjatiga havola (INT-02). Shu havola bo'lmagani uchun Payme/Click orqali
--    kelgan pul daftarda umuman ko'rinmasdi. NULL + error_msg to'ldirilgan =
--    capture bo'ldi-yu hujjat yozilmadi (keyingi provider-retry qayta urinadi).
-- 2) UNIQUE (account_id, provider, provider_tx_id) — provider retry'i (protokolda
--    NORMAL holat) har safar yangi qator yaratardi (INT-04). Postgres NULL'larni
--    o'zaro TENG DEB HISOBLAMAYDI, shuning uchun operator boshlagan qatorlar
--    (initiatePayment, provider_tx_id IS NULL) cheklovga tushmaydi — ular
--    avvalgidek bir nechta bo'la oladi.
--
-- ⚠️ Agar bazada allaqachon dublikat (account_id, provider, provider_tx_id)
--    uchligi bo'lsa, CREATE UNIQUE INDEX YIQILADI. Bu ataylab: pul qatorlarini
--    jimgina o'chirib yuborish emas, operator qo'lda ko'rib chiqishi kerak.
--    Dublikatlarni topish:
--      SELECT account_id, provider, provider_tx_id, COUNT(*)
--        FROM payment_gateway_txs WHERE provider_tx_id IS NOT NULL
--       GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--    (Lokal `climart_adopt`da tekshirildi: jadval bo'sh — 0 qator, 0 dublikat.)

ALTER TABLE "payment_gateway_txs" ADD COLUMN IF NOT EXISTS "payment_in_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_gateway_txs_payment_in_id_fkey'
  ) THEN
    ALTER TABLE "payment_gateway_txs"
      ADD CONSTRAINT "payment_gateway_txs_payment_in_id_fkey"
      FOREIGN KEY ("payment_in_id") REFERENCES "payments_in"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_gateway_txs_account_id_provider_provider_tx_id_key"
  ON "payment_gateway_txs" ("account_id", "provider", "provider_tx_id");
