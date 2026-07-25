-- Kontragent akt-sverka (reconciliation statement) + outbox file attachment.

-- AlterTable: outbox can carry a file to send as a Telegram document.
ALTER TABLE "hr_telegram_outbox" ADD COLUMN "attachment_path" TEXT;

-- CreateTable
CREATE TABLE "counterparty_statement" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "period_from" TIMESTAMPTZ,
    "period_to" TIMESTAMPTZ,
    "file_token" VARCHAR(64) NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "final_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counterparty_statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_statement_file_token_key" ON "counterparty_statement"("file_token");

-- CreateIndex
CREATE INDEX "counterparty_statement_account_id_counterparty_id_created_a_idx" ON "counterparty_statement"("account_id", "counterparty_id", "created_at" DESC);
