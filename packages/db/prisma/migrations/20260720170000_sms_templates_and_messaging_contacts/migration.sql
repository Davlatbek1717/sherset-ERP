-- CompanySettings: customer-facing messaging contact fields (SMS + Telegram reminders).
ALTER TABLE "company_settings"
  ADD COLUMN "messaging_phone" VARCHAR(30),
  ADD COLUMN "messaging_card" VARCHAR(40),
  ADD COLUMN "messaging_card_owner" VARCHAR(120);

-- SmsTemplate: editable per-account SMS templates (multi-purpose, keyed by `key`).
CREATE TABLE "sms_templates" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_templates_account_id_key_key" ON "sms_templates"("account_id", "key");

ALTER TABLE "sms_templates"
  ADD CONSTRAINT "sms_templates_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
