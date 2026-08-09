-- MK31 — kassa smenasining DOLLAR naqd oqimi (kassa TZ §8.1 / §8.4).
--
-- Dollar SENTDA saqlanadi va so'mga o'girilmaydi: §8.4 «USD farqi alohida
-- yuritiladi» — kurs bilan o'girish yo'qolgan dollarni «taxminiy so'm»ga
-- aylantirib, farq aktini dalil bo'lishdan to'xtatardi.
--
-- Uch ustun NULLABLE va `NULL` MA'NOLI: «sanalmagan» ≠ «sanadim, dollar
-- yo'q» (0). Dollarsiz kassalarda ular NULL bo'lib qoladi, ya'ni mavjud
-- smenalar uchun hech narsa o'zgarmaydi va soxta «dollar kamomadi» akti
-- yozilmaydi. Shu sababdan BACKFILL YO'Q.
ALTER TABLE "cashier_sessions"
  ADD COLUMN "opening_cash_usd_minor"  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "closing_cash_usd_minor"  BIGINT,
  ADD COLUMN "expected_cash_usd_minor" BIGINT,
  ADD COLUMN "discrepancy_usd_minor"   BIGINT;
