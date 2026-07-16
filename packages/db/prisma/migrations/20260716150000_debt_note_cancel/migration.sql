-- QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16 talab).
--
-- Operator «to'ladi / qisman / to'lamadi / qayta qo'ng'iroq» belgisini xato
-- qo'ygan bo'lsa, o'sha amalni QAYTARISH kerak. Yozuv JISMONAN O'CHIRILMAYDI
-- (muloqot tarixi — append-only, §3.4): canceled_at belgilanadi.
--   canceled_at IS NULL     → jonli yozuv (lastCallOutcome hisobiga kiradi)
--   canceled_at IS NOT NULL → bekor qilingan (hisobdan chiqadi, tarixda
--                             «bekor qilingan» ko'rinishida qoladi)
--
-- payment_id — shu qo'ng'iroqda YARATILGAN to'lovga bog'lam: natija bekor
-- qilinganda to'lov ham storno bo'ladi (va aksincha), lastCallOutcome esa
-- qolgan jonli yozuvlardan deterministik qayta hisoblanadi.
--
-- Additive: mavjud qatorlarda hamma yangi ustun NULL — hech narsa o'zgarmaydi.

ALTER TABLE "debt_notes" ADD COLUMN "payment_id" UUID;
ALTER TABLE "debt_notes" ADD COLUMN "canceled_at" TIMESTAMPTZ;
ALTER TABLE "debt_notes" ADD COLUMN "canceled_by_id" UUID;
ALTER TABLE "debt_notes" ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "debt_notes" ADD CONSTRAINT "debt_notes_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "debt_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "debt_notes" ADD CONSTRAINT "debt_notes_canceled_by_id_fkey"
  FOREIGN KEY ("canceled_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
