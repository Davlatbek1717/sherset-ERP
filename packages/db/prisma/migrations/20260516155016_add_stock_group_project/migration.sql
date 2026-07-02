-- AlterTable
ALTER TABLE "enters" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "internal_orders" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "inventories" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "losses" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "moves" ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "enters_account_id_project_id_idx" ON "enters"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "internal_orders_account_id_project_id_idx" ON "internal_orders"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "inventories_account_id_project_id_idx" ON "inventories"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "losses_account_id_project_id_idx" ON "losses"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "moves_account_id_project_id_idx" ON "moves"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
