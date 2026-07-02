-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "organization_account_id" UUID;

-- AlterTable
ALTER TABLE "productions" ADD COLUMN     "materials_store_id" UUID,
ADD COLUMN     "production_end" TIMESTAMPTZ,
ADD COLUMN     "production_start" TIMESTAMPTZ,
ADD COLUMN     "project_id" UUID,
ADD COLUMN     "reserve" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "productions_account_id_project_id_idx" ON "productions"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_materials_store_id_fkey" FOREIGN KEY ("materials_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
