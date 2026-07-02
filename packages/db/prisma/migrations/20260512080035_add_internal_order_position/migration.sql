-- CreateTable
CREATE TABLE "internal_order_positions" (
    "id" UUID NOT NULL,
    "internal_order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "moved_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "price_minor" BIGINT,
    "vat" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "internal_order_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_order_positions_internal_order_id_position_idx" ON "internal_order_positions"("internal_order_id", "position");

-- CreateIndex
CREATE INDEX "internal_order_positions_account_id_assortment_kind_assortm_idx" ON "internal_order_positions"("account_id", "assortment_kind", "assortment_id");

-- AddForeignKey
ALTER TABLE "internal_order_positions" ADD CONSTRAINT "internal_order_positions_internal_order_id_fkey" FOREIGN KEY ("internal_order_id") REFERENCES "internal_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_order_positions" ADD CONSTRAINT "internal_order_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
