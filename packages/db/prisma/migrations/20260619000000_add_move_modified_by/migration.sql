-- «Кто изменил» — Move.modifiedById (last editor), mirrors PurchaseOrder.modifiedById.
-- AlterTable
ALTER TABLE "moves" ADD COLUMN "modified_by_id" UUID;

-- CreateIndex
CREATE INDEX "moves_account_id_modified_by_id_idx" ON "moves"("account_id", "modified_by_id");

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
