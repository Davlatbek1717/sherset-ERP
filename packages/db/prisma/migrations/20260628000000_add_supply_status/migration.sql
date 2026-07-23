-- moysklad «Статус» on «Приёмка» (Supply) — account-defined custom status
-- (State row, entityType="supply"), mirroring PurchaseOrder.statusId. Orthogonal
-- to the FSM `state` column + the «Проведено» flag: the toolbar «Статус» menu
-- sets it on the selected receipts; the header pill shows a grey «Статус» until
-- the admin creates statuses in Настройки. SetNull so deleting a status just
-- unlinks the receipts that used it (no cascade).
ALTER TABLE "supplies" ADD COLUMN     "status_id" UUID;

ALTER TABLE "supplies" ADD CONSTRAINT "supplies_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
