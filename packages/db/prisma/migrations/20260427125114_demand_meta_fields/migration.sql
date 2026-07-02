-- AlterTable
ALTER TABLE "demands" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "overhead_currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "overhead_distribution" VARCHAR(20) NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "overhead_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "shipment_address" VARCHAR(500),
ADD COLUMN     "shipment_address_full" JSONB,
ADD COLUMN     "sync_id" UUID;

-- CreateIndex
CREATE INDEX "demands_account_id_sales_channel_id_idx" ON "demands"("account_id", "sales_channel_id");

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
