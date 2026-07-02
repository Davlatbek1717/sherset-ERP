-- AlterTable
ALTER TABLE "cash_in" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "cash_out" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "payments_in" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "payments_out" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "prepayment_returns" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- AlterTable
ALTER TABLE "prepayments" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "cash_in_account_id_contract_id_idx" ON "cash_in"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "cash_in_account_id_project_id_idx" ON "cash_in"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "cash_out_account_id_contract_id_idx" ON "cash_out"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "cash_out_account_id_project_id_idx" ON "cash_out"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "payments_in_account_id_contract_id_idx" ON "payments_in"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "payments_in_account_id_project_id_idx" ON "payments_in"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "payments_out_account_id_contract_id_idx" ON "payments_out"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "payments_out_account_id_project_id_idx" ON "payments_out"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "prepayment_returns_account_id_contract_id_idx" ON "prepayment_returns"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "prepayment_returns_account_id_project_id_idx" ON "prepayment_returns"("account_id", "project_id");

-- CreateIndex
CREATE INDEX "prepayments_account_id_contract_id_idx" ON "prepayments"("account_id", "contract_id");

-- CreateIndex
CREATE INDEX "prepayments_account_id_project_id_idx" ON "prepayments"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
