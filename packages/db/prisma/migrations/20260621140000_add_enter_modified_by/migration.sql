-- «Кто изменил» — Enter.modifiedById (last editor), mirrors Move.modifiedById.
-- AlterTable
ALTER TABLE "enters" ADD COLUMN "modified_by_id" UUID;

-- CreateIndex
CREATE INDEX "enters_account_id_modified_by_id_idx" ON "enters"("account_id", "modified_by_id");

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
