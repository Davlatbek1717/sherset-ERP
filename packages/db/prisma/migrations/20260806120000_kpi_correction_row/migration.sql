-- TZ §3.4 — oylikning tuzatuvchi qatori.
-- Eskirgan kun qayta qabul qilinganda to'langan raqam QAYTA YOZILMAYDI:
-- qabul paytidagi fakt muzlatiladi, farq esa alohida qator bo'lib
-- tuzatma sanasi tushgan oyga kiradi.
ALTER TABLE "employee_daily_kpi" ADD COLUMN "accepted_fact_minor" BIGINT;

CREATE TABLE "employee_kpi_corrections" (
  "id"               UUID PRIMARY KEY,
  "account_id"       UUID NOT NULL,
  "daily_kpi_id"     UUID NOT NULL,
  "employee_id"      UUID NOT NULL,
  "kpi_date"         DATE NOT NULL,
  "period"           VARCHAR(7) NOT NULL,
  "previous_minor"   BIGINT NOT NULL,
  "next_minor"       BIGINT NOT NULL,
  "diff_minor"       BIGINT NOT NULL,
  "direction"        VARCHAR(20) NOT NULL,
  "accepted_by_id"   UUID,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "employee_kpi_corrections_employee_period_idx"
  ON "employee_kpi_corrections"("account_id", "employee_id", "period");
CREATE INDEX "employee_kpi_corrections_period_idx"
  ON "employee_kpi_corrections"("account_id", "period", "created_at" DESC);

ALTER TABLE "employee_kpi_corrections"
  ADD CONSTRAINT "employee_kpi_corrections_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_kpi_corrections_daily_kpi_id_fkey"
    FOREIGN KEY ("daily_kpi_id") REFERENCES "employee_daily_kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_kpi_corrections_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_kpi_corrections_accepted_by_id_fkey"
    FOREIGN KEY ("accepted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
