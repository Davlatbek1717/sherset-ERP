-- `hr_kpi_daily_log.date` yorlig'ini BIR KUNGA oldinga suradi (4M.3 qarzi).
--
-- MUAMMO: `hr-kpi.service.ts` yorliqni `Date.UTC(startOfLocalDay(...).getUTC*)`
-- dan olardi. Tashkent +05 bo'lgani uchun mahalliy yarim tun UTC'da oldingi
-- kunning 19:00 i — uning UTC kalendar maydonlarini o'qish «kecha» ni beradi.
-- So'rov chegarasi to'g'ri edi, faqat YORLIQ siljigan: 4-avgustni qamragan
-- qator 3-avgust deb yozilgan. Ya'ni MAVJUD HAR BIR QATOR bir kun orqada.
--
-- NEGA ENDI XAVFSIZ: 4M.3 da oylik dvigateli bu jadvaldan o'qishni to'xtatdi
-- (manba — qabul ombori `employee_daily_kpi`). Yorliqni to'g'rilash endi faqat
-- HR «KPI» tab'idagi trend ko'rinishiga ta'sir qiladi, hisoblangan oyliklarga
-- EMAS.
--
-- NEGA IKKI QADAM: `(account_id, employee_id, date)` UNIQUE va Postgres uni
-- HAR QATORDA darhol tekshiradi. Bitta `date + 1 day` da 1-avgust qatori
-- 2-avgustga siljiganda hali mavjud 2-avgust qatori bilan to'qnashardi.
-- Avval hammasini uzoqqa (+10000 kun) surib, keyin qaytarish to'qnashuvni
-- yo'q qiladi (ma'lumot ~2026-05 dan boshlangan, oralik 10000 kundan kichik).
--
-- Qaytarish: teskari yo'nalishda o'sha ikki qadam (−10000, +9999).

UPDATE "hr_kpi_daily_log" SET "date" = "date" + INTERVAL '10000 day';
UPDATE "hr_kpi_daily_log" SET "date" = "date" - INTERVAL '9999 day';
