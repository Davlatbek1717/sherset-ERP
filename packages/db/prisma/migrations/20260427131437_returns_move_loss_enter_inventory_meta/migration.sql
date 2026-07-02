-- AlterTable
ALTER TABLE "enters" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "overhead_currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "overhead_distribution" VARCHAR(20) NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "overhead_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "inventories" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "losses" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "expense_item" VARCHAR(100),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "moves" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "customer_order_id" UUID,
ADD COLUMN     "demand_id" UUID,
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "overhead_currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "overhead_distribution" VARCHAR(20) NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "overhead_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supply_id" UUID,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "purchase_returns" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID;

-- AlterTable
ALTER TABLE "sales_returns" ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_channel_id" UUID,
ADD COLUMN     "sync_id" UUID;

-- CreateIndex
CREATE INDEX "sales_returns_account_id_sales_channel_id_idx" ON "sales_returns"("account_id", "sales_channel_id");

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_sales_channel_id_fkey" FOREIGN KEY ("sales_channel_id") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
