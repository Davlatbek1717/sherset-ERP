-- MK01 / QAROR-B1 — kunlik KPI qabuli → bonus/jarima kanali.
--
-- Yangi JADVAL kerak emas (`hr_bonus_fine_log` mavjud), lekin ikkita bog'lanish
-- kerak va ularning ishi HAR XIL:
--   • daily_kpi_id — SO'ROV anchor'i: bekor qilishda kunning sof qoldig'i shu
--     bo'yicha yig'iladi va nolga keltiriladi (zero-sum, o'chirish emas);
--   • kpi_event_id — TABIIY KALIT: bir FSM o'tishi → har `kind` dan ko'pi bilan
--     bitta yozuv. Mavjud `uq_bonusfine_attendance_source` bu ish uchun
--     yaramaydi: `attendance_id` NULL bo'lgani uchun PostgreSQL'da NULL'lar
--     to'qnashmaydi va (NULL,'kpi_accept') qatorlari cheksiz takrorlanardi.
--
-- FK'lar SET NULL: kun yoki hodisa qatori o'chsa ham PUL YOZUVI qoladi
-- (audit izi). CASCADE bo'lsa to'langan bonus jimgina yo'qolardi.

ALTER TABLE "hr_bonus_fine_log" ADD COLUMN "daily_kpi_id" UUID;
ALTER TABLE "hr_bonus_fine_log" ADD COLUMN "kpi_event_id" UUID;

CREATE UNIQUE INDEX "uq_bonusfine_kpi_event_kind"
  ON "hr_bonus_fine_log"("kpi_event_id", "kind");

CREATE INDEX "hr_bonus_fine_log_account_id_daily_kpi_id_idx"
  ON "hr_bonus_fine_log"("account_id", "daily_kpi_id");

ALTER TABLE "hr_bonus_fine_log"
  ADD CONSTRAINT "hr_bonus_fine_log_daily_kpi_id_fkey"
  FOREIGN KEY ("daily_kpi_id") REFERENCES "employee_daily_kpi"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hr_bonus_fine_log"
  ADD CONSTRAINT "hr_bonus_fine_log_kpi_event_id_fkey"
  FOREIGN KEY ("kpi_event_id") REFERENCES "employee_daily_kpi_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
