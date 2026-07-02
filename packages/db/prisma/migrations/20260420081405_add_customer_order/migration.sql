-- CreateTable
CREATE TABLE "customer_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_planned_moment" TIMESTAMPTZ,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "invoiced_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reserved_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "shipped_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_order_positions" (
    "id" UUID NOT NULL,
    "customer_order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "reserved_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "shipped_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_order_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_orders_account_id_state_deleted_at_idx" ON "customer_orders"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "customer_orders_account_id_agent_id_idx" ON "customer_orders"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "customer_orders_account_id_moment_idx" ON "customer_orders"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "customer_orders_account_id_owner_id_idx" ON "customer_orders"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_account_id_name_key" ON "customer_orders"("account_id", "name");

-- CreateIndex
CREATE INDEX "customer_order_positions_customer_order_id_position_idx" ON "customer_order_positions"("customer_order_id", "position");

-- CreateIndex
CREATE INDEX "customer_order_positions_account_id_assortment_kind_assortm_idx" ON "customer_order_positions"("account_id", "assortment_kind", "assortment_id");

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order_positions" ADD CONSTRAINT "customer_order_positions_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order_positions" ADD CONSTRAINT "customer_order_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
