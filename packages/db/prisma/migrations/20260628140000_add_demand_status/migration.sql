-- Demand «Статус» — account-defined custom status (State row, entityType="demand"),
-- mirroring Supply.statusId / PurchaseReturn.statusId. onDelete SET NULL: deleting a
-- status just unlinks it from any demands that referenced it.
ALTER TABLE "demands" ADD COLUMN "status_id" UUID;
ALTER TABLE "demands" ADD CONSTRAINT "demands_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
