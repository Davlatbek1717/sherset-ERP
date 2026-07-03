-- Multi-bin: additional shelf locations per product (address-only, Phase 1).
-- CreateTable
CREATE TABLE "product_locations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sklad" INTEGER NOT NULL,
    "polka" INTEGER,
    "qavat" INTEGER,
    "yacheyka" INTEGER,
    "note" VARCHAR(255),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_locations_product_id_sklad_polka_qavat_yacheyka_key" ON "product_locations"("product_id", "sklad", "polka", "qavat", "yacheyka");

-- CreateIndex
CREATE INDEX "product_locations_account_id_product_id_idx" ON "product_locations"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "product_locations_account_id_sklad_idx" ON "product_locations"("account_id", "sklad");

-- AddForeignKey
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
