-- Address storage (Адресное хранение товаров) — moysklad parity.
-- StoreZone (Зона) + StoreCell (Ячейка): per-warehouse cell model that replaces
-- the legacy free-text Store.zones/slots placeholder. Tenancy via scalar
-- account_id (mirrors loss_positions); cascade flows through store_id.

-- CreateTable
CREATE TABLE "store_zones" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_cells" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "zone_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "barcode" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_zones_account_id_store_id_idx" ON "store_zones"("account_id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_zones_store_id_name_key" ON "store_zones"("store_id", "name");

-- CreateIndex
CREATE INDEX "store_cells_account_id_store_id_idx" ON "store_cells"("account_id", "store_id");

-- CreateIndex
CREATE INDEX "store_cells_zone_id_idx" ON "store_cells"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_cells_store_id_name_key" ON "store_cells"("store_id", "name");

-- AddForeignKey
ALTER TABLE "store_zones" ADD CONSTRAINT "store_zones_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_cells" ADD CONSTRAINT "store_cells_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_cells" ADD CONSTRAINT "store_cells_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "store_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
