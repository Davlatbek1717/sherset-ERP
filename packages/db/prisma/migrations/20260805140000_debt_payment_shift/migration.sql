-- Qarz to'lovi qaysi kassa SMENASIDA qabul qilingani (kassa TZ §7.2/6-qadam).
--
-- Busiz naqd qarz to'lovi smena yakunidagi «kutilgan naqd» hisobiga KIRMASDI:
-- pul yashiqda turadi-yu, kutilganda ko'rinmaydi → har smenada soxta ORTIQCHA
-- (излишек) chiqib, farq akti ma'nosini yo'qotardi.
--
-- `cash_desk_id` yetarli emas — bitta kassada kun davomida bir necha smena
-- bo'ladi. NULL = POS'dan tashqarida qabul qilingan to'lov.
--
-- Qaytarish: ALTER TABLE "debt_payments" DROP COLUMN "retail_shift_id";

ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "retail_shift_id" UUID;
CREATE INDEX IF NOT EXISTS "debt_payments_retail_shift_id_idx" ON "debt_payments"("retail_shift_id");
