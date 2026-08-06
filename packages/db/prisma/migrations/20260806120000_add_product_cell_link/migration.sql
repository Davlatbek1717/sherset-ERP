-- Multi-bin (2026-08-06): restores the product↔cell many-to-many binding
-- dropped by 55cf3bf, rebuilt against the current StoreCell model.
-- CreateTable
CREATE TABLE "product_cell_links" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "cell_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cell_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_cell_links_account_id_cell_id_idx" ON "product_cell_links"("account_id", "cell_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_cell_links_product_id_cell_id_key" ON "product_cell_links"("product_id", "cell_id");

-- AddForeignKey
ALTER TABLE "product_cell_links" ADD CONSTRAINT "product_cell_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cell_links" ADD CONSTRAINT "product_cell_links_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
