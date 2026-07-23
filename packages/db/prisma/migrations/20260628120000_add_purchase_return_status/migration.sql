-- moysklad «Статус» on «Возврат поставщику» (PurchaseReturn) — account-defined
-- custom status (State row, entityType="purchasereturn"), mirroring Supply.statusId
-- and PurchaseOrder.statusId. Orthogonal to the FSM `state` column + the
-- «Проведено» flag: the toolbar «Статус» menu sets it on the selected returns;
-- the header pill shows a grey «Статус» until the admin creates statuses in
-- Настройки. SetNull so deleting a status just unlinks the returns that used it.
ALTER TABLE "purchase_returns" ADD COLUMN     "status_id" UUID;

ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
