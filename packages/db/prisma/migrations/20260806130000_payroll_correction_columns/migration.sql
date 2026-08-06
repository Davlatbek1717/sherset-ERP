-- TZ §3.4 — oylik qatorida tuzatma summalari.
-- Qo'shimcha to'lov va ushlanma alohida: buxgalter hujjatda ikkalasini
-- alohida qator qilib ko'rsatadi.
ALTER TABLE "hr_kpi_monthly_score" ADD COLUMN "correction_increase_minor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "hr_kpi_monthly_score" ADD COLUMN "correction_decrease_minor" BIGINT NOT NULL DEFAULT 0;
