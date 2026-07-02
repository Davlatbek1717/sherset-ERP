-- «Кто изменил» — Counterparty.modifiedById (last editor), mirrors Product.modifiedById.
-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN "modified_by_id" UUID;

-- CreateIndex
CREATE INDEX "counterparties_account_id_modified_by_id_idx" ON "counterparties"("account_id", "modified_by_id");

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
