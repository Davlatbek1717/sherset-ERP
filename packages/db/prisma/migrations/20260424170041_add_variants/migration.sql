-- CreateTable
CREATE TABLE "variants" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "barcode" VARCHAR(50),
    "sale_prices" JSONB,
    "buy_price" BIGINT,
    "min_price" BIGINT,
    "characteristics" JSONB NOT NULL DEFAULT '[]',
    "weight_g" INTEGER,
    "volume_ml" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variants_account_id_product_id_idx" ON "variants"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "variants_account_id_archived_idx" ON "variants"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "variants_account_id_code_key" ON "variants"("account_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "variants_account_id_barcode_key" ON "variants"("account_id", "barcode");

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
