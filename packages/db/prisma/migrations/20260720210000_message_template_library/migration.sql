-- Xabar shablon-KUTUBXONASi (Telegram + SMS) — SmsTemplate → MessageTemplate
-- umumlashtirildi (jadval nomi `sms_templates` saqlanadi, @@map). Kanal-aware +
-- bir nechta shablon (kutubxona) uchun `@@unique([account_id, key])` olib
-- tashlanadi. OFFLINE authored (`prisma migrate diff`, lokal Postgres o'chiq).
--
-- IDEMPOTENT (IF EXISTS/IF NOT EXISTS) — Phase-2 lokal validatsiyada aniqlandi:
-- lokal dev DB `prisma db push` bilan sxemaga oldindan moslangan edi (kanal/
-- is_default/index bor, eski unique yo'q) → oddiy `DROP INDEX` allaqachon
-- yo'q indeksda yiqilardi. Idempotent shakl HAM toza prod DB (eski unique
-- `sms_templates_account_id_key_key` mavjud — original 20260720170000
-- migratsiyasi yaratgan), HAM qisman-qo'llangan lokal DB'da xavfsiz ishlaydi.

-- DropIndex (eski @@unique([account_id, key]) — kutubxona uchun kerak emas)
DROP INDEX IF EXISTS "sms_templates_account_id_key_key";

-- AlterTable
ALTER TABLE "sms_templates" ADD COLUMN IF NOT EXISTS "channel" VARCHAR(16) NOT NULL DEFAULT 'sms',
ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sms_templates" ALTER COLUMN "key" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sms_templates_account_id_channel_idx" ON "sms_templates"("account_id", "channel");

-- Data backfill: mavjud SMS `debt_reminder` qatorini kanalning ASOSIY (default)
-- shabloni qilamiz — avtomatik-oqim (cron/bulk) uni ishlatishda davom etsin
-- (findByKey → findDefault o'zgarishidan keyin ham xulq buzilmasin).
UPDATE "sms_templates" SET "is_default" = true, "channel" = 'sms'
  WHERE "key" = 'debt_reminder' AND "channel" = 'sms';
