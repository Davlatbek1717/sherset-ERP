-- HR-13 (Faza Q7) — HrAttendance soft-delete.
--
-- `HrAttendanceService.delete()` hard-delete qilardi: (a) davomat tarixi izsiz
-- yo'qolardi (auditsiz), (b) `hr_bonus_fine_log.attendance_id` xom FK bo'lgani
-- uchun `auto_late` jarima yetim qolib oylikdan pul ushlab turaverardi.
--
-- Ikkala ustun ham NULLABLE, default YO'Q ⇒ prod-safe (jadval qayta yozilmaydi,
-- mavjud qatorlar «o'chirilmagan» bo'lib qoladi).
ALTER TABLE "hr_attendance" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "hr_attendance" ADD COLUMN IF NOT EXISTS "deleted_by_id" UUID;
