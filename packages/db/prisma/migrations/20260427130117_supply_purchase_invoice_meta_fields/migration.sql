-- AlterTable
ALTER TABLE "invoices_in" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shipped_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "store_id" UUID,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "invoices_out" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "shipped_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "store_id" UUID,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "shipped_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "wait_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "supplies" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "overhead_currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "overhead_distribution" VARCHAR(20) NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "overhead_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID;

-- CreateIndex
CREATE INDEX "invoices_out_account_id_sales_channel_id_idx" ON "invoices_out"("account_id", "sales_channel_id");

-- AddForeignKey
ALTER TABLE "invoices_out" ADD CONSTRAINT "invoices_out_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_out" ADD CONSTRAINT "invoices_out_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_out" ADD CONSTRAINT "invoices_out_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_out" ADD CONSTRAINT "invoices_out_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
