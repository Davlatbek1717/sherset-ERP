-- Xabar shablon-KUTUBXONASi (Telegram + SMS) — SmsTemplate → MessageTemplate
-- umumlashtirildi (jadval nomi `sms_templates` saqlanadi, @@map). Kanal-aware +
-- bir nechta shablon (kutubxona) uchun `@@unique([account_id, key])` olib
-- tashlanadi. OFFLINE authored (`prisma migrate diff`, lokal Postgres o'chiq) —
-- deploy'da `prisma migrate deploy`.

-- DropIndex
DROP INDEX "sms_templates_account_id_key_key";

-- AlterTable
ALTER TABLE "sms_templates" ADD COLUMN     "channel" VARCHAR(16) NOT NULL DEFAULT 'sms',
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "key" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "sms_templates_account_id_channel_idx" ON "sms_templates"("account_id", "channel");

-- Data backfill: mavjud SMS `debt_reminder` qatorini kanalning ASOSIY (default)
-- shabloni qilamiz — avtomatik-oqim (cron/bulk) uni ishlatishda davom etsin
-- (findByKey → findDefault o'zgarishidan keyin ham xulq buzilmasin).
UPDATE "sms_templates" SET "is_default" = true, "channel" = 'sms'
  WHERE "key" = 'debt_reminder' AND "channel" = 'sms';
