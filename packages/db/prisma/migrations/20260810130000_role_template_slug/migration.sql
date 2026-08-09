-- MK29 — rol shabloni provenance ustuni (TZ §3.4, QAROR-B4.1).
--
-- `roles.name` foydalanuvchi tahrirlaydigan matn: admin rolni qayta nomlashi
-- bilan «bu rol qaysi shablondan» aloqasi jimgina uzilardi va ru interfeysda
-- o'zbekcha nom turaverardi. Barqaror kalit shu ustunda; ko'rinadigan yorliq
-- i18n'da (`pages.roleTemplates.<slug>`).
--
-- ⚠️ Bu migratsiya HECH KIMNING amaldagi ruxsatini o'zgartirmaydi — faqat
-- yorliq qo'yadi. `role_permissions` ga TEGILMAYDI.

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "template_slug" VARCHAR(40);

-- Backfill — FAQAT ikki aniq moslik (QAROR-B4.1):
--   AccountOwner  → owner   (moysklad «Владелец аккаунта», singleton)
--   Administrator → admin   (seed qilingan to'liq kirish roli)
--
-- `Manager` / `Employee` / `ReadOnly` / `PointOfSale` ATAYLAB bo'sh qoladi:
-- ular TZ §3.4 shablonlari EMAS, eski seed rollari. Ularni «eng o'xshash»
-- shablonga bog'lash provenance'ni yolg'onlashtirardi — keyin kimdir
-- shablonni qayta qo'llaganda o'sha rolning matritsasi kutilmaganda
-- almashib ketardi.
UPDATE "roles" SET "template_slug" = 'owner'
  WHERE "name" = 'AccountOwner' AND "template_slug" IS NULL;

UPDATE "roles" SET "template_slug" = 'admin'
  WHERE "name" = 'Administrator' AND "template_slug" IS NULL;

-- Ro'yxatlash uchun (akkaunt ichida shablon bo'yicha qidiruv).
CREATE INDEX IF NOT EXISTS "roles_account_id_template_slug_idx"
    ON "roles"("account_id", "template_slug");
