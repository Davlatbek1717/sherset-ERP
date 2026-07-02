-- AlterTable
ALTER TABLE "customer_orders" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "shipment_address" VARCHAR(500),
ADD COLUMN     "shipment_address_full" JSONB,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "tax_system" VARCHAR(30);

-- CreateIndex
CREATE INDEX "customer_orders_account_id_sales_channel_id_idx" ON "customer_orders"("account_id", "sales_channel_id");

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
