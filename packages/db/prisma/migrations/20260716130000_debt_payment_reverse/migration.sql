-- TO'LOVNI QAYTARISH — storno (2026-07-16 talab).
--
-- Xato kiritilgan qarz to'lovi JISMONAN O'CHIRILMAYDI (to'lov tarixi — dalil,
-- §3.7 nizolarda ochib ko'riladi): reversed_at belgilanadi. Qoida:
--   reversed_at IS NULL      → jonli to'lov (paidMinor/balans/hisobotlarga kiradi)
--   reversed_at IS NOT NULL  → qaytarilgan (yig'indilardan chiqadi, ro'yxatda
--                              «qaytarilgan» belgisi bilan qoladi)
-- reversed_by_id — kim qaytargani, reverse_reason — nega (majburiy, API darajasida).
--
-- Additive: mavjud qatorlarda reversed_at = NULL — hech narsa o'zgarmaydi.

ALTER TABLE "debt_payments" ADD COLUMN "reversed_at" TIMESTAMPTZ;
ALTER TABLE "debt_payments" ADD COLUMN "reversed_by_id" UUID;
ALTER TABLE "debt_payments" ADD COLUMN "reverse_reason" TEXT;

ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_reversed_by_id_fkey"
  FOREIGN KEY ("reversed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
