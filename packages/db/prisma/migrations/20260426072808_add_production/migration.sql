-- CreateTable
CREATE TABLE "bills_of_materials" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "product_id" UUID NOT NULL,
    "output_qty" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "standard_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bills_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(50) NOT NULL,
    "bom_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "planned_qty" DECIMAL(20,6) NOT NULL,
    "produced_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "planned_start_at" TIMESTAMPTZ,
    "planned_end_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_of_materials_account_id_archived_idx" ON "bills_of_materials"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_materials_account_id_product_id_key" ON "bills_of_materials"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "bom_components_account_id_bom_id_position_idx" ON "bom_components"("account_id", "bom_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "bom_components_bom_id_product_id_key" ON "bom_components"("bom_id", "product_id");

-- CreateIndex
CREATE INDEX "work_orders_account_id_state_deleted_at_idx" ON "work_orders"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "work_orders_account_id_bom_id_idx" ON "work_orders"("account_id", "bom_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_account_id_name_key" ON "work_orders"("account_id", "name");

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
