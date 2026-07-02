-- AlterTable
ALTER TABLE "cash_in" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "printed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cash_out" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "expense_item" VARCHAR(100),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "no_closing_docs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "printed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments_in" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments_out" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "expense_item" VARCHAR(100),
ADD COLUMN     "no_closing_docs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "cash_in_account_id_sales_channel_id_idx" ON "cash_in"("account_id", "sales_channel_id");

-- CreateIndex
CREATE INDEX "cash_out_account_id_sales_channel_id_idx" ON "cash_out"("account_id", "sales_channel_id");

-- CreateIndex
CREATE INDEX "payments_in_account_id_sales_channel_id_idx" ON "payments_in"("account_id", "sales_channel_id");

-- CreateIndex
CREATE INDEX "payments_out_account_id_sales_channel_id_idx" ON "payments_out"("account_id", "sales_channel_id");

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
