-- Telegram to'liq-tarix sync (Faza-1) — kanonik transkript + backfill job.
-- OFFLINE authored (`prisma migrate diff`, lokal Postgres o'chiq edi) —
-- deploy'da `prisma migrate deploy` bilan qo'llaniladi.
--
-- Chat identifikatsiyasi peer'ning Telegram user-id'si (chatId) bo'yicha —
-- backfill va jonli kiruvchi (handleIncoming) BIR XIL chat qatoriga
-- birlashadi (@@unique([account_id, chat_id]) orqali). counterparty bo'yicha
-- alohida unique QO'YILMAYDI (keraksiz + mavjud data'da xavf tug'dirardi).

-- AlterTable
ALTER TABLE "telegram_chats" ADD COLUMN     "history_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "history_oldest_id" BIGINT,
ADD COLUMN     "sync_newest_id" BIGINT;

-- AlterTable
ALTER TABLE "telegram_chat_messages" ADD COLUMN     "edited_at" TIMESTAMPTZ,
ADD COLUMN     "outbox_ref_id" UUID,
ADD COLUMN     "read_by_peer_at" TIMESTAMPTZ,
ADD COLUMN     "reply_to_tg_message_id" BIGINT;

-- CreateTable
CREATE TABLE "telegram_backfill_job" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'queued',
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "messages_imported" INTEGER NOT NULL DEFAULT 0,
    "cursor_offset_id" BIGINT,
    "fail_reason" VARCHAR(500),

    CONSTRAINT "telegram_backfill_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_backfill_job_status_requested_at_idx" ON "telegram_backfill_job"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_backfill_job_account_id_counterparty_id_key" ON "telegram_backfill_job"("account_id", "counterparty_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chat_messages_chat_ref_id_tg_message_id_key" ON "telegram_chat_messages"("chat_ref_id", "tg_message_id");

-- AddForeignKey
ALTER TABLE "telegram_backfill_job" ADD CONSTRAINT "telegram_backfill_job_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_backfill_job" ADD CONSTRAINT "telegram_backfill_job_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
