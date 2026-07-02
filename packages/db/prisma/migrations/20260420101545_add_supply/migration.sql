-- CreateTable
CREATE TABLE "supplies" (
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
    "incoming_date" TIMESTAMPTZ,
    "incoming_number" VARCHAR(50),
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

    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_positions" (
    "id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "remaining_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cost_minor" BIGINT,

    CONSTRAINT "supply_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplies_account_id_state_deleted_at_idx" ON "supplies"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "supplies_account_id_agent_id_idx" ON "supplies"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "supplies_account_id_store_id_applicable_idx" ON "supplies"("account_id", "store_id", "applicable");

-- CreateIndex
CREATE INDEX "supplies_account_id_moment_idx" ON "supplies"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "supplies_account_id_owner_id_idx" ON "supplies"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplies_account_id_name_key" ON "supplies"("account_id", "name");

-- CreateIndex
CREATE INDEX "supply_positions_supply_id_position_idx" ON "supply_positions"("supply_id", "position");

-- CreateIndex
CREATE INDEX "supply_positions_account_id_assortment_kind_assortment_id_idx" ON "supply_positions"("account_id", "assortment_kind", "assortment_id");

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
