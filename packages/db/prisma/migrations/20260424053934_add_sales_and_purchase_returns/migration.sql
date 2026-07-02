-- CreateTable
CREATE TABLE "sales_returns" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "demand_id" UUID,
    "customer_order_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "reason" TEXT,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_positions" (
    "id" UUID NOT NULL,
    "sales_return_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "demand_position_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sales_return_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "supply_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "reason" TEXT,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_positions" (
    "id" UUID NOT NULL,
    "purchase_return_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "supply_position_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_return_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_returns_account_id_state_deleted_at_idx" ON "sales_returns"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "sales_returns_account_id_agent_id_idx" ON "sales_returns"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "sales_returns_account_id_store_id_applicable_idx" ON "sales_returns"("account_id", "store_id", "applicable");

-- CreateIndex
CREATE INDEX "sales_returns_account_id_demand_id_idx" ON "sales_returns"("account_id", "demand_id");

-- CreateIndex
CREATE INDEX "sales_returns_account_id_customer_order_id_idx" ON "sales_returns"("account_id", "customer_order_id");

-- CreateIndex
CREATE INDEX "sales_returns_account_id_moment_idx" ON "sales_returns"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "sales_returns_account_id_owner_id_idx" ON "sales_returns"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_account_id_name_key" ON "sales_returns"("account_id", "name");

-- CreateIndex
CREATE INDEX "sales_return_positions_sales_return_id_position_idx" ON "sales_return_positions"("sales_return_id", "position");

-- CreateIndex
CREATE INDEX "sales_return_positions_account_id_assortment_kind_assortmen_idx" ON "sales_return_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "sales_return_positions_account_id_demand_position_id_idx" ON "sales_return_positions"("account_id", "demand_position_id");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_state_deleted_at_idx" ON "purchase_returns"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_agent_id_idx" ON "purchase_returns"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_store_id_applicable_idx" ON "purchase_returns"("account_id", "store_id", "applicable");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_supply_id_idx" ON "purchase_returns"("account_id", "supply_id");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_moment_idx" ON "purchase_returns"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_owner_id_idx" ON "purchase_returns"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_account_id_name_key" ON "purchase_returns"("account_id", "name");

-- CreateIndex
CREATE INDEX "purchase_return_positions_purchase_return_id_position_idx" ON "purchase_return_positions"("purchase_return_id", "position");

-- CreateIndex
CREATE INDEX "purchase_return_positions_account_id_assortment_kind_assort_idx" ON "purchase_return_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "purchase_return_positions_account_id_supply_position_id_idx" ON "purchase_return_positions"("account_id", "supply_position_id");

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_positions" ADD CONSTRAINT "sales_return_positions_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_positions" ADD CONSTRAINT "sales_return_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_positions" ADD CONSTRAINT "sales_return_positions_demand_position_id_fkey" FOREIGN KEY ("demand_position_id") REFERENCES "demand_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_positions" ADD CONSTRAINT "purchase_return_positions_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_positions" ADD CONSTRAINT "purchase_return_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_positions" ADD CONSTRAINT "purchase_return_positions_supply_position_id_fkey" FOREIGN KEY ("supply_position_id") REFERENCES "supply_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
