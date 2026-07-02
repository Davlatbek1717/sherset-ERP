-- CreateTable
CREATE TABLE "invoices_in" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "incoming_number" VARCHAR(100),
    "incoming_date" TIMESTAMPTZ,
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_planned_moment" TIMESTAMPTZ,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "invoices_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_in_positions" (
    "id" UUID NOT NULL,
    "invoice_in_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "purchase_order_position_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "invoice_in_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_in_account_id_state_deleted_at_idx" ON "invoices_in"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "invoices_in_account_id_agent_id_idx" ON "invoices_in"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "invoices_in_account_id_purchase_order_id_idx" ON "invoices_in"("account_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "invoices_in_account_id_moment_idx" ON "invoices_in"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "invoices_in_account_id_owner_id_idx" ON "invoices_in"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_in_account_id_name_key" ON "invoices_in"("account_id", "name");

-- CreateIndex
CREATE INDEX "invoice_in_positions_invoice_in_id_position_idx" ON "invoice_in_positions"("invoice_in_id", "position");

-- CreateIndex
CREATE INDEX "invoice_in_positions_account_id_assortment_kind_assortment__idx" ON "invoice_in_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "invoice_in_positions_account_id_purchase_order_position_id_idx" ON "invoice_in_positions"("account_id", "purchase_order_position_id");

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_in_positions" ADD CONSTRAINT "invoice_in_positions_invoice_in_id_fkey" FOREIGN KEY ("invoice_in_id") REFERENCES "invoices_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_in_positions" ADD CONSTRAINT "invoice_in_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_in_positions" ADD CONSTRAINT "invoice_in_positions_purchase_order_position_id_fkey" FOREIGN KEY ("purchase_order_position_id") REFERENCES "purchase_order_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
