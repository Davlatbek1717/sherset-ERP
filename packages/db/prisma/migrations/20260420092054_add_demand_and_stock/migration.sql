-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "demands" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_order_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "cost_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_positions" (
    "id" UUID NOT NULL,
    "demand_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "customer_order_position_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cost_minor" BIGINT,

    CONSTRAINT "demand_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_operations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "qty_delta" DECIMAL(20,6) NOT NULL,
    "cost_delta_minor" BIGINT,
    "doc_type" VARCHAR(30) NOT NULL,
    "doc_id" UUID NOT NULL,
    "doc_position_id" UUID,
    "reason" VARCHAR(30) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "stock_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reserved_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "in_transit_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("account_id","store_id","assortment_kind","assortment_id")
);

-- CreateIndex
CREATE INDEX "demands_account_id_state_deleted_at_idx" ON "demands"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "demands_account_id_agent_id_idx" ON "demands"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "demands_account_id_store_id_applicable_idx" ON "demands"("account_id", "store_id", "applicable");

-- CreateIndex
CREATE INDEX "demands_account_id_customer_order_id_idx" ON "demands"("account_id", "customer_order_id");

-- CreateIndex
CREATE INDEX "demands_account_id_moment_idx" ON "demands"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "demands_account_id_owner_id_idx" ON "demands"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "demands_account_id_name_key" ON "demands"("account_id", "name");

-- CreateIndex
CREATE INDEX "demand_positions_demand_id_position_idx" ON "demand_positions"("demand_id", "position");

-- CreateIndex
CREATE INDEX "demand_positions_account_id_assortment_kind_assortment_id_idx" ON "demand_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "demand_positions_account_id_customer_order_position_id_idx" ON "demand_positions"("account_id", "customer_order_position_id");

-- CreateIndex
CREATE INDEX "stock_operations_account_id_store_id_assortment_kind_assort_idx" ON "stock_operations"("account_id", "store_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "stock_operations_account_id_doc_type_doc_id_idx" ON "stock_operations"("account_id", "doc_type", "doc_id");

-- CreateIndex
CREATE INDEX "stock_operations_account_id_occurred_at_idx" ON "stock_operations"("account_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "stocks_account_id_assortment_kind_assortment_id_idx" ON "stocks"("account_id", "assortment_kind", "assortment_id");

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_positions" ADD CONSTRAINT "demand_positions_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_positions" ADD CONSTRAINT "demand_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_positions" ADD CONSTRAINT "demand_positions_customer_order_position_id_fkey" FOREIGN KEY ("customer_order_position_id") REFERENCES "customer_order_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
