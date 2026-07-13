-- To'lov valyutasi (2026-07-13): naqd so'mda ham, dollarda ham qabul qilinadi.
--
-- amount_minor HAR DOIM so'm/tiyinda qoladi (qarz hisobi shundan yuritiladi,
-- mavjud qatorlar buzilmaydi). Yangi uchlik ASL to'lovni saqlaydi:
--   currency              'UZS' | 'USD'
--   amount_original_minor asl valyutadagi summa (USD → sent)
--   exchange_rate         kurs ×10000 (12 800,50 so'm → 128005000)
-- Mavjud qatorlar: currency='UZS' (default), original/rate NULL — so'm to'lovi.
ALTER TABLE "debt_payments" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS';
ALTER TABLE "debt_payments" ADD COLUMN "amount_original_minor" BIGINT;
ALTER TABLE "debt_payments" ADD COLUMN "exchange_rate" BIGINT;
