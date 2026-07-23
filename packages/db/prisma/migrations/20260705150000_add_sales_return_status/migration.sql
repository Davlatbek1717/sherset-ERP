-- moysklad «Статус» on «Возврат покупателя» (SalesReturn) — account-defined
-- custom status (State row, entityType="salesreturn"), mirroring
-- PurchaseReturn.statusId and Supply.statusId. Orthogonal to the FSM `state`
-- column + the «Проведено» flag: the toolbar «Статус» menu sets it on the
-- selected returns; the header pill shows a grey «Статус» until the admin
-- creates statuses in Настройки. SetNull so deleting a status just unlinks
-- the returns that used it.
ALTER TABLE "sales_returns" ADD COLUMN     "status_id" UUID;

ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
