-- Kiosk rejim + POS PIN-qulf (kassa TZ §3.1, §3.2 — bosqich 1-B4).
--
-- roles.ui_mode         — `full` (butun ERP) yoki `kiosk` (faqat POS).
--   Sukut `full`: kiosk OPT-IN, mavjud xodimlarning HECH BIRI bu migratsiyadan
--   keyin cheklanmaydi. Bir xodimda bir necha rol bo'lsa `full` yutadi.
-- employees.pos_pin_hash — bcrypt xesh (4–6 raqam). NULL = PIN o'rnatilmagan.
--
-- ⚠️ Faqat UI'da yashirish YETARLI EMAS — server tomonda `KioskGuard` ham
-- cheklaydi (bevosita URL bilan kirishni bloklaydi).
--
-- Qaytarish: ALTER TABLE ... DROP COLUMN (ikkalasi).

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "ui_mode" VARCHAR(10) NOT NULL DEFAULT 'full';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pos_pin_hash" VARCHAR(255);
