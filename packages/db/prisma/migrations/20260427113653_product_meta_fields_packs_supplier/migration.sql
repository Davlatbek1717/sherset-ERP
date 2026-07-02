-- AlterTable
ALTER TABLE "products" ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "in_transit_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "minimum_balance_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "partial_disposal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "path_name" VARCHAR(500),
ADD COLUMN     "payment_item_type" VARCHAR(40),
ADD COLUMN     "reserve_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "stock_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "supplier_id" UUID;

-- CreateTable
CREATE TABLE "product_packs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "uom_code" VARCHAR(20) NOT NULL,
    "multiplier" BIGINT NOT NULL,
    "barcode" VARCHAR(50),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_packs_account_id_product_id_idx" ON "product_packs"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "products_account_id_supplier_id_idx" ON "products"("account_id", "supplier_id");

-- CreateIndex
CREATE INDEX "products_account_id_group_id_idx" ON "products"("account_id", "group_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
