-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "modified_by_id" UUID,
ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "purchase_orders_account_id_project_id_idx" ON "purchase_orders"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "purchase_orders_account_id_contract_id_idx" ON "purchase_orders"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "purchase_orders_account_id_modified_by_id_idx" ON "purchase_orders"("account_id", "modified_by_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
