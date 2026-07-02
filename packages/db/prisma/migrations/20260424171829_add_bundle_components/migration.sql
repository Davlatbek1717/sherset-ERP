-- CreateTable
CREATE TABLE "bundle_components" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "component_product_id" UUID,
    "component_variant_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bundle_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bundle_components_account_id_bundle_id_idx" ON "bundle_components"("account_id", "bundle_id");

-- CreateIndex
CREATE INDEX "bundle_components_account_id_component_product_id_idx" ON "bundle_components"("account_id", "component_product_id");

-- CreateIndex
CREATE INDEX "bundle_components_account_id_component_variant_id_idx" ON "bundle_components"("account_id", "component_variant_id");

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
