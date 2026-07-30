-- Faza D1: xodim Telegram bog'lash (Bot API chat_id + bir-martalik bind token).
ALTER TABLE "employees" ADD COLUMN "telegram_chat_id" VARCHAR(64);
ALTER TABLE "employees" ADD COLUMN "telegram_bind_token" VARCHAR(64);
ALTER TABLE "employees" ADD COLUMN "telegram_bind_token_expires_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "employees_telegram_bind_token_key" ON "employees"("telegram_bind_token");
