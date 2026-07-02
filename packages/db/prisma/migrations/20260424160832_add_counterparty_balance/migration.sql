-- CreateTable
CREATE TABLE "counterparty_balances" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparty_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counterparty_balances_account_id_counterparty_id_idx" ON "counterparty_balances"("account_id", "counterparty_id");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_balances_counterparty_id_currency_key" ON "counterparty_balances"("counterparty_id", "currency");

-- AddForeignKey
ALTER TABLE "counterparty_balances" ADD CONSTRAINT "counterparty_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_balances" ADD CONSTRAINT "counterparty_balances_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
