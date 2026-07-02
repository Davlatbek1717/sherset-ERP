-- AlterTable
ALTER TABLE "demands" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "demands_account_id_contract_id_idx" ON "demands"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "demands_account_id_project_id_idx" ON "demands"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
