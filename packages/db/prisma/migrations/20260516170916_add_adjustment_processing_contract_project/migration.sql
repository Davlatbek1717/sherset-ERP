-- AlterTable
ALTER TABLE "counterparty_adjustments" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "processing_orders" ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "counterparty_adjustments_account_id_contract_id_idx" ON "counterparty_adjustments"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "counterparty_adjustments_account_id_project_id_idx" ON "counterparty_adjustments"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "processing_orders_account_id_project_id_idx" ON "processing_orders"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "processings_account_id_project_id_idx" ON "processings"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
