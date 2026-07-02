-- AlterTable
ALTER TABLE "purchase_returns" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_contract_id_idx" ON "purchase_returns"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "purchase_returns_account_id_project_id_idx" ON "purchase_returns"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
