-- 4M.4 — xodimni bo'shatish ro'yxati.
-- Arxivlash login/refresh'ni yopadi, lekin Telegram bog'lami, ochiq smena,
-- qabul qilinmagan KPI kunlari va jihoz ochiq qolaveradi. Ro'yxat tugamaguncha
-- xodim arxivlanmaydi.
CREATE TABLE "employee_offboardings" (
  "id"                UUID PRIMARY KEY,
  "account_id"        UUID NOT NULL,
  "employee_id"       UUID NOT NULL,
  "last_working_day"  DATE,
  "reason"            TEXT,
  "items"             JSONB NOT NULL DEFAULT '{}',
  "started_by_id"     UUID,
  "started_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at"      TIMESTAMPTZ
);

-- Bir xodimda bir vaqtda bitta faol jarayon.
CREATE UNIQUE INDEX "employee_offboardings_employee_id_key"
  ON "employee_offboardings"("employee_id");
CREATE INDEX "employee_offboardings_account_completed_idx"
  ON "employee_offboardings"("account_id", "completed_at");

ALTER TABLE "employee_offboardings"
  ADD CONSTRAINT "employee_offboardings_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_offboardings_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_offboardings_started_by_id_fkey"
    FOREIGN KEY ("started_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
