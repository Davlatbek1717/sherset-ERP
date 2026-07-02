-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "variant_id" UUID,
ALTER COLUMN "product_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "product_packs" ADD COLUMN     "variant_id" UUID,
ALTER COLUMN "product_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "author_application" VARCHAR(100),
ADD COLUMN     "done" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "operation" VARCHAR(100);

-- AlterTable
ALTER TABLE "variants" ADD COLUMN     "barcodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discount_prohibited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimum_balance_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "product_images_account_id_variant_id_position_idx" ON "product_images"("account_id", "variant_id", "position");

-- CreateIndex
CREATE INDEX "product_packs_account_id_variant_id_idx" ON "product_packs"("account_id", "variant_id");

-- CreateIndex
CREATE INDEX "tasks_account_id_agent_id_idx" ON "tasks"("account_id", "agent_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
