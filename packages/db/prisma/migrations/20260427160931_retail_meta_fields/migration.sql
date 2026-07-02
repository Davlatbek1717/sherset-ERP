-- AlterTable
ALTER TABLE "cashier_sessions" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "bank_commission_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "bank_percent" DECIMAL(5,2),
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "name" VARCHAR(100) NOT NULL DEFAULT '',
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "printed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proceeds_cash_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "proceeds_no_cash_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qr_bank_commission_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "qr_bank_percent" DECIMAL(5,2),
ADD COLUMN     "received_cash_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "received_no_cash_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vat_included" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "retail_sales" ADD COLUMN     "advance_payment_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "agent_account_id" UUID,
ADD COLUMN     "applicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "customer_order_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "no_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "organization_account_id" UUID,
ADD COLUMN     "organization_id" UUID,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "prepayment_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "prepayment_no_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "prepayment_qr_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "printed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qr_sum_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "rate_value" BIGINT NOT NULL DEFAULT 100000000,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "store_id" UUID,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "tax_system" VARCHAR(30),
ADD COLUMN     "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vat_included" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "retail_sales_account_id_customer_order_id_idx" ON "retail_sales"("account_id", "customer_order_id");

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
