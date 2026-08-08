-- SALES-04 (Faza 7) — qaytarish chekida qarz hisobidan yopilgan ulush.
--
-- Qarzga sotilgan chek qaytarilganda kassadan pul CHIQMASLIGI kerak (u yerga
-- pul hech qachon kelmagan): mijozning balansidagi qarz shu summaga kamayadi.
-- Ustun ketma-ket qisman qaytarishlarning kumulyativ chegarasi uchun ham
-- kerak — har yangi qaytarish oldingilari qancha qarz yopganini shundan
-- o'qiydi. Sotuv cheklarida doim 0.
ALTER TABLE "retail_sales"
  ADD COLUMN "debt_return_minor" BIGINT NOT NULL DEFAULT 0;
