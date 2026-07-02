-- CreateTable
CREATE TABLE "processing_products" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "processing_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "processing_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_products_account_id_processing_id_position_idx" ON "processing_products"("account_id", "processing_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "processing_products_processing_id_product_id_key" ON "processing_products"("processing_id", "product_id");

-- AddForeignKey
ALTER TABLE "processing_products" ADD CONSTRAINT "processing_products_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_products" ADD CONSTRAINT "processing_products_processing_id_fkey" FOREIGN KEY ("processing_id") REFERENCES "processings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_products" ADD CONSTRAINT "processing_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
