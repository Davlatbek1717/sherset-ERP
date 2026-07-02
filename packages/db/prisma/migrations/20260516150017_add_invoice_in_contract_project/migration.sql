-- AlterTable
ALTER TABLE "invoices_in" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "invoices_in_account_id_contract_id_idx" ON "invoices_in"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "invoices_in_account_id_project_id_idx" ON "invoices_in"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices_in" ADD CONSTRAINT "invoices_in_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
