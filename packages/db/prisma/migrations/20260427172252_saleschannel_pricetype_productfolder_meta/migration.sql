-- AlterTable
ALTER TABLE "price_types" ADD COLUMN     "external_code" VARCHAR(50);

-- AlterTable
ALTER TABLE "product_folders" ADD COLUMN     "effective_vat" INTEGER,
ADD COLUMN     "effective_vat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales_channels" ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_code" VARCHAR(50),
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" VARCHAR(30);

-- AddForeignKey
ALTER TABLE "product_folders" ADD CONSTRAINT "product_folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_folders" ADD CONSTRAINT "product_folders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
