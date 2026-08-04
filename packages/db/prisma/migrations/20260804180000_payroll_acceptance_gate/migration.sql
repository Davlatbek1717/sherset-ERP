-- Qabul → oylik bloklash (menejer TZ §4, bosqich 4M.3).
--
-- Egasining qarori M-Q8: menejer qabul qilmagan kun oylik hisobiga UMUMAN
-- qo'shilmaydi. Oylik hujjati esa buni KO'RSATISHI kerak — aks holda buxgalter
-- kamaygan raqamni sababsiz deb qabul qilardi (TZ §4.4).
--
-- accepted_days        — oylikka kirgan kunlar soni;
-- pending_days         — qabul kutayotgan kunlar (>0 bo'lsa hisob CHALA);
-- blocked_sales_minor  — bloklangani uchun hisobga kirmagan sotuv summasi.
--
-- Sukut 0: mavjud qatorlar 4M.2 dan oldin hisoblangan va ularda qabul
-- tushunchasi yo'q edi. Ular keyingi qayta hisobda to'g'ri to'ladi
-- (`computeMonthly` idempotent).
--
-- Qaytarish: ALTER TABLE ... DROP COLUMN (uchalasi).

ALTER TABLE "hr_kpi_monthly_score" ADD COLUMN IF NOT EXISTS "accepted_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "hr_kpi_monthly_score" ADD COLUMN IF NOT EXISTS "pending_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "hr_kpi_monthly_score" ADD COLUMN IF NOT EXISTS "blocked_sales_minor" BIGINT NOT NULL DEFAULT 0;
